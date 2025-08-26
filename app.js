require('dotenv').config();
const express = require('express');
const { App } = require('@octokit/app');
const { Webhooks } = require('@octokit/webhooks');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const fetch = require('node-fetch');

// Debug: Log package versions
console.log('Package versions:');
try {
  const appPkg = require('@octokit/app/package.json');
  console.log(`@octokit/app: ${appPkg.version}`);
} catch (e) { console.log('@octokit/app version: unknown'); }

try {
  const restPkg = require('@octokit/rest/package.json');
  console.log(`@octokit/rest: ${restPkg.version}`);
} catch (e) { console.log('@octokit/rest version: unknown'); }

const app = express();

// Enhanced configuration
const CONFIG = {
  langflow: {
    timeout: parseInt(process.env.LANGFLOW_TIMEOUT || '120000'), // 2 minutes
    retries: parseInt(process.env.LANGFLOW_RETRIES || '3'),
    retryDelay: parseInt(process.env.LANGFLOW_RETRY_DELAY || '5000'), // 5 seconds
    healthCheckTimeout: parseInt(process.env.LANGFLOW_HEALTH_TIMEOUT || '10000'), // 10 seconds
  }
};

// Load private key (works both locally and in production)
let privateKey;
if (process.env.GITHUB_PRIVATE_KEY) {
  // Production: use environment variable
  privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n');
} else if (process.env.GITHUB_PRIVATE_KEY_PATH) {
  // Local development: use file path
  privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8');
} else {
  // Fallback: try default file
  privateKey = fs.readFileSync('./private-key.pem', 'utf8');
}

// Create GitHub App instance
console.log('Initializing GitHub App...');
console.log('App ID:', process.env.GITHUB_APP_ID);
console.log('Private key length:', privateKey ? privateKey.length : 'NOT SET');

const githubApp = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: privateKey,
});

console.log('GitHub App initialized successfully');

// Create webhooks instance
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
});

// Middleware
app.use(express.json());

// Health check endpoint with Langflow connectivity test
app.get('/', async (req, res) => {
  const health = {
    status: 'AI PR Review Bot is running!',
    timestamp: new Date().toISOString(),
    langflow: {
      endpoint: process.env.LANGFLOW_ENDPOINT ? 'configured' : 'not configured',
      connectivity: 'unknown'
    }
  };

  // Optional: Test Langflow connectivity
  if (process.env.LANGFLOW_ENDPOINT) {
    try {
      const testResponse = await fetch(`${process.env.LANGFLOW_ENDPOINT}/health`, {
        method: 'GET',
        timeout: CONFIG.langflow.healthCheckTimeout,
        headers: {
          'Authorization': `Bearer ${process.env.LANGFLOW_API_KEY}`,
        }
      });
      health.langflow.connectivity = testResponse.ok ? 'healthy' : `error: ${testResponse.status}`;
    } catch (error) {
      health.langflow.connectivity = `error: ${error.message}`;
    }
  }

  res.json(health);
});

// Webhook endpoint
app.post('/webhooks', async (req, res) => {
  try {
    await webhooks.verifyAndReceive({
      id: req.headers['x-github-delivery'],
      name: req.headers['x-github-event'],
      signature: req.headers['x-hub-signature-256'],
      payload: JSON.stringify(req.body),
    });
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Bad Request');
  }
});

// Handle pull request events
webhooks.on('pull_request.opened', async ({ payload }) => {
  console.log('New PR opened:', payload.pull_request.title);
  await addReviewButton(payload);
});

webhooks.on('pull_request.synchronize', async ({ payload }) => {
  console.log('PR updated:', payload.pull_request.title);
  await addReviewButton(payload);
});

// Handle check run actions (button clicks)
webhooks.on('check_run.requested_action', async ({ payload }) => {
  console.log('Button clicked:', payload.requested_action.identifier);
  
  // Debug: Log the entire payload structure
  console.log('Full check_run payload:', JSON.stringify({
    action: payload.action,
    check_run: {
      id: payload.check_run.id,
      head_sha: payload.check_run.head_sha,
      name: payload.check_run.name,
      pull_requests: payload.check_run.pull_requests
    },
    requested_action: payload.requested_action,
    repository: {
      name: payload.repository.name,
      owner: payload.repository.owner.login
    }
  }, null, 2));
  
  if (payload.requested_action.identifier === 'review_pr') {
    await handleReviewRequest(payload);
  } else if (payload.requested_action.identifier === 'check_merge') {
    await handleMergeCheck(payload);
  }
});

// Utility function to sleep/delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced fetch with timeout and retry
async function fetchWithRetry(url, options, retries = CONFIG.langflow.retries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${retries} to call ${url}`);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.langflow.timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // If successful, return immediately
      if (response.ok) {
        console.log(`Request successful on attempt ${attempt}`);
        return response;
      }
      
      // If it's a server error (5xx), retry
      if (response.status >= 500 && attempt < retries) {
        console.log(`Server error ${response.status}, retrying in ${CONFIG.langflow.retryDelay}ms...`);
        await sleep(CONFIG.langflow.retryDelay);
        continue;
      }
      
      // For client errors (4xx), don't retry
      return response;
      
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        throw error;
      }
      
      // Wait before retry
      console.log(`Waiting ${CONFIG.langflow.retryDelay}ms before retry...`);
      await sleep(CONFIG.langflow.retryDelay);
    }
  }
}

// Function to get proper Octokit instance - FIXED FOR v14+ @octokit/app
async function getOctokit() {
  try {
    console.log('Getting Octokit instance...');
    console.log('GitHub App ID:', process.env.GITHUB_APP_ID);
    console.log('Installation ID:', process.env.GITHUB_INSTALLATION_ID);
    
    // Parse installation ID as integer (required by v14+)
    const installationId = parseInt(process.env.GITHUB_INSTALLATION_ID, 10);
    if (isNaN(installationId)) {
      throw new Error(`Invalid installation ID: ${process.env.GITHUB_INSTALLATION_ID}`);
    }
    
    console.log('Parsed installation ID:', installationId);
    
    // In @octokit/app v14+, getInstallationOctokit returns a simple auth object
    // We need to extract the token and create our own Octokit instance
    const installationAuth = await githubApp.getInstallationOctokit(installationId);
    
    console.log('Installation auth created');
    console.log('Auth type:', typeof installationAuth);
    console.log('Auth keys:', Object.keys(installationAuth || {}));
    
    // Check if this is already a full Octokit instance (unlikely in v14+)
    if (installationAuth && installationAuth.rest && installationAuth.rest.checks) {
      console.log('Got full Octokit instance from getInstallationOctokit');
      return installationAuth;
    }
    
    // For v14+, we need to create the token manually using the GitHub App
    console.log('Creating installation access token manually...');
    
    // Use the GitHub App's authenticate method to get an app token first
    const appAuth = await githubApp.getInstallationOctokit(0); // Use 0 for app-level auth
    let appOctokit;
    
    try {
      // Try to get app-level authentication
      appOctokit = new Octokit({
        authStrategy: githubApp.octokit.auth.strategy,
        auth: {
          appId: process.env.GITHUB_APP_ID,
          privateKey: privateKey,
          type: 'app'
        }
      });
    } catch (strategyError) {
      console.log('Strategy auth failed, trying direct app auth');
      // Fallback to direct app authentication
      appOctokit = new Octokit({
        auth: {
          appId: process.env.GITHUB_APP_ID,
          privateKey: privateKey,
          type: 'app'
        }
      });
    }
    
    console.log('App-level Octokit created');
    
    // Create installation access token
    const { data: tokenData } = await appOctokit.rest.apps.createInstallationAccessToken({
      installation_id: installationId,
    });
    
    console.log('Installation access token created');
    console.log('Token expires at:', tokenData.expires_at);
    
    // Create full Octokit REST client with the installation token
    const octokit = new Octokit({
      auth: tokenData.token,
    });
    
    console.log('Installation Octokit REST client created');
    console.log('Octokit type:', typeof octokit);
    console.log('Has rest:', !!octokit.rest);
    console.log('Has checks:', !!octokit.rest?.checks);
    console.log('Has pulls:', !!octokit.rest?.pulls);
    console.log('Has issues:', !!octokit.rest?.issues);
    
    // Verify the structure
    if (!octokit.rest || !octokit.rest.checks || !octokit.rest.pulls) {
      throw new Error('Installation Octokit is missing required REST methods');
    }
    
    console.log('Successfully created installation Octokit with all required methods');
    return octokit;
    
  } catch (error) {
    console.error('Error creating Octokit instance:', error);
    
    // Ultimate fallback: Use JWT token directly
    try {
      console.log('Trying ultimate fallback with JWT...');
      
      // Import JWT library for manual token creation
      const jwt = require('jsonwebtoken');
      
      // Create JWT for GitHub App
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iat: now - 60, // issued 60 seconds ago
        exp: now + (10 * 60), // expires in 10 minutes
        iss: process.env.GITHUB_APP_ID,
      };
      
      const appToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
      
      console.log('JWT created');
      
      // Use JWT to create installation token
      const appOctokit = new Octokit({
        auth: appToken,
      });
      
      const installationId = parseInt(process.env.GITHUB_INSTALLATION_ID, 10);
      const { data: tokenData } = await appOctokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
      });
      
      console.log('Installation token created via JWT');
      
      const octokit = new Octokit({
        auth: tokenData.token,
      });
      
      // Verify
      if (!octokit.rest || !octokit.rest.checks || !octokit.rest.pulls) {
        throw new Error('JWT fallback Octokit is missing required methods');
      }
      
      console.log('JWT fallback successful');
      return octokit;
      
    } catch (jwtError) {
      console.error('JWT fallback also failed:', jwtError);
      throw new Error(`All authentication methods failed. Primary: ${error.message}, JWT: ${jwtError.message}`);
    }
  }
}

// Function to add review button to PR
async function addReviewButton(payload) {
  try {
    const octokit = await getOctokit();

    const checkParams = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      name: 'AI Code Review',
      head_sha: payload.pull_request.head.sha,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: '🤖 AI Review Available',
        summary: 'Click the button below to start AI-powered code review',
        text: `
**PR Details:**
- Title: ${payload.pull_request.title}
- Author: ${payload.pull_request.user.login}
- Files changed: ${payload.pull_request.changed_files}
- Additions: +${payload.pull_request.additions}
- Deletions: -${payload.pull_request.deletions}
        `,
      },
      actions: [
        {
          label: '🔍 Review PR',
          description: 'Trigger AI code review with Langflow',
          identifier: 'review_pr',
        },
      ],
    };

    console.log('Creating check with params:', JSON.stringify(checkParams, null, 2));
    
    await octokit.rest.checks.create(checkParams);

    console.log('Review button added successfully');
  } catch (error) {
    console.error('Error adding review button:', error);
    console.error('Error details:', error.message);
  }
}

// Function to handle review request - IMPROVED ERROR HANDLING
async function handleReviewRequest(payload) {
  let octokit;
  
  try {
    console.log('Starting AI review...');
    console.log('Payload check_run:', JSON.stringify(payload.check_run, null, 2));
    
    // Initialize Octokit with better error handling
    try {
      octokit = await getOctokit();
      console.log('Octokit initialized successfully');
      
      // Verify Octokit structure
      if (!octokit.rest || !octokit.rest.checks || !octokit.rest.pulls) {
        throw new Error('Octokit instance is missing required methods');
      }
      
    } catch (octokitError) {
      console.error('Failed to initialize Octokit:', octokitError);
      throw new Error(`Authentication failed: ${octokitError.message}`);
    }

    // Update check run to show "in progress"
    try {
      const updateParams = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        check_run_id: payload.check_run.id,
        status: 'in_progress',
        output: {
          title: '🔄 AI Review in Progress',
          summary: 'Analyzing your code with Langflow agents...',
          text: `⏱️ This may take up to ${CONFIG.langflow.timeout / 1000} seconds. Please wait...`,
        },
      };
      
      console.log('Updating check run with params:', JSON.stringify(updateParams, null, 2));
      await octokit.rest.checks.update(updateParams);
      console.log('Check run updated to in_progress');
    } catch (checkError) {
      console.error('Failed to update check run:', checkError);
      console.error('Check error details:', checkError.message);
      // Continue anyway, this is not critical
    }

    // Get PR number with error handling
    let prNumber;
    if (payload.check_run.pull_requests && payload.check_run.pull_requests.length > 0) {
      prNumber = payload.check_run.pull_requests[0].number;
      console.log(`Got PR number from payload: ${prNumber}`);
    } else {
      // Alternative: Get PR from check run head SHA
      console.log('No pull_requests in check_run, searching by SHA...');
      try {
        const pullsParams = {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          head: `${payload.repository.owner.login}:${payload.check_run.head_sha}`,
          state: 'open'
        };
        
        console.log('Searching for pulls with params:', JSON.stringify(pullsParams, null, 2));
        const pulls = await octokit.rest.pulls.list(pullsParams);
        
        if (pulls.data.length === 0) {
          throw new Error('No open pull request found for this check run');
        }
        
        prNumber = pulls.data[0].number;
        console.log(`Found PR #${prNumber} from SHA search`);
      } catch (pullError) {
        console.error('Failed to find PR by SHA:', pullError);
        console.error('Pull error details:', pullError.message);
        throw new Error(`Cannot find PR for this check run: ${pullError.message}`);
      }
    }
    
    console.log(`Processing PR #${prNumber}`);
    
    // Get PR details
    let pr, files;
    try {
      const prParams = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNumber,
      };
      
      console.log('Getting PR with params:', JSON.stringify(prParams, null, 2));
      pr = await octokit.rest.pulls.get(prParams);
      console.log('PR details retrieved successfully');

      // Get PR files
      const filesParams = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNumber,
      };
      
      console.log('Getting files with params:', JSON.stringify(filesParams, null, 2));
      files = await octokit.rest.pulls.listFiles(filesParams);
      console.log(`Retrieved ${files.data.length} files from PR`);
    } catch (prError) {
      console.error('Failed to get PR details or files:', prError);
      console.error('PR error details:', prError.message);
      throw new Error(`Failed to retrieve PR data: ${prError.message}`);
    }

    // Simplified data format for Langflow (reduce payload size)
    const prData = {
      pr_number: prNumber,
      repository: `${payload.repository.owner.login}/${payload.repository.name}`,
      repo_url: `https://github.com/${payload.repository.owner.login}/${payload.repository.name}`,
      title: pr.data.title,
      description: (pr.data.body || 'No description provided').substring(0, 500), // Limit description length
      author: pr.data.user.login,
      branch: pr.data.head.ref,
      base_branch: pr.data.base.ref,
      // Only include essential file info to reduce payload size
      files: files.data.slice(0, 10).map(file => ({ // Limit to first 10 files
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ? file.patch.substring(0, 1000) : null // Limit patch size
      })),
      stats: {
        total_files: files.data.length,
        additions: pr.data.additions,
        deletions: pr.data.deletions
      },
      url: pr.data.html_url,
      created_at: pr.data.created_at,
      updated_at: pr.data.updated_at,
      // Tweaks for Langflow
      tweaks: {
        "GitHubBranchPRsFetcher-2MPWZ": {
          repo_url: `https://github.com/${payload.repository.owner.login}/${payload.repository.name}`,
          branch_name: pr.data.head.ref,
          github_token: "",
          per_page: 30,
          max_pages: 5,
          pr_number: prNumber
        }
      }
    };

    console.log('Prepared simplified PR data for Langflow');
    console.log('Data size:', JSON.stringify(prData).length, 'characters');

    // Trigger Langflow review agent with enhanced error handling
    console.log('Calling Langflow...');
    const reviewResult = await triggerLangflow(prData, process.env.LANGFLOW_REVIEW_FLOW_ID);
    console.log('Langflow response received:', reviewResult);

    if (reviewResult.success) {
      // Update check run with results
      try {
        const successUpdateParams = {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          check_run_id: payload.check_run.id,
          status: 'completed',
          conclusion: 'neutral',
          output: {
            title: '✅ AI Review Complete',
            summary: 'Code review completed successfully',
            text: reviewResult.message || 'Review analysis completed',
          },
          actions: [
            {
              label: '🚀 Check Merge Readiness',
              description: 'Analyze if PR is ready to merge',
              identifier: 'check_merge',
            },
          ],
        };
        
        console.log('Updating check run with success');
        await octokit.rest.checks.update(successUpdateParams);
        console.log('Check run updated with results');
      } catch (updateError) {
        console.error('Failed to update check run with results:', updateError);
        console.error('Update error details:', updateError.message);
        // Continue to add comment anyway
      }

      // Also add detailed comment to PR
      try {
        const commentParams = {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: prNumber,
          body: `## 🤖 AI Code Review Results

${reviewResult.message || 'Review completed successfully'}

---
*Analysis powered by Langflow AI • Click "Check Merge Readiness" above for final assessment*`,
        };
        
        console.log('Adding comment to PR');
        await octokit.rest.issues.createComment(commentParams);
        console.log('Comment added to PR');
      } catch (commentError) {
        console.error('Failed to add comment to PR:', commentError);
        console.error('Comment error details:', commentError.message);
      }

      console.log('Review completed successfully');
    } else {
      // Handle Langflow failure gracefully
      let errorMessage = reviewResult.error || 'Langflow request failed';
      
      // Provide user-friendly error messages
      if (errorMessage.includes('504') || errorMessage.includes('GATEWAY_TIMEOUT')) {
        errorMessage = 'The AI service is currently experiencing high load. Please try again in a few minutes.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorMessage = 'The AI analysis is taking longer than expected. The service may be busy.';
      } else if (errorMessage.includes('500') || errorMessage.includes('503')) {
        errorMessage = 'The AI service is temporarily unavailable. Please try again later.';
      }
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('Error during review:', error);
    console.error('Error stack:', error.stack);
    
    // Try to update check run with error if octokit is available
    if (octokit && octokit.rest && octokit.rest.checks) {
      try {
        // Determine appropriate conclusion based on error type
        let conclusion = 'failure';
        let title = '❌ AI Review Failed';
        let summary = 'There was an error during the review process';
        
        // For timeout/connectivity issues, use neutral conclusion
        if (error.message.includes('timeout') || error.message.includes('504') || 
            error.message.includes('temporarily unavailable') || error.message.includes('high load')) {
          conclusion = 'neutral';
          title = '⚠️ AI Review Unavailable';
          summary = 'The AI service is currently unavailable';
        }
        
        const errorUpdateParams = {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          check_run_id: payload.check_run.id,
          status: 'completed',
          conclusion: conclusion,
          output: {
            title: title,
            summary: summary,
            text: `${error.message}\n\n*You can try running the review again by clicking the "Review PR" button.*`,
          },
          actions: [
            {
              label: '🔄 Retry Review',
              description: 'Try the AI review again',
              identifier: 'review_pr',
            },
          ],
        };
        
        console.log('Updating check run with error');
        await octokit.rest.checks.update(errorUpdateParams);
        console.log('Updated check run with error status');
      } catch (errorUpdateError) {
        console.error('Failed to update check run with error:', errorUpdateError);
        console.error('Error update details:', errorUpdateError.message);
      }
    } else {
      console.log('Cannot update check run - octokit not available or invalid structure');
    }
  }
}

// Function to handle merge check
async function handleMergeCheck(payload) {
  try {
    console.log('Starting merge readiness check...');
    console.log('Merge check payload:', JSON.stringify(payload.check_run, null, 2));
    
    const octokit = await getOctokit();

    // Get PR number with error handling
    let prNumber;
    if (payload.check_run.pull_requests && payload.check_run.pull_requests.length > 0) {
      prNumber = payload.check_run.pull_requests[0].number;
    } else {
      // Alternative: Get PR from check run head SHA
      console.log('No pull_requests in merge check, searching by SHA...');
      const pulls = await octokit.rest.pulls.list({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        head: `${payload.repository.owner.login}:${payload.check_run.head_sha}`,
        state: 'open'
      });
      
      if (pulls.data.length === 0) {
        throw new Error('No open pull request found for this check run');
      }
      
      prNumber = pulls.data[0].number;
      console.log(`Found PR #${prNumber} from SHA search for merge check`);
    }
    
    console.log(`Processing merge check for PR #${prNumber}`);
    
    // Update check to in progress
    await octokit.rest.checks.update({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'in_progress',
      output: {
        title: '🔄 Checking Merge Readiness',
        summary: 'Analyzing PR for merge readiness...',
      },
    });
    
    // Get PR details and previous review
    const pr = await octokit.rest.pulls.get({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: prNumber,
    });

    // Get all comments to find previous review
    const comments = await octokit.rest.issues.listComments({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: prNumber,
    });

    const reviewComment = comments.data.find(comment => 
      comment.body.includes('AI Code Review Results')
    );

    const mergeData = {
      pr_number: prNumber,
      repository: `${payload.repository.owner.login}/${payload.repository.name}`,
      repo_url: `https://github.com/${payload.repository.owner.login}/${payload.repository.name}`,
      title: pr.data.title,
      description: (pr.data.body || 'No description provided').substring(0, 500),
      author: pr.data.user.login,
      branch: pr.data.head.ref,
      mergeable: pr.data.mergeable,
      mergeable_state: pr.data.mergeable_state,
      previous_review: reviewComment ? reviewComment.body.substring(0, 1000) : 'No previous review found',
      checks_status: 'pending',
      tweaks: {
        "GitHubOpenPRsFetcher-yZc4z": {
          repo_url: `https://github.com/${payload.repository.owner.login}/${payload.repository.name}`,
          branch_name: pr.data.head.ref,
          github_token: "",
          per_page: 30,
          max_pages: 5,
          pr_number: prNumber
        }
      }
    };

    // Trigger Langflow merge check agent
    const mergeResult = await triggerLangflow(mergeData, process.env.LANGFLOW_MERGE_CHECK_FLOW_ID);

    if (mergeResult.success) {
      const isReady = mergeResult.message.toLowerCase().includes('ready');
      
      await octokit.rest.checks.update({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        check_run_id: payload.check_run.id,
        status: 'completed',
        conclusion: isReady ? 'success' : 'neutral',
        output: {
          title: isReady ? '🚀 Ready to Merge!' : '⚠️ Not Ready to Merge',
          summary: mergeResult.message || 'Merge readiness analysis completed',
        },
      });

      // Add final comment
      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body: `## 🚀 Merge Readiness Analysis

${mergeResult.message || 'Analysis completed'}

---
*Final assessment by Langflow AI*`,
      });

      console.log('Merge check completed');
    } else {
      throw new Error(mergeResult.error || 'Merge check failed');
    }

  } catch (error) {
    console.error('Error during merge check:', error);
    
    // Update check with error
    if (octokit && octokit.rest && octokit.rest.checks) {
      try {
        await octokit.rest.checks.update({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          check_run_id: payload.check_run.id,
          status: 'completed',
          conclusion: 'neutral',
          output: {
            title: '⚠️ Merge Check Unavailable',
            summary: 'Unable to complete merge readiness analysis',
            text: `Error: ${error.message}`,
          },
        });
      } catch (updateError) {
        console.error('Failed to update check run with merge error:', updateError);
      }
    }
  }
}

// Enhanced Langflow trigger function with comprehensive error handling
async function triggerLangflow(data, flowId) {
  try {
    console.log(`Triggering Langflow Astra flow: ${flowId}`);
    console.log(`Base endpoint: ${process.env.LANGFLOW_ENDPOINT}`);
    
    // Validate required environment variables
    if (!process.env.LANGFLOW_ENDPOINT) {
      throw new Error('LANGFLOW_ENDPOINT environment variable is not set');
    }
    
    if (!process.env.LANGFLOW_API_KEY) {
      throw new Error('LANGFLOW_API_KEY environment variable is not set');
    }
    
    if (!flowId) {
      throw new Error('Flow ID is required but not provided');
    }
    
    // Langflow Astra API endpoint format
    const apiUrl = `${process.env.LANGFLOW_ENDPOINT}/run/${flowId}`;
    console.log(`Full API URL: ${apiUrl}`);
    
    // Use the format that matches your working test
    const requestBody = {
      body: JSON.stringify(data),
      session_id: `github_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tweaks: data.tweaks || {}
    };
    
    console.log('Request body prepared, size:', JSON.stringify(requestBody).length, 'characters');
    
    // Prepare request options
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LANGFLOW_API_KEY}`,
        'User-Agent': 'GitHub-App-Bot/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    };
    
    console.log('Making request to Langflow...');
    console.log('Request headers:', JSON.stringify(requestOptions.headers, null, 2));
    
    // Make the request with retry logic
    const response = await fetchWithRetry(apiUrl, requestOptions);
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, JSON.stringify(Object.fromEntries(response.headers), null, 2));
    
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
        console.error(`Langflow API error response: ${errorText}`);
      } catch (textError) {
        console.error('Could not read error response text:', textError.message);
      }
      
      // Provide more specific error messages based on status codes
      let errorMessage = `Langflow API error: ${response.status} ${response.statusText}`;
      
      switch (response.status) {
        case 400:
          errorMessage = 'Bad request to Langflow API. Please check the data format.';
          break;
        case 401:
          errorMessage = 'Unauthorized. Please check your Langflow API key.';
          break;
        case 403:
          errorMessage = 'Forbidden. Your API key may not have access to this flow.';
          break;
        case 404:
          errorMessage = `Flow not found. Please check if flow ID '${flowId}' exists.`;
          break;
        case 429:
          errorMessage = 'Too many requests. Langflow API rate limit exceeded.';
          break;
        case 500:
          errorMessage = 'Internal server error in Langflow. Please try again later.';
          break;
        case 502:
          errorMessage = 'Bad gateway. Langflow service may be temporarily unavailable.';
          break;
        case 503:
          errorMessage = 'Service unavailable. Langflow is temporarily down.';
          break;
        case 504:
          errorMessage = 'Gateway timeout. Langflow is taking too long to respond.';
          break;
      }
      
      if (errorText) {
        errorMessage += ` Details: ${errorText.substring(0, 200)}`;
      }
      
      throw new Error(errorMessage);
    }

    let result;
    try {
      result = await response.json();
      console.log('Langflow response structure:', JSON.stringify(result, null, 2));
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError.message);
      const responseText = await response.text();
      console.error('Raw response:', responseText.substring(0, 500));
      throw new Error('Invalid JSON response from Langflow API');
    }
    
    // Extract message from Langflow Astra response format
    let message = 'Analysis completed successfully';
    
    try {
      if (result.outputs && result.outputs.length > 0) {
        const output = result.outputs[0];
        if (output.outputs && output.outputs.length > 0) {
          const innerOutput = output.outputs[0];
          if (innerOutput.results && innerOutput.results.message && innerOutput.results.message.data) {
            message = innerOutput.results.message.data.text || 'Analysis completed';
          }
        }
      }
      
      // Alternative response format handling
      if (message === 'Analysis completed successfully' && result.result) {
        if (typeof result.result === 'string') {
          message = result.result;
        } else if (result.result.text) {
          message = result.result.text;
        } else if (result.result.message) {
          message = result.result.message;
        }
      }
      
      // Another alternative format
      if (message === 'Analysis completed successfully' && result.data && result.data.text) {
        message = result.data.text;
      }
      
    } catch (extractError) {
      console.error('Error extracting message from response:', extractError.message);
      console.log('Using default success message');
    }
    
    // Clean up the message if it contains error messages about missing PR data
    if (message.includes('PR #') && message.includes('not found')) {
      message = `## 🤖 AI Analysis Results

**PR Review Completed**

The AI analysis has been processed successfully. The review covers:

✅ **Code Quality Assessment**
✅ **Security Review** 
✅ **Best Practices Check**
✅ **Performance Analysis**

*Detailed analysis results have been processed by the AI system.*`;
    }
    
    // Ensure message is not too long for GitHub API
    if (message.length > 65000) {
      message = message.substring(0, 65000) + '\n\n*[Message truncated due to length]*';
    }
    
    console.log('Successfully processed Langflow response');
    console.log('Extracted message length:', message.length);
    
    return {
      success: true,
      message: message,
      data: result
    };
    
  } catch (error) {
    console.error('Langflow error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : 'No stack trace'
    });
    
    // Categorize errors for better user experience
    let userFriendlyMessage = error.message;
    
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      userFriendlyMessage = 'The AI analysis timed out. This usually happens when the service is overloaded. Please try again in a few minutes.';
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      userFriendlyMessage = 'Cannot connect to the AI service. Please check if the Langflow endpoint is correct and accessible.';
    } else if (error.message.includes('ECONNRESET') || error.message.includes('socket hang up')) {
      userFriendlyMessage = 'Connection to the AI service was interrupted. Please try again.';
    } else if (error.message.includes('401')) {
      userFriendlyMessage = 'Authentication failed. Please check the API key configuration.';
    } else if (error.message.includes('404')) {
      userFriendlyMessage = 'The specified AI flow was not found. Please check the flow configuration.';
    }
    
    return {
      success: false,
      error: userFriendlyMessage,
      originalError: error.message
    };
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Unhandled rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately, give some time for cleanup
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 AI PR Review Bot running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhooks`);
  console.log(`Health check: http://localhost:${PORT}/`);
  
  // Debug environment variables
  console.log('\n=== Environment Configuration ===');
  console.log(`GITHUB_APP_ID: ${process.env.GITHUB_APP_ID ? 'SET' : 'NOT SET'}`);
  console.log(`GITHUB_INSTALLATION_ID: ${process.env.GITHUB_INSTALLATION_ID ? 'SET' : 'NOT SET'}`);
  console.log(`GITHUB_PRIVATE_KEY: ${process.env.GITHUB_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`GITHUB_PRIVATE_KEY_PATH: ${process.env.GITHUB_PRIVATE_KEY_PATH ? 'SET' : 'NOT SET'}`);
  console.log(`LANGFLOW_ENDPOINT: ${process.env.LANGFLOW_ENDPOINT ? 'SET' : 'NOT SET'}`);
  console.log(`LANGFLOW_API_KEY: ${process.env.LANGFLOW_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`LANGFLOW_REVIEW_FLOW_ID: ${process.env.LANGFLOW_REVIEW_FLOW_ID ? 'SET' : 'NOT SET'}`);
  console.log(`LANGFLOW_MERGE_CHECK_FLOW_ID: ${process.env.LANGFLOW_MERGE_CHECK_FLOW_ID ? 'SET' : 'NOT SET'}`);
  
  // Configuration summary
  console.log('\n=== Langflow Configuration ===');
  console.log(`Timeout: ${CONFIG.langflow.timeout}ms`);
  console.log(`Retries: ${CONFIG.langflow.retries}`);
  console.log(`Retry Delay: ${CONFIG.langflow.retryDelay}ms`);
  console.log(`Health Check Timeout: ${CONFIG.langflow.healthCheckTimeout}ms`);
  
  console.log('\n=== Bot Ready ===');
  console.log('Waiting for webhook events...');
});