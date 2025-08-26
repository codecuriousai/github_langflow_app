require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();

// Load private key
// const privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8');

// Load private key (works both locally and in production)
let privateKey;
if (process.env.GITHUB_PRIVATE_KEY) {
  // Production: use environment variable
  privateKey = process.env.GITHUB_PRIVATE_KEY;
} else if (process.env.GITHUB_PRIVATE_KEY_PATH) {
  // Local development: use file path
  privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8');
} else {
  // Fallback: try default file
  privateKey = fs.readFileSync('./private-key.pem', 'utf8');
}

// IMPORTANT: Use raw body parser for webhooks
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json()); // For other endpoints

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'AI PR Review Bot is running!', timestamp: new Date().toISOString() });
});

// Generate JWT token for GitHub App authentication
function generateJWT() {
  const jwt = require('jsonwebtoken');
  
  const payload = {
    iss: process.env.GITHUB_APP_ID,
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + (10 * 60)
  };
  
  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

// Get installation access token
async function getInstallationToken() {
  const jwt = generateJWT();
  
  const response = await fetch(`https://api.github.com/app/installations/${process.env.GITHUB_INSTALLATION_ID}/access_tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AI-PR-Review-Bot'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get installation token: ${response.status}`);
  }
  
  const data = await response.json();
  return data.token;
}

// Verify webhook signature
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature) {
    throw new Error('No signature provided');
  }
  
  if (!signature.startsWith('sha256=')) {
    throw new Error('Invalid signature format');
  }
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload, 'utf8').digest('hex');
  
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer = Buffer.from(digest, 'utf8');
  
  if (signatureBuffer.length !== digestBuffer.length) {
    throw new Error('Signature length mismatch');
  }
  
  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
}

// Webhook endpoint with proper signature verification
app.post('/webhooks', async (req, res) => {
  try {
    console.log('Received webhook request');
    
    // Get raw body as string
    const payload = req.body.toString('utf8');
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const delivery = req.headers['x-github-delivery'];
    
    console.log(`Event: ${event}, Delivery: ${delivery}`);
    
    // Verify signature
    if (!verifyWebhookSignature(payload, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).json({ error: 'Unauthorized - Invalid signature' });
    }
    
    console.log('Webhook signature verified successfully');
    
    // Parse JSON after verification
    const body = JSON.parse(payload);
    
    // Handle events
    if (event === 'pull_request' && (body.action === 'opened' || body.action === 'synchronize')) {
      console.log(`Handling PR ${body.action}:`, body.pull_request.title);
      await handlePullRequest(body);
    } else if (event === 'check_run' && body.action === 'requested_action') {
      console.log('Handling check run action:', body.requested_action.identifier);
      await handleCheckRunAction(body);
    } else {
      console.log(`Ignoring event: ${event} with action: ${body.action}`);
    }
    
    res.status(200).json({ status: 'success' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Handle pull request events
async function handlePullRequest(payload) {
  try {
    console.log('Adding review button for PR:', payload.pull_request.title);
    
    const token = await getInstallationToken();
    
    const response = await fetch(`https://api.github.com/repos/${payload.repository.full_name}/check-runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-PR-Review-Bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'AI Code Review',
        head_sha: payload.pull_request.head.sha,
        status: 'completed',
        conclusion: 'neutral',
        output: {
          title: '🤖 AI Review Available',
          summary: 'Click the button below to start AI-powered code review',
          text: `**PR Details:**
- Title: ${payload.pull_request.title}
- Author: ${payload.pull_request.user.login}
- Files changed: ${payload.pull_request.changed_files || 'Unknown'}
- Additions: +${payload.pull_request.additions || 0}
- Deletions: -${payload.pull_request.deletions || 0}`
        },
        actions: [
          {
            label: '🔍 Review PR',
            description: 'Trigger AI code review with Langflow',
            identifier: 'review_pr'
          }
        ]
      })
    });
    
    if (response.ok) {
      console.log('✅ Review button added successfully');
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to add review button:', response.status, errorText);
    }
    
  } catch (error) {
    console.error('Error handling pull request:', error);
  }
}

// Handle check run actions
async function handleCheckRunAction(payload) {
  try {
    const action = payload.requested_action.identifier;
    console.log('Processing action:', action);
    
    if (action === 'review_pr') {
      await handleReviewRequest(payload);
    } else if (action === 'check_merge') {
      await handleMergeCheck(payload);
    }
    
  } catch (error) {
    console.error('Error handling check run action:', error);
  }
}

// Handle review request
async function handleReviewRequest(payload) {
  try {
    console.log('🔄 Starting AI review...');
    
    const token = await getInstallationToken();
    const prNumber = payload.check_run.pull_requests[0].number;
    const repoFullName = payload.repository.full_name;
    
    // Update check run to show progress
    await fetch(`https://api.github.com/repos/${repoFullName}/check-runs/${payload.check_run.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-PR-Review-Bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'in_progress',
        output: {
          title: '🔄 AI Review in Progress',
          summary: 'Analyzing your code with Langflow agents...',
          text: 'Please wait while our AI agents analyze your pull request.'
        }
      })
    });
    
    // Get PR details
    const prResponse = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-PR-Review-Bot'
      }
    });
    
    if (!prResponse.ok) {
      throw new Error(`Failed to fetch PR details: ${prResponse.status}`);
    }
    
    const prData = await prResponse.json();
    
    // Get PR files (limit to first 10 files to avoid payload size issues)
    const filesResponse = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=10`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-PR-Review-Bot'
      }
    });
    
    if (!filesResponse.ok) {
      throw new Error(`Failed to fetch PR files: ${filesResponse.status}`);
    }
    
    const files = await filesResponse.json();
    
    // Prepare data for Langflow (keep it concise to avoid payload size limits)
    const reviewData = {
      title: prData.title,
      description: (prData.body || 'No description provided').substring(0, 500),
      author: prData.user.login,
      branch: prData.head.ref,
      files: files.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        // Limit patch size to prevent huge payloads
        patch: file.patch ? file.patch.substring(0, 1000) + (file.patch.length > 1000 ? '...[truncated]' : '') : null
      })),
      stats: {
        total_files: files.length,
        additions: prData.additions,
        deletions: prData.deletions
      }
    };
    
    console.log('📤 Sending data to Langflow...');
    
    // Trigger Langflow
    const reviewResult = await triggerLangflow(reviewData, process.env.LANGFLOW_REVIEW_FLOW_ID);
    
    if (reviewResult.success) {
      console.log('✅ Langflow analysis completed');
      
      // Update check run with results
      await fetch(`https://api.github.com/repos/${repoFullName}/check-runs/${payload.check_run.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-PR-Review-Bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'completed',
          conclusion: 'neutral',
          output: {
            title: '✅ AI Review Complete',
            summary: 'Code review completed successfully',
            text: (reviewResult.message || 'Review analysis completed').substring(0, 1000)
          },
          actions: [
            {
              label: '🚀 Check Merge Readiness',
              description: 'Analyze if PR is ready to merge',
              identifier: 'check_merge'
            }
          ]
        })
      });
      
      // Add comment to PR
      const commentBody = `## 🤖 AI Code Review Results

${reviewResult.message || 'Review completed successfully'}

---
*Analysis powered by Langflow AI • Click "🚀 Check Merge Readiness" above for final assessment*`;
      
      await fetch(`https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-PR-Review-Bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: commentBody.substring(0, 2000) // GitHub comment limit
        })
      });
      
      console.log('✅ Review completed successfully');
    } else {
      throw new Error(reviewResult.error || 'Langflow analysis failed');
    }
    
  } catch (error) {
    console.error('❌ Error during review:', error);
    
    try {
      const token = await getInstallationToken();
      await fetch(`https://api.github.com/repos/${payload.repository.full_name}/check-runs/${payload.check_run.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-PR-Review-Bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'completed',
          conclusion: 'failure',
          output: {
            title: '❌ AI Review Failed',
            summary: 'There was an error during the review process',
            text: `Error: ${error.message}`
          }
        })
      });
    } catch (updateError) {
      console.error('Failed to update check run with error:', updateError);
    }
  }
}

// Handle merge check (simplified version)
async function handleMergeCheck(payload) {
  try {
    console.log('🚀 Starting merge check...');
    
    const token = await getInstallationToken();
    const prNumber = payload.check_run.pull_requests[0].number;
    const repoFullName = payload.repository.full_name;
    
    // For demo purposes, let's do a simple merge check
    const mergeData = {
      action: 'merge_check',
      pr_number: prNumber,
      repository: repoFullName
    };
    
    const mergeResult = await triggerLangflow(mergeData, process.env.LANGFLOW_MERGE_CHECK_FLOW_ID);
    
    const isReady = mergeResult.success && mergeResult.message.toLowerCase().includes('ready');
    
    await fetch(`https://api.github.com/repos/${repoFullName}/check-runs/${payload.check_run.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-PR-Review-Bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'completed',
        conclusion: isReady ? 'success' : 'neutral',
        output: {
          title: isReady ? '🚀 Ready to Merge!' : '⚠️ Not Ready to Merge',
          summary: mergeResult.message || 'Merge readiness analysis completed'
        }
      })
    });
    
    console.log('✅ Merge check completed');
    
  } catch (error) {
    console.error('❌ Error during merge check:', error);
  }
}

// Function to trigger Langflow
async function triggerLangflow(data, flowId) {
  try {
    console.log(`🔗 Triggering Langflow flow: ${flowId}`);
    
    if (!process.env.LANGFLOW_ENDPOINT || !flowId) {
      throw new Error('Langflow endpoint or flow ID not configured');
    }
    
    const response = await fetch(`${process.env.LANGFLOW_ENDPOINT}/api/v1/run/${flowId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LANGFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        input_value: JSON.stringify(data),
        output_type: 'chat',
        input_type: 'chat'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Langflow API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('📥 Langflow response received');
    
    return {
      success: true,
      message: result.outputs?.[0]?.outputs?.[0]?.results?.message?.text || 'Analysis completed successfully',
      data: result
    };
    
  } catch (error) {
    console.error('🔴 Langflow error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 AI PR Review Bot running on port ${PORT}`);
  console.log(`🌐 Webhook URL: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/webhooks`);
  console.log(`📋 Environment check:`);
  console.log(`   - GitHub App ID: ${process.env.GITHUB_APP_ID ? '✅' : '❌'}`);
  console.log(`   - Webhook Secret: ${process.env.GITHUB_WEBHOOK_SECRET ? '✅' : '❌'}`);
  console.log(`   - Installation ID: ${process.env.GITHUB_INSTALLATION_ID ? '✅' : '❌'}`);
  console.log(`   - Private Key: ${process.env.GITHUB_PRIVATE_KEY_PATH ? '✅' : '❌'}`);
  console.log(`   - Langflow Endpoint: ${process.env.LANGFLOW_ENDPOINT ? '✅' : '❌'}`);
});