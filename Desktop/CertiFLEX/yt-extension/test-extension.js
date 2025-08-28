// Test script for CertiFlex extension
// Run this in the browser console on a YouTube video page to test the extension

console.log('🧪 Testing CertiFlex Extension...');

// Test 1: Check if extension is loaded
if (window.__ytw_injected) {
  console.log('✅ Extension is loaded');
} else {
  console.log('❌ Extension is not loaded');
}

// Test 2: Check backend connection
async function testBackendConnection() {
  try {
    const response = await fetch('https://yt2certify.onrender.com/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend is connected:', data);
      return true;
    } else {
      console.log('❌ Backend responded with error:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Backend connection failed:', error.message);
    return false;
  }
}

// Test 3: Check user authentication
function testUserAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['yt_user'], (result) => {
      if (result.yt_user && result.yt_user.email) {
        console.log('✅ User is authenticated:', result.yt_user.email);
        resolve(true);
      } else {
        console.log('❌ User is not authenticated');
        resolve(false);
      }
    });
  });
}

// Test 4: Check tracking status
function testTrackingStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['yt_tracking_flag'], (result) => {
      const flag = result.yt_tracking_flag;
      if (flag === 1) {
        console.log('✅ Tracking is enabled');
        resolve(true);
      } else {
        console.log('❌ Tracking is disabled (flag:', flag, ')');
        resolve(false);
      }
    });
  });
}

// Test 5: Check for local progress
function testLocalProgress() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['yt_user'], (result) => {
      if (!result.yt_user || !result.yt_user.email) {
        console.log('❌ No user found for local progress test');
        resolve(false);
        return;
      }

      const key = `yt_progress_${result.yt_user.email}`;
      chrome.storage.local.get([key], (progressResult) => {
        const localProgress = progressResult[key];
        if (localProgress && (localProgress.videos.length > 0 || localProgress.playlists.length > 0)) {
          console.log('✅ Found local progress:', localProgress);
          resolve(true);
        } else {
          console.log('ℹ️ No local progress found');
          resolve(false);
        }
      });
    });
  });
}

// Run all tests
async function runAllTests() {
  console.log('\n🧪 Running CertiFlex Extension Tests...\n');
  
  const tests = [
    { name: 'Extension Loaded', test: () => Promise.resolve(window.__ytw_injected) },
    { name: 'Backend Connection', test: testBackendConnection },
    { name: 'User Authentication', test: testUserAuth },
    { name: 'Tracking Status', test: testTrackingStatus },
    { name: 'Local Progress', test: testLocalProgress }
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    try {
      const result = await test.test();
      if (result) {
        passed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} failed with error:`, error);
    }
  }

  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Extension should be working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Check the issues above.');
  }
}

// Run tests when called
runAllTests();
