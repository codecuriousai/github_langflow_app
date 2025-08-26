require('dotenv').config();
const express = require('express');
const { App } = require('@octokit/app');
const { Webhooks } = require('@octokit/webhooks');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();

// Load private key
const privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8');

// Create GitHub App instance
const githubApp = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: privateKey,
});

// Create webhooks instance
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
});

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'AI PR Review Bot is running' });
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
  
  if (payload.requested_action.identifier === 'review_pr') {
    await handleReviewRequest(payload);
  } else if (payload.requested_action.identifier === 'check_merge') {
    await handleMergeCheck(payload);
  }
});

// Function to add review button to PR
async function addReviewButton(payload) {
  try {
    const octokit = await githubApp.getInstallationOctokit(
      process.env.GITHUB_INSTALLATION_ID
    );

    await octokit.rest.checks.create({
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
    });

    console.log('Review button added successfully');
  } catch (error) {
    console.error('Error adding review button:', error);
  }
}

// Function to handle review request
async function handleReviewRequest(payload) {
  try {
    console.log('Starting AI review...');
    
    const octokit = await githubApp.getInstallationOctokit(
      process.env.GITHUB_INSTALLATION_ID
    );

    // Update check run to show "in progress"
    await octokit.rest.checks.update({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'in_progress',
      output: {
        title: '🔄 AI Review in Progress',
        summary: 'Analyzing your code with Langflow agents...',
      },
    });

    // Get PR details
    const prNumber = payload.check_run.pull_requests[0].number;
    const pr = await octokit.rest.pulls.get({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: prNumber,
    });

    // Get PR files
    const files = await octokit.rest.pulls.listFiles({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: prNumber,
    });

    // Prepare data for Langflow
    const prData = {
      title: pr.data.title,
      description: pr.data.body || 'No description provided',
      author: pr.data.user.login,
      branch: pr.data.head.ref,
      files: files.data.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      })),
      stats: {
        total_files: files.data.length,
        additions: pr.data.additions,
        deletions: pr.data.deletions
      }
    };

    // Trigger Langflow review agent
    const reviewResult = await triggerLangflow(prData, process.env.LANGFLOW_REVIEW_FLOW_ID);

    if (reviewResult.success) {
      // Update check run with results
      await octokit.rest.checks.update({
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
      });

      // Also add detailed comment to PR
      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body: `## 🤖 AI Code Review Results

${reviewResult.message || 'Review completed successfully'}

---
*Analysis powered by Langflow AI • Click "Check Merge Readiness" above for final assessment*`,
      });

      console.log('Review completed successfully');
    } else {
      throw new Error(reviewResult.error || 'Langflow request failed');
    }

  } catch (error) {
    console.error('Error during review:', error);
    
    // Update check run with error
    const octokit = await githubApp.getInstallationOctokit(
      process.env.GITHUB_INSTALLATION_ID
    );
    
    await octokit.rest.checks.update({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'completed',
      conclusion: 'failure',
      output: {
        title: '❌ AI Review Failed',
        summary: 'There was an error during the review process',
        text: `Error: ${error.message}`,
      },
    });
  }
}

// Function to handle merge check
async function handleMergeCheck(payload) {
  try {
    console.log('Starting merge readiness check...');
    
    const octokit = await githubApp.getInstallationOctokit(
      process.env.GITHUB_INSTALLATION_ID
    );

    const prNumber = payload.check_run.pull_requests[0].number;
    
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
      title: pr.data.title,
      description: pr.data.body || 'No description provided',
      author: pr.data.user.login,
      mergeable: pr.data.mergeable,
      mergeable_state: pr.data.mergeable_state,
      previous_review: reviewComment ? reviewComment.body : 'No previous review found',
      checks_status: 'pending' // You can get actual status from checks API
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
    }

  } catch (error) {
    console.error('Error during merge check:', error);
  }
}

// Function to trigger Langflow
async function triggerLangflow(data, flowId) {
  try {
    console.log(`Triggering Langflow flow: ${flowId}`);
    
    const response = await fetch(`${process.env.LANGFLOW_ENDPOINT}/api/v1/run/${flowId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LANGFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        input_value: JSON.stringify(data),
        output_type: 'chat',
        input_type: 'chat',
        tweaks: {}
      }),
    });

    if (!response.ok) {
      throw new Error(`Langflow API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      message: result.outputs?.[0]?.outputs?.[0]?.results?.message?.text || 'Analysis completed',
      data: result
    };
    
  } catch (error) {
    console.error('Langflow error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// random comment adding for testing
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 AI PR Review Bot running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhooks`);
});