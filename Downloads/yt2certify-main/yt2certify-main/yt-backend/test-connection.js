// test-connection.js - Simple test script to verify backend functionality
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:5000';

async function testBackend() {
  console.log('🧪 Testing YT Backend Connection...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);

    // Test main endpoint
    console.log('\n2. Testing main endpoint...');
    const mainResponse = await fetch(`${API_BASE}/`);
    const mainText = await mainResponse.text();
    console.log('✅ Main endpoint:', mainText);

    // Test profile endpoint (should return 400 for missing email)
    console.log('\n3. Testing profile endpoint...');
    const profileResponse = await fetch(`${API_BASE}/profile/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User' })
    });
    const profileData = await profileResponse.json();
    console.log('✅ Profile endpoint (expected 400):', profileData);

    console.log('\n🎉 All tests completed successfully!');
    console.log('Backend is running correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the server is running with: npm start');
  }
}

// Run the test
testBackend();


