(function () {
  if (window.__ytw_injected) return;
  window.__ytw_injected = true;

  const API_BASE = 'http://localhost:5000';

  const overlay = document.createElement('div');
  overlay.className = 'ytw-overlay';
  document.body.appendChild(overlay);
  function showToast(text, type = 'info', ttl = 3000) {
    const t = document.createElement('div');
    t.className = `ytw-toast ${type}`;
    t.textContent = text;
    overlay.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ttl);
  }

  const modal = document.createElement('div');
  modal.className = 'ytw-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="ytw-modal-content">
      <h3>Are you still watching?</h3>
      <p>Click within <span id="ytw-timeleft">5</span>s</p>
      <button id="ytw-confirm-btn">I'm watching</button>
    </div>`;
  document.body.appendChild(modal);

  const finalModal = document.createElement('div');
  finalModal.className = 'ytw-modal';
  finalModal.style.display = 'none';
  finalModal.innerHTML = `
    <div class="ytw-modal-content">
      <h3>Video Status</h3>
      <p id="ytw-final-msg"></p>
      <button id="ytw-close-final">Close</button>
    </div>`;
  document.body.appendChild(finalModal);

  let attentionPassed = false;
  let attentionTimer = null;

  function showAttentionCheck(videoEl) {
    modal.style.display = 'flex';
    let sec = 5;
    modal.querySelector('#ytw-timeleft').textContent = sec;
    attentionPassed = false;
    attentionTimer = setInterval(() => {
      sec--;
      modal.querySelector('#ytw-timeleft').textContent = sec;
      if (sec <= 0) {
        clearInterval(attentionTimer);
        hideAttentionModal();
        videoEl.currentTime = 0;
        videoEl.pause();
        showToast('⏳ Attention check failed — video reset', 'warn', 4000);
      }
    }, 1000);

    modal.querySelector('#ytw-confirm-btn').onclick = () => {
      attentionPassed = true;
      clearInterval(attentionTimer);
      hideAttentionModal();
      showToast('✅ Attention check passed', 'success', 2000);
      videoEl.play();
    };
  }
  function hideAttentionModal() {
    modal.style.display = 'none';
    if (attentionTimer) { clearInterval(attentionTimer); attentionTimer = null; }
  }

  function showFinalPopup(eligible) {
    finalModal.style.display = 'flex';
    document.getElementById('ytw-final-msg').textContent = eligible ? '🎉 You are eligible for the certificate!' : '❌ You are NOT eligible for the certificate.';
    document.getElementById('ytw-close-final').onclick = () => { finalModal.style.display = 'none'; };
  }

  const state = { videoId: null, timestamps: [], crossed: new Set(), attentionAt: null };

  function getVideoIdFromUrl(url = location.href) {
    try {
      const u = new URL(url);
      const v = u.searchParams.get('v'); if (v && v.length === 11) return v;
      const m = url.match(/\/shorts\/([A-Za-z0-9_-]{11})/); return m ? m[1] : null;
    } catch { return null; }
  }
  function getPlaylistIdFromUrl(url = location.href) {
    try { const u = new URL(url); return u.searchParams.get('list'); } catch { return null; }
  }
  function getPlaylistIndexFromUrl(url = location.href) {
    try { const u = new URL(url); return parseInt(u.searchParams.get('index') || '1', 10); } catch { return 1; }
  }
  function findVideoElement() { return document.querySelector('video.html5-main-video') || document.querySelector('video'); }

  function generateTimestamps(duration, count = 5) {
    const min = Math.ceil(duration * 0.05), max = Math.floor(duration * 0.95);
    const s = new Set(); const possible = Math.max(0, max - min + 1); const toGen = Math.min(count, possible);
    if (toGen <= 0) return [];
    while (s.size < toGen) s.add(Math.floor(Math.random() * (max - min + 1)) + min);
    return Array.from(s).sort((a, b) => a - b);
  }

  function startTracking(videoEl) {
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('ended', onEnded);
  }
  function stopTracking(videoEl) {
    videoEl.removeEventListener('timeupdate', onTimeUpdate);
    videoEl.removeEventListener('ended', onEnded);
  }

  function onTimeUpdate() {
    const v = findVideoElement(); if (!v) return;
    const now = Math.floor(v.currentTime);
    state.timestamps.forEach((ts, idx) => {
      if (now === ts && !state.crossed.has(idx)) {
        state.crossed.add(idx);
        showToast(`✅ Checkpoint ${state.crossed.size} / ${state.timestamps.length} reached`, 'success', 3000);
        if (ts === state.attentionAt) {
          v.pause();
          showAttentionCheck(v);
        }
      }
    });
  }

  async function onEnded() {
    const eligible = state.crossed.size === state.timestamps.length && attentionPassed;
    showFinalPopup(eligible);
    if (!eligible) { showToast('You did not pass all checks. No certificate.', 'warn', 4500); return; }

    chrome.storage.local.get(['yt_user'], async (res) => {
      const user = res.yt_user;
      if (!user || !user.email) {
        showToast('⚠️ Sign in via the extension popup to save progress.', 'warn', 5000);
        return;
      }

      const email = user.email;
      const videoId = state.videoId;
      const title = document.title || '';
      const playlistId = getPlaylistIdFromUrl();
      const playlistTitle = playlistId ? document.title : '';
      let totalVideos = 0;
      if (playlistId) {
        const nodes = document.querySelectorAll('ytd-playlist-video-renderer');
        totalVideos = nodes.length || 0;
      }

      try {
        await fetch(`${API_BASE}/profile/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: user.name || '', email })
        });
      } catch {}

      try {
        await fetch(`${API_BASE}/video/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, videoId, title, playlistId, playlistTitle, totalVideos })
        });
        showToast('✅ Progress saved', 'success', 2200);

        if (playlistId) {
          showToast(`📈 Updated playlist progress: +1 video`, 'info', 3500);
        }
      } catch {
        showToast('⚠️ Could not save progress', 'warn', 3500);
      }
    });
  }



  function waitForTotalVideosInPlaylist(callback) {
  let tries = 0;
  const interval = setInterval(() => {
    let totalVideos = document.querySelectorAll('ytd-playlist-video-renderer').length;

    if (!totalVideos) {
      totalVideos = document.querySelectorAll('ytd-playlist-panel-video-renderer').length;
    }

    if (!totalVideos) {
      const header = document.querySelector('#publisher-container, #header-description') ||
                     document.querySelector('.ytd-playlist-panel-renderer');
      const text = header ? header.innerText : '';
      const match = text.match(/(\d+)\s*videos?/i);
      if (match) totalVideos = parseInt(match[1], 10);
    }

    if (totalVideos > 0 || tries > 20) { // 20 tries x 300ms = 6 seconds max
      clearInterval(interval);
      callback(totalVideos || 0);
    }

    tries++;
  }, 300);


}
  function initForVideo(videoEl) {
  const dur = videoEl.duration;
  if (!isFinite(dur) || dur <= 0) {
    videoEl.addEventListener('loadedmetadata', () => initForVideo(videoEl), { once: true });
    return;
  }

  setTimeout(() => {
    const playlistId = getPlaylistIdFromUrl();
    const playlistIndex = getPlaylistIndexFromUrl();

    if (playlistId) {
      waitForTotalVideosInPlaylist(totalVideos => {
        showToast(`📺 Watching ${playlistIndex}/${totalVideos} videos in this playlist`, 'info', 5000);
      });
    } else {
      showToast(`🎬 You are watching a single video`, 'success', 5000);
    }

    state.timestamps = generateTimestamps(dur, 5);
    state.attentionAt = state.timestamps[Math.floor(Math.random() * state.timestamps.length)];
    state.crossed = new Set();
    attentionPassed = false;

    startTracking(videoEl);
  }, 800);
}
  let lastUrl = location.href;
  function onUrlChange() {
    const vid = getVideoIdFromUrl();
    if (!vid) return;
    if (vid !== state.videoId) {
      const prevV = findVideoElement();
      if (prevV) stopTracking(prevV);
      state.videoId = vid;
      const v = findVideoElement();
      if (v) setTimeout(() => initForVideo(v), 400);
    }
  }
  const origPush = history.pushState;
  history.pushState = function () { origPush.apply(this, arguments); setTimeout(onUrlChange, 300); };
  window.addEventListener('popstate', () => setTimeout(onUrlChange, 300));
  const mo = new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(onUrlChange, 300); } });
  mo.observe(document, { subtree: true, childList: true });

  onUrlChange();
})();
