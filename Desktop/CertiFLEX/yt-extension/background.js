// background.js - Service worker to proxy backend requests
const API_BASE = 'https://yt2certify.onrender.com';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'proxyFetch') return;

  const { path, method = 'GET', headers = {}, body = null } = message;

  console.log(`🌐 Making request to: ${API_BASE}${path}`, { method, headers, body });

  fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...headers,
      'User-Agent': 'YT-Extension/1.0'
    },
    body: body ? JSON.stringify(body) : undefined,
    // No credentials/cookies used
    mode: 'cors',
  })
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      let data = null;
      try {
        data = contentType.includes('application/json') ? await res.json() : await res.text();
      } catch (e) {
        console.warn('⚠️ Failed to parse response data:', e);
        data = null;
      }
      
      console.log(`📡 API Response: ${res.status} ${res.statusText}`, data);
      
      if (!res.ok) {
        console.warn(`⚠️ API request failed: ${res.status} ${res.statusText}`, data);
      }
      
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch((err) => {
      console.error(`❌ API request error:`, err);
      console.error(`❌ Error details:`, {
        message: err?.message,
        name: err?.name,
        stack: err?.stack
      });
      sendResponse({ ok: false, status: 0, error: err?.message || String(err) });
    });

  // Keep the message channel open for async response
  return true;
});

