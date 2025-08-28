// Mark injected to help debug
window.__ytw_injected = true;

const API_BASE = 'https://yt2certify.onrender.com';

function showToast(message, type = 'info', duration = 2500) {
  let overlay = document.querySelector('.ytw-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'ytw-overlay';
    document.body.appendChild(overlay);
  }
  const toast = document.createElement('div');
  toast.className = `ytw-toast ${type}`;
  toast.textContent = message;
  overlay.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function proxyFetch(path, options = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'proxyFetch',
      path,
      method: options.method || 'GET',
      headers: options.headers || { 'Content-Type': 'application/json' },
      body: options.body || null
    }, (response) => {
      resolve(response);
    });
  });
}

async function testAPIConnection() {
  try {
    const resp = await proxyFetch('/health');
    return !!resp?.ok;
  } catch {
    return false;
  }
}

async function retryFetch(fetchFn, maxRetries = 3, delay = 800) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchFn();
      if (result?.ok) return result;
    } catch {}
    if (attempt < maxRetries) await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Failed after retries');
}

let isBackendConnected = false;
let trackingFlag = 0; // 0 off, 1 on
let currentVideoId = null;
let savedForVideoId = null;

function getYouTubeVideoId() {
  const url = new URL(location.href);
  if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
  return url.searchParams.get('v');
}

function getPlaylistContext() {
  const url = new URL(location.href);
  const playlistId = url.searchParams.get('list') || null;
  return { playlistId };
}

function getPlayer() {
  return document.querySelector('video');
}

function getVideoTitle() {
  const el = document.querySelector('h1.title yt-formatted-string') || document.querySelector('h1.title');
  return (el && el.textContent && el.textContent.trim()) || document.title.replace('- YouTube', '').trim();
}

function onRouteChange(callback) {
  let last = location.href;
  new MutationObserver(() => {
    const now = location.href;
    if (now !== last) {
      last = now;
      callback();
    }
  }).observe(document.body, { subtree: true, childList: true });
}

async function ensureUserAndTracking() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['yt_user', 'yt_tracking_flag'], (res) => {
      const user = res.yt_user;
      trackingFlag = typeof res.yt_tracking_flag === 'number' ? res.yt_tracking_flag : 0;
      resolve({ user, trackingOn: trackingFlag === 1 });
    });
  });
}

async function saveProgress() {
  const { user, trackingOn } = await ensureUserAndTracking();
  if (!user || !user.email) return;
  if (!trackingOn) return;

  const videoId = getYouTubeVideoId();
  if (!videoId) return;
  if (savedForVideoId === videoId) return;

  const title = getVideoTitle();
  const { playlistId } = getPlaylistContext();

  try {
    // Save/ensure profile
    await retryFetch(() => proxyFetch('/profile/save', {
      method: 'POST',
      body: { name: user.name || '', email: user.email }
    }));

    // Save completion
    const resp = await retryFetch(() => proxyFetch('/video/complete', {
      method: 'POST',
      body: { email: user.email, videoId, title, playlistId, playlistTitle: '', totalVideos: 0 }
    }));

    if (resp?.ok) {
      savedForVideoId = videoId;
      showToast('✅ Progress saved', 'success', 2200);
    }
  } catch (e) {
    // Fallback to local
    const key = `yt_progress_${user.email}`;
    chrome.storage.local.get([key], (result) => {
      const local = result[key] || { videos: [], playlists: [] };
      if (!local.videos.some(v => v.videoId === videoId)) {
        local.videos.push({ videoId, title, completedAt: new Date().toISOString(), playlistId, playlistTitle: '' });
      }
      if (playlistId) {
        let p = local.playlists.find(x => x.playlistId === playlistId);
        if (!p) { p = { playlistId, playlistTitle: '', completedVideos: [], totalVideos: 0 }; local.playlists.push(p); }
        if (!p.completedVideos.includes(videoId)) p.completedVideos.push(videoId);
      }
      chrome.storage.local.set({ [key]: local }, () => {
        showToast('💾 Saved locally (offline)', 'info', 3000);
      });
    });
  }
}

function bindPlayerEvents() {
  const video = getPlayer();
  if (!video) return;
  video.removeEventListener('ended', saveProgress);
  video.addEventListener('ended', saveProgress, { once: false });
}

function handleNavigation() {
  const nextId = getYouTubeVideoId();
  if (!nextId) return;
  if (currentVideoId !== nextId) {
    currentVideoId = nextId;
    savedForVideoId = null; // allow save for new video
    // Give the page time to render title/player
    setTimeout(() => bindPlayerEvents(), 1000);
  }
}

(async function init() {
  isBackendConnected = await testAPIConnection();
  handleNavigation();
  onRouteChange(handleNavigation);
})();

