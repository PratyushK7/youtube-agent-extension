const sel = document.getElementById('prompt-select');
const dot = document.getElementById('server-dot');
const txt = document.getElementById('server-txt');
const resetBtn = document.getElementById('reset-session');

// Server
async function init() {
  let online = false;
  try {
    const r = await fetch('http://127.0.0.1:3005/api/sessions', { signal: AbortSignal.timeout(2000) });
    online = r.ok;
  } catch {}
  dot.className = online ? 'dot dot-green' : 'dot dot-red';
  txt.textContent = online ? 'Online' : 'Offline';
  txt.style.color = online ? '#22c55e' : '#ef4444';
  if (online) loadPrompts();
  else sel.innerHTML = '<option>Server offline</option>';

  // Show reset if stuck
  const d = await chrome.storage.local.get(['isSequential', '_bgState']);
  if (d.isSequential || (d._bgState && d._bgState.queue && d._bgState.queue.length > 0)) {
    resetBtn.classList.remove('hidden');
  }
}

// Prompts
async function loadPrompts() {
  try {
    const r = await fetch('http://127.0.0.1:3005/api/prompts', { signal: AbortSignal.timeout(3000) });
    const prompts = await r.json();
    sel.innerHTML = prompts.map(p => `<option value="${p.id}" data-c="${encodeURIComponent(p.content).replace(/'/g,"&apos;")}">${p.name}</option>`).join('');
    const saved = await chrome.storage.local.get('selectedPromptId');
    if (saved.selectedPromptId) {
      sel.value = saved.selectedPromptId;
      const latest = prompts.find(p => p.id === saved.selectedPromptId);
      if (latest) chrome.storage.local.set({ activePrompt: latest.content });
    } else sel.dispatchEvent(new Event('change'));
  } catch { sel.innerHTML = '<option>Error loading</option>'; }
}

sel.onchange = () => {
  const o = sel.selectedOptions[0];
  if (!o || !o.dataset.c) return;
  chrome.storage.local.set({ selectedPromptId: sel.value, activePrompt: decodeURIComponent(o.dataset.c) });
};

// Buttons
document.getElementById('open-yt').onclick = () => chrome.tabs.create({ url: 'https://youtube.com' });
document.getElementById('view-db').onclick = () => chrome.tabs.create({ url: 'http://127.0.0.1:3005/dashboard.html' });

resetBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'RESET_SESSION' }, r => {
    if (r && r.success) { resetBtn.textContent = 'Cleared'; setTimeout(() => location.reload(), 500); }
  });
};

document.getElementById('copy-logs').onclick = async () => {
  const btn = document.getElementById('copy-logs');
  try {
    const data = await chrome.storage.local.get(null);
    const s = { ...data };
    ['imageData','activePrompt','basePrompt','transcript'].forEach(k => {
      if (s[k] && s[k].length > 500) s[k] = `[${(s[k].length/1024).toFixed(1)}KB]`;
    });
    if (s._bgState && s._bgState.basePrompt && s._bgState.basePrompt.length > 500) s._bgState.basePrompt = '[truncated]';
    let srv = 'UNKNOWN', errs = '';
    try { const r = await fetch('http://127.0.0.1:3005/api/sessions',{signal:AbortSignal.timeout(2000)}); srv = r.ok ? `OK (${(await r.json()).length})` : `HTTP ${r.status}`; } catch(e) { srv = 'OFFLINE'; }
    try { const r = await fetch('http://127.0.0.1:3005/data/error.log',{signal:AbortSignal.timeout(2000)}); if(r.ok) errs = (await r.text()).split('\n').slice(-30).join('\n'); } catch {}
    await navigator.clipboard.writeText(`=== ChannelLens Logs ===\n${new Date().toISOString()}\nServer: ${srv}\n\n${JSON.stringify(s,null,2)}\n\n--- Errors ---\n${errs||'(none)'}\n=== End ===`);
    btn.textContent = 'Copied!'; btn.style.color = '#22c55e';
    setTimeout(() => { btn.textContent = 'Copy Debug Logs'; btn.style.color = ''; }, 1500);
  } catch { btn.textContent = 'Failed'; setTimeout(() => { btn.textContent = 'Copy Debug Logs'; }, 1500); }
};

init();
