// background.js - Service worker to proxy backend requests
const API_BASE = 'http://localhost:5000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'proxyFetch') return;

  const { path, method = 'GET', headers = {}, body = null } = message;

  fetch(`${API_BASE}${path}`, {
    method,
    headers,
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
        data = null;
      }
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch((err) => {
      sendResponse({ ok: false, status: 0, error: err?.message || String(err) });
    });

  // Keep the message channel open for async response
  return true;
});

