require('dotenv').config();
const fetch = require('node-fetch');

async function testLangflow() {
  try {
    const testData = {
      title: "Testing PR",
      description: "This is a test",
      author: "test-user"
    };
    
    const response = await fetch(`${process.env.LANGFLOW_ENDPOINT}/api/v1/run/${process.env.LANGFLOW_REVIEW_FLOW_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LANGFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        input_value: JSON.stringify(testData),
        output_type: 'chat',
        input_type: 'chat'
      }),
    });
    
    const result = await response.json();
    console.log('Langflow Response:', result);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testLangflow();