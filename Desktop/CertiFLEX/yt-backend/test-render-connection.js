// test-render-connection.js - Test connection to deployed Render backend
const fetch = require('node-fetch');

// Your actual Render URL
const RENDER_URL = 'https://yt2certify.onrender.com';

async function testRenderConnection() {
  console.log('🧪 Testing Render backend connection...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${RENDER_URL}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed');
      console.log('   Status:', healthData.status);
      console.log('   MongoDB:', healthData.mongodb);
      console.log('   Environment:', healthData.environment);
      console.log('   Port:', healthData.port);
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
    }
    console.log('');

    // Test root endpoint
    console.log('2. Testing root endpoint...');
    const rootResponse = await fetch(RENDER_URL);
    const rootText = await rootResponse.text();
    
    if (rootResponse.ok) {
      console.log('✅ Root endpoint working');
      console.log('   Response:', rootText);
    } else {
      console.log('❌ Root endpoint failed:', rootResponse.status);
    }
    console.log('');

    // Test profile endpoint
    console.log('3. Testing profile endpoint...');
    const profileResponse = await fetch(`${RENDER_URL}/profile/test@example.com`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (profileResponse.ok) {
      console.log('✅ Profile endpoint working');
    } else {
      console.log('⚠️ Profile endpoint response:', profileResponse.status);
      // This is expected if no profile exists
    }
    console.log('');

    console.log('🎉 Render backend connection test completed!');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.log('\n💡 Troubleshooting tips:');
    console.log('   1. Check if your Render service is running');
    console.log('   2. Verify the URL is correct');
    console.log('   3. Check Render logs for any errors');
    console.log('   4. Ensure environment variables are set correctly');
  }
}

// Run the test
testRenderConnection();
