// popup.js
const API_BASE = 'http://localhost:5000';

document.addEventListener('DOMContentLoaded', () => {
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
  const completedList = document.getElementById('completed-list');
  const playlistsList = document.getElementById('playlists-list');

  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    [...tabs.querySelectorAll('.tab')].forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
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

  btnSignup.addEventListener('click', async () => {
    const name = inputName.value.trim();
    const email = inputEmail.value.trim();
    if (!email) { authMsg.textContent = 'Email is required.'; return; }
    authMsg.textContent = 'Saving...';
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
  });

  btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim();
    if (!email) { authMsg.textContent = 'Email is required to sign in.'; return; }
    authMsg.textContent = 'Signing in...';
    try {
      const r = await fetch(`${API_BASE}/profile/${encodeURIComponent(email)}`);
      if (!r.ok) { authMsg.textContent = 'No profile found.'; return; }
      const user = await r.json();
      chrome.storage.local.set({ yt_user: { name: user.name || '', email: user.email } }, () => {
        authMsg.textContent = 'Signed in.';
        setTimeout(() => document.querySelector('.tab[data-page="dashboard"]').click(), 600);
      });
    } catch { authMsg.textContent = 'Sign in failed.'; }
  });

  btnLogout.addEventListener('click', () => {
    chrome.storage.local.remove(['yt_user'], () => {
      inputName.value = '';
      inputEmail.value = '';
      document.querySelector('.tab[data-page="auth"]').click();
    });
  });

  async function loadDashboard() {
    completedList.innerHTML = 'Loading...';
    playlistsList.innerHTML = 'Loading...';
    chrome.storage.local.get(['yt_user'], async (res) => {
      const user = res.yt_user;
      if (!user || !user.email) {
        completedList.textContent = 'Please sign in.';
        playlistsList.textContent = '';
        return;
      }
      userInfo.textContent = `${user.name || '(no name)'} — ${user.email}`;
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
