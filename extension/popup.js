const dot = document.getElementById('server-dot');
const txt = document.getElementById('server-txt');
const resetBtn = document.getElementById('reset-session');
const serverToggle = document.getElementById('server-toggle');
const managerStatus = document.getElementById('manager-status');

const MANAGER_URL = 'http://localhost:3006';

// Server
async function init() {
  // Check main server status
  let online = false;
  try {
    const r = await fetch('http://127.0.0.1:3005/api/sessions', { signal: AbortSignal.timeout(1000) });
    online = r.ok;
  } catch {}
  dot.className = online ? 'dot dot-green' : 'dot dot-red';
  txt.textContent = online ? 'Online' : 'Offline';
  txt.style.color = online ? '#22c55e' : '#ef4444';

  // Check native manager status via background
  chrome.runtime.sendMessage({ action: 'GET_SERVER_STATUS' }, (res) => {
    if (res && res.status !== 'offline') {
      managerStatus.textContent = 'Auto-Bridge Active';
      managerStatus.style.color = '#6366f1';
      serverToggle.disabled = false;
      serverToggle.checked = !!res.running;
    } else {
      managerStatus.textContent = 'Bridge Offline (run setup.sh)';
      managerStatus.style.color = '#ef4444';
      serverToggle.disabled = true;
    }
  });

  // Show reset if stuck
  const d = await chrome.storage.local.get(['isSequential', '_bgState']);
  if (d.isSequential || (d._bgState && d._bgState.queue && d._bgState.queue.length > 0)) {
    resetBtn.classList.remove('hidden');
  }
}

// Toggle logic
serverToggle.onchange = async () => {
  const start = serverToggle.checked;
  serverToggle.disabled = true;
  chrome.runtime.sendMessage({ action: 'TOGGLE_SERVER', start }, (res) => {
    if (res && res.success) {
      setTimeout(init, 1500);
    } else {
      console.error('Failed to toggle server:', res?.error);
      init();
    }
  });
};

// Buttons
document.getElementById('open-yt').onclick = () => chrome.tabs.create({ url: 'https://youtube.com' });
document.getElementById('view-db').onclick = () => chrome.tabs.create({ url: 'http://127.0.0.1:3005/dashboard.html' });

resetBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'RESET_SESSION' }, r => {
    if (r && r.success) { resetBtn.textContent = 'Cleared'; setTimeout(() => location.reload(), 500); }
  });
};

init();
// Poll every 5 seconds
setInterval(init, 5000);
