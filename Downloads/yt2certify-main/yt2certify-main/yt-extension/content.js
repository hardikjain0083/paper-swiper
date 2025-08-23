(function () {
  if (window.__ytw_injected) return;
  window.__ytw_injected = true;

  // Proxy helpers via background service worker
  function proxyFetch(path, options = {}) {
    const { method = 'GET', headers = { 'Content-Type': 'application/json' }, body = null } = options;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'proxyFetch', path, method, headers, body },
        (resp) => {
          resolve(resp || { ok: false, status: 0, error: 'no response' });
        }
      );
    });
  }

  async function testAPIConnection() {
    try {
      const resp = await proxyFetch('/');
      if (resp?.ok) {
        console.log('✅ YT Progress Tracker: Backend connected successfully');
        return true;
      } else {
        console.warn('⚠️ Backend responded with status:', resp?.status, resp?.data || resp?.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Cannot connect to backend:', error?.message || String(error));
      showToast('⚠️ Backend connection failed. Check if server is running.', 'warn', 5000);
      return false;
    }
  }

  let isBackendConnected = false;
  let isTrackingEnabled = false;
  let trackingFlag = 0; // 0 = off, 1 = on
  let isUserSignedIn = false;
  // Defer UI creation until after test to ensure toast exists
  setTimeout(async () => {
    isBackendConnected = await testAPIConnection();
  }, 0);

  // Observe storage state for user and tracking toggle
  function refreshAuthAndTrackingState(cb) {
    chrome.storage.local.get(['yt_user', 'yt_tracking_flag'], (res) => {
      isUserSignedIn = !!(res.yt_user && res.yt_user.email);
      trackingFlag = isUserSignedIn ? (typeof res.yt_tracking_flag === 'number' ? res.yt_tracking_flag : 1) : 0;
      isTrackingEnabled = isUserSignedIn && trackingFlag === 1;
      if (typeof cb === 'function') cb();
    });
  }
  function applyTrackingState() {
    const v = findVideoElement();
    if (!isTrackingEnabled) {
      if (v) stopTracking(v);
      try {
        document.querySelectorAll('video').forEach((vid) => {
          vid.removeEventListener('timeupdate', onTimeUpdate);
          vid.removeEventListener('ended', onEnded);
        });
      } catch {}
      // Hide any active UI and clear queued toasts
      try { while (overlay.firstChild) overlay.removeChild(overlay.firstChild); } catch {}
      hideAttentionModal();
      const openModals = document.querySelectorAll('.ytw-modal');
      openModals.forEach(m => m && (m.style.display = 'none'));
      // Reset state
      state.crossed = new Set();
      attentionPassed = false;
      state.videoId = null;
    } else {
      if (v) setTimeout(() => initForVideo(v), 300);
    }
  }
  refreshAuthAndTrackingState(applyTrackingState);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.yt_user || changes.yt_tracking_flag) {
      refreshAuthAndTrackingState(applyTrackingState);
    }
  });

  const overlay = document.createElement('div');
  overlay.className = 'ytw-overlay';
  document.body.appendChild(overlay);
  function showToast(text, type = 'info', ttl = 3000) {
    if (!isTrackingEnabled) return;
    try {
      const t = document.createElement('div');
      t.className = `ytw-toast ${type}`;
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.textContent = text;
      overlay.appendChild(t);
      setTimeout(() => {
        if (t && t.style) {
          t.style.opacity = '0';
          setTimeout(() => t.remove(), 300);
        }
      }, ttl);
    } catch (error) {
      console.error('Error showing toast:', error);
    }
  }

  const modal = document.createElement('div');
  modal.className = 'ytw-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="ytw-modal-content" role="dialog" aria-modal="true" aria-labelledby="ytw-attn-title" aria-describedby="ytw-attn-desc">
      <h3 id="ytw-attn-title">Are you still watching?</h3>
      <p id="ytw-attn-desc">Click within <span id="ytw-timeleft">5</span>s</p>
      <button id="ytw-confirm-btn">I'm watching</button>
    </div>`;
  document.body.appendChild(modal);

  const finalModal = document.createElement('div');
  finalModal.className = 'ytw-modal';
  finalModal.style.display = 'none';
  finalModal.innerHTML = `
    <div class="ytw-modal-content" role="dialog" aria-modal="true" aria-labelledby="ytw-final-title" aria-describedby="ytw-final-msg">
      <h3 id="ytw-final-title">Video Status</h3>
      <p id="ytw-final-msg"></p>
      <button id="ytw-close-final">Close</button>
    </div>`;
  document.body.appendChild(finalModal);

  let attentionPassed = false;
  let attentionTimer = null;

  function showAttentionCheck(videoEl) {
    if (!isTrackingEnabled) return;
    modal.style.display = 'flex';
    const confirmBtn = modal.querySelector('#ytw-confirm-btn');
    setTimeout(() => confirmBtn && confirmBtn.focus(), 0);
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
    if (!isTrackingEnabled) return;
    finalModal.style.display = 'flex';
    document.getElementById('ytw-final-msg').textContent = eligible ? '🎉 You are eligible for the certificate!' : '❌ You are NOT eligible for the certificate.';
    const closeBtn = document.getElementById('ytw-close-final');
    closeBtn.onclick = () => { finalModal.style.display = 'none'; };
    setTimeout(() => closeBtn && closeBtn.focus(), 0);
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
    if (!isTrackingEnabled) return;
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
    if (!isTrackingEnabled) return;
    const eligible = state.crossed.size === state.timestamps.length && attentionPassed;
    showFinalPopup(eligible);
    if (!eligible) { showToast('You did not pass all checks. No certificate.', 'warn', 4500); return; }

    if (!isBackendConnected) {
      showToast('⚠️ Backend not connected. Cannot save progress.', 'warn', 5000);
      return;
    }

    chrome.storage.local.get(['yt_user'], async (res) => {
      const user = res.yt_user;
      console.log('🔍 Current user state:', user);
      
      if (!user || !user.email) {
        showToast('⚠️ Sign in via the extension popup to save progress.', 'warn', 5000);
        console.log('❌ No user found in storage');
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

      console.log('🎯 Attempting to save progress:', { email, videoId, title, playlistId, playlistTitle, totalVideos });

      try {
        const profileResp = await proxyFetch('/profile/save', {
          method: 'POST',
          body: { name: user.name || '', email }
        });
        if (!profileResp?.ok) {
          console.error('❌ Profile save failed:', profileResp?.status, profileResp?.data || profileResp?.error);
          showToast('⚠️ Could not save profile', 'warn', 3000);
        } else {
          console.log('✅ Profile saved successfully');
        }
      } catch (e) {
        console.error('❌ Profile save error:', e);
        showToast('⚠️ Could not save profile', 'warn', 3000);
      }

      try {
        const videoResp = await proxyFetch('/video/complete', {
          method: 'POST',
          body: { email, videoId, title, playlistId, playlistTitle, totalVideos }
        });
        if (!videoResp?.ok) {
          console.error('❌ Video completion save failed:', videoResp?.status, videoResp?.data || videoResp?.error);
          showToast('⚠️ Could not save progress', 'warn', 3500);
        } else {
          console.log('✅ Video progress saved successfully:', videoResp?.data);
          showToast('✅ Progress saved', 'success', 2200);
          if (playlistId) {
            showToast(`📈 Updated playlist progress: +1 video`, 'info', 3500);
          }
        }
      } catch (e) {
        console.error('❌ Video completion save error:', e);
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
    if (!isTrackingEnabled) return;
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
    if (!isTrackingEnabled) return;
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
