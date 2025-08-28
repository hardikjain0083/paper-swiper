// popup.js
const API_BASE = 'https://yt2certify.onrender.com';

// Test API connection on load
async function testAPIConnection() {
  const statusElement = document.getElementById('backend-status');
  const statusText = document.getElementById('status-text');
  
  // Set checking state
  statusElement.className = 'backend-status checking';
  statusText.textContent = 'Checking connection...';
  
  try {
    console.log('🔍 Testing API connection from popup...');
    const response = await fetch(`${API_BASE}/health`, { 
      method: 'GET',
      headers: { 'User-Agent': 'YT-Extension/1.0' }
    });
    console.log('🔍 Health check response:', response.status, response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ YT Progress Tracker: Backend connected successfully', data);
      statusElement.className = 'backend-status connected';
      statusText.textContent = `Backend connected (${data.mongodb})`;
      return true;
    } else {
      console.warn('⚠️ YT Progress Tracker: Backend responded with status:', response.status);
      statusElement.className = 'backend-status disconnected';
      statusText.textContent = `Backend error: ${response.status}`;
      return false;
    }
  } catch (error) {
    console.error('❌ YT Progress Tracker: Cannot connect to backend:', error.message);
    statusElement.className = 'backend-status disconnected';
    statusText.textContent = 'Backend disconnected';
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Test connection first
  const isConnected = await testAPIConnection();
  if (!isConnected) {
    document.getElementById('auth-msg').textContent = '⚠️ Cannot connect to backend. Please check if the server is running.';
    document.getElementById('auth-msg').style.color = '#f59e0b';
  }

  const tabs = document.getElementById('tabs');
  const pageAuth = document.getElementById('page-auth');
  const pageDashboard = document.getElementById('page-dashboard');
  const inputName = document.getElementById('input-name');
  const inputEmail = document.getElementById('input-email');
  const btnSignup = document.getElementById('btn-signup');
  const btnLogin = document.getElementById('btn-login');
  const authMsg = document.getElementById('auth-msg');
  const userInfo = document.getElementById('user-info');
  const btnLogout = document.getElementById('btn-logout');
  const toggleTracking = document.getElementById('toggle-tracking');
  const completedList = document.getElementById('completed-list');
  const playlistsList = document.getElementById('playlists-list');
  const btnSync = document.getElementById('btn-sync');
  const toggleLabel = document.getElementById('toggle-label');

  // Function to sync local progress with backend
  async function syncLocalProgress() {
    if (!btnSync) return;
    
    setButtonLoading(btnSync, true, 'Syncing...');
    
    try {
      chrome.storage.local.get(['yt_user'], async (res) => {
        if (!res.yt_user || !res.yt_user.email) {
          console.log('No user found for sync');
          setButtonLoading(btnSync, false);
          return;
        }

        const key = `yt_progress_${res.yt_user.email}`;
        chrome.storage.local.get([key], async (result) => {
          const localProgress = result[key];
          if (!localProgress || (!localProgress.videos.length && !localProgress.playlists.length)) {
            console.log('No local progress to sync');
            setButtonLoading(btnSync, false);
            return;
          }

          console.log('🔄 Syncing local progress with backend...', localProgress);
          let syncedCount = 0;

          // Sync videos
          for (const video of localProgress.videos) {
            try {
              const response = await fetch(`${API_BASE}/video/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: res.yt_user.email,
                  videoId: video.videoId,
                  title: video.title,
                  playlistId: video.playlistId,
                  playlistTitle: video.playlistTitle
                })
              });
              
              if (response.ok) {
                syncedCount++;
                console.log(`✅ Synced video: ${video.videoId}`);
              }
            } catch (error) {
              console.error(`❌ Failed to sync video ${video.videoId}:`, error);
            }
          }

          // Clear local progress after sync
          chrome.storage.local.remove([key], () => {
            console.log('🧹 Cleared local progress after sync');
            setButtonLoading(btnSync, false);
            if (syncedCount > 0) {
              alert(`Successfully synced ${syncedCount} videos with the backend!`);
              loadDashboard(); // Refresh the dashboard
            } else {
              alert('No videos were synced. Please try again.');
            }
          });
        });
      });
    } catch (error) {
      console.error('❌ Failed to sync local progress:', error);
      setButtonLoading(btnSync, false);
      alert('Failed to sync progress. Please try again.');
    }
  }

  // Add event listener for sync button
  if (btnSync) {
    btnSync.addEventListener('click', syncLocalProgress);
  }

  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    [...tabs.querySelectorAll('.tab')].forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    tabs.setAttribute('data-active', tab.dataset.page);
    if (tab.dataset.page === 'auth') { pageAuth.style.display = ''; pageDashboard.style.display = 'none'; }
    else { pageAuth.style.display = 'none'; pageDashboard.style.display = ''; loadDashboard(); }
  });

  chrome.storage.local.get(['yt_user'], (res) => {
    if (res.yt_user) {
      inputName.value = res.yt_user.name || '';
      inputEmail.value = res.yt_user.email || '';
      document.querySelector('.tab[data-page="dashboard"]').click();
    }
  });

  // Initialize tracking toggle state (default off when no user)
  function setToggleUIFromFlag(flag) {
    const isOn = Number(flag) === 1;
    toggleTracking.setAttribute('aria-checked', isOn ? 'true' : 'false');
    if (toggleLabel) toggleLabel.textContent = isOn ? 'Tracking ON' : 'Tracking OFF';
  }

  function setToggleDisabled(disabled) {
    toggleTracking.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    toggleTracking.disabled = !!disabled;
  }

  chrome.storage.local.get(['yt_user', 'yt_tracking_flag'], (res) => {
    const hasUser = !!(res.yt_user && res.yt_user.email);
    if (!hasUser) {
      // force off when no user
      setToggleUIFromFlag(0);
      setToggleDisabled(true);
      chrome.storage.local.set({ yt_tracking_flag: 0 });
      return;
    }
    // Default to ON when signed in if flag not present
    const flag = typeof res.yt_tracking_flag === 'number' ? res.yt_tracking_flag : 1;
    setToggleDisabled(false);
    setToggleUIFromFlag(flag);
    if (typeof res.yt_tracking_flag !== 'number') {
      chrome.storage.local.set({ yt_tracking_flag: flag });
    }
  });

  toggleTracking.addEventListener('click', () => {
    if (toggleTracking.disabled) return;
    const nextIsOn = toggleTracking.getAttribute('aria-checked') !== 'true';
    const nextFlag = nextIsOn ? 1 : 0;
    setToggleUIFromFlag(nextFlag);
    chrome.storage.local.set({ yt_tracking_flag: nextFlag });
  });

  function setButtonLoading(buttonEl, isLoading, loadingText = 'Loading...') {
    const textEl = buttonEl.querySelector('.btn-text');
    if (isLoading) {
      buttonEl.disabled = true;
      buttonEl.dataset.prevText = textEl.textContent;
      textEl.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span> ${loadingText}`;
    } else {
      buttonEl.disabled = false;
      const prev = buttonEl.dataset.prevText || '';
      textEl.textContent = prev;
      delete buttonEl.dataset.prevText;
    }
  }

  btnSignup.addEventListener('click', async () => {
    const name = inputName.value.trim();
    const email = inputEmail.value.trim();
    if (!email) { authMsg.textContent = 'Email is required.'; return; }
    authMsg.textContent = 'Saving...';
    setButtonLoading(btnSignup, true, 'Saving...');
    try {
      const r = await fetch(`${API_BASE}/profile/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
      });
      if (!r.ok) throw new Error('Save failed');
      chrome.storage.local.set({ yt_user: { name, email } }, () => {
        authMsg.textContent = 'Profile saved. Switching to dashboard...';
        setTimeout(() => document.querySelector('.tab[data-page="dashboard"]').click(), 700);
      });
    } catch { authMsg.textContent = 'Failed to save profile.'; }
    finally { setButtonLoading(btnSignup, false); }
  });

  btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim();
    if (!email) { authMsg.textContent = 'Email is required to sign in.'; return; }
    authMsg.textContent = 'Signing in...';
    setButtonLoading(btnLogin, true, 'Signing in...');
    try {
      const r = await fetch(`${API_BASE}/profile/${encodeURIComponent(email)}`);
      if (!r.ok) { authMsg.textContent = 'No profile found.'; return; }
      const user = await r.json();
      chrome.storage.local.set({ yt_user: { name: user.name || '', email: user.email } }, () => {
        authMsg.textContent = 'Signed in.';
        setTimeout(() => document.querySelector('.tab[data-page="dashboard"]').click(), 600);
      });
    } catch { authMsg.textContent = 'Sign in failed.'; }
    finally { setButtonLoading(btnLogin, false); }
  });

  btnLogout.addEventListener('click', () => {
    chrome.storage.local.remove(['yt_user'], () => {
      inputName.value = '';
      inputEmail.value = '';
      // Disable and turn off tracking when no user
      setToggleUIFromFlag(0);
      setToggleDisabled(true);
      chrome.storage.local.set({ yt_tracking_flag: 0 });
      document.querySelector('.tab[data-page="auth"]').click();
    });
  });

  function renderSkeletons() {
    completedList.innerHTML = '<div class="list-skeleton" aria-hidden="true"><div class="skeleton-line" style="width:85%;"></div><div class="skeleton-line" style="width:70%;"></div><div class="skeleton-line" style="width:60%;"></div></div>';
    playlistsList.innerHTML = '<div class="list-skeleton" aria-hidden="true"><div class="skeleton-line" style="width:75%;"></div><div class="skeleton-line" style="width:65%;"></div></div>';
  }

  async function loadDashboard() {
    renderSkeletons();
    chrome.storage.local.get(['yt_user'], async (res) => {
      const user = res.yt_user;
      if (!user || !user.email) {
        completedList.textContent = 'Please sign in.';
        playlistsList.textContent = '';
        return;
      }
      userInfo.textContent = `${user.name || '(no name)'} — ${user.email}`;
      // Ensure toggle is enabled for signed-in user; default to previously saved or on
      chrome.storage.local.get(['yt_tracking_flag'], (state) => {
        const flag = typeof state.yt_tracking_flag === 'number' ? state.yt_tracking_flag : 1;
        setToggleDisabled(false);
        setToggleUIFromFlag(flag);
        if (typeof state.yt_tracking_flag !== 'number') {
          chrome.storage.local.set({ yt_tracking_flag: flag });
        }
      });

      // Check for local progress and show sync button if needed
      const key = `yt_progress_${user.email}`;
      chrome.storage.local.get([key], (result) => {
        const localProgress = result[key];
        if (localProgress && (localProgress.videos.length > 0 || localProgress.playlists.length > 0)) {
          btnSync.style.display = 'block';
          console.log('📋 Found local progress, sync button enabled');
        } else {
          btnSync.style.display = 'none';
        }
      });
      try {
        const r = await fetch(`${API_BASE}/video/completed/${encodeURIComponent(user.email)}`);
        if (!r.ok) throw new Error('Failed');
        const data = await r.json();

        completedList.innerHTML = '';
        if (!data.completedVideos?.length) {
          completedList.innerHTML = '<div class="small">No completed videos yet.</div>';
        } else {
          data.completedVideos.forEach(v => {
            const div = document.createElement('div');
            div.className = 'completed-item';
            const a = document.createElement('a');
            a.href = `${API_BASE}/certificate/${encodeURIComponent(user.email)}/${encodeURIComponent(v.videoId)}`;
            a.textContent = v.title || v.videoId;
            a.target = '_blank';
            div.appendChild(a);
            completedList.appendChild(div);
          });
        }

        playlistsList.innerHTML = '';
        if (!data.playlists?.length) {
          playlistsList.innerHTML = '<div class="small">No playlist progress yet.</div>';
        } else {
          data.playlists.forEach(p => {
            const div = document.createElement('div');
            div.className = 'completed-item';
            const txt = document.createElement('div');
            txt.innerHTML = `<strong>${p.playlistTitle || p.playlistId}</strong><div class="small">You have watched ${p.completedCount} / ${p.totalVideos} videos</div>`;
            div.appendChild(txt);
            playlistsList.appendChild(div);
          });
        }
      } catch {
        completedList.textContent = 'Failed to load.';
        playlistsList.textContent = '';
      }
    });
  }
});
