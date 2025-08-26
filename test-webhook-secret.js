// test-webhook-secret.js
require('dotenv').config();
const crypto = require('crypto');

const testPayload = '{"test": "data"}';
const secret = process.env.GITHUB_WEBHOOK_SECRET;

console.log('Webhook Secret:', secret ? 'Present' : 'Missing');
console.log('Secret Length:', secret ? secret.length : 0);

if (secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const signature = 'sha256=' + hmac.update(testPayload, 'utf8').digest('hex');
  console.log('Generated Signature:', signature);
}