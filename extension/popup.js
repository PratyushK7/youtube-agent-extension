const promptSelect = document.getElementById('prompt-select');
const openYouTubeButton = document.getElementById('open-yt');
const dashboardButton = document.getElementById('view-db');

function setLoading(button, isLoading) {
  if (!button) return;
  button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  button.disabled = Boolean(isLoading);
}

function showToast(message, variant = 'success') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  const toast = document.createElement('div');
  toast.className = 'ds-toast';
  toast.dataset.variant = variant;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => toast.remove(), 2400);
}

async function loadPrompts() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('http://127.0.0.1:3005/api/prompts', { signal: controller.signal });
    clearTimeout(timeoutId);

    const prompts = await res.json();
    let optionsHtml = '';

    const master = prompts.find((p) => p.id === 'master_analysis.txt');
    if (master) {
      optionsHtml += `
        <optgroup label="Deep Research Engine">
          <option value="${master.id}" data-content="${encodeURIComponent(master.content).replace(/'/g, '&apos;')}">
            FULL CHANNEL METRICS (STRATEGIC SOP)
          </option>
        </optgroup>`;
    }

    const tools = prompts.filter((p) => !p.id.includes('master_analysis'));
    if (tools.length > 0) {
      optionsHtml += '<optgroup label="Analytical Tools">';
      optionsHtml += tools.map((p) => `
        <option value="${p.id}" data-content="${encodeURIComponent(p.content).replace(/'/g, '&apos;')}">
          ${p.name.toUpperCase()}
        </option>
      `).join('');
      optionsHtml += '</optgroup>';
    }

    promptSelect.innerHTML = optionsHtml;

    const saved = await chrome.storage.local.get('selectedPromptId');
    if (saved.selectedPromptId) {
      promptSelect.value = saved.selectedPromptId;
      const latest = prompts.find((p) => p.id === saved.selectedPromptId);
      if (latest) {
        await chrome.storage.local.set({ activePrompt: latest.content });
      }
    } else {
      promptSelect.dispatchEvent(new Event('change'));
    }
  } catch (e) {
    console.error('Popup: Connection to local server failed.', e);
    promptSelect.innerHTML = '<option value="">ERROR: Run .command on Desktop</option>';

    const statusEl = document.getElementById('sop-status');
    if (statusEl) {
      statusEl.className = 'stat-val offline';
      statusEl.innerText = 'OFFLINE';
    }

    showToast('Server offline. Start local backend.', 'warning');
  }
}

promptSelect.onchange = async () => {
  try {
    if (!promptSelect.selectedOptions || promptSelect.selectedOptions.length === 0) return;
    const option = promptSelect.selectedOptions[0];
    if (!option.getAttribute('data-content')) return;

    const content = decodeURIComponent(option.getAttribute('data-content'));
    await chrome.storage.local.set({
      selectedPromptId: promptSelect.value,
      activePrompt: content,
    });
  } catch (err) {
    console.error('Popup: Failed to save selected prompt:', err);
    showToast('Unable to save prompt selection.', 'danger');
  }
};

openYouTubeButton.onclick = () => {
  setLoading(openYouTubeButton, true);
  chrome.tabs.create({ url: 'https://youtube.com' }, () => {
    setLoading(openYouTubeButton, false);
  });
};

dashboardButton.onclick = () => {
  setLoading(dashboardButton, true);
  chrome.tabs.create({ url: 'http://127.0.0.1:3005/dashboard.html' }, () => {
    setLoading(dashboardButton, false);
  });
};

async function checkSOP() {
  const data = await chrome.storage.local.get(['sessionId', 'isSequential', '_bgState']);
  const statusEl = document.getElementById('sop-status');
  if (statusEl) {
    if (data.isSequential && data.sessionId) {
      statusEl.innerText = 'IN PROGRESS';
      statusEl.className = 'stat-val progress';
    } else if (data.sessionId) {
      statusEl.innerText = 'LOADED';
      statusEl.className = 'stat-val online';
    } else {
      statusEl.innerText = 'NONE';
      statusEl.className = 'stat-val none';
    }
  }

  const resumeBtn = document.getElementById('resume-session');
  if (data._bgState && data._bgState.queue && data._bgState.queue.length > 0 && data._bgState.currentIndex < data._bgState.queue.length) {
    if (resumeBtn) {
      resumeBtn.style.display = 'flex';
      resumeBtn.onclick = () => {
        setLoading(resumeBtn, true);
        chrome.runtime.sendMessage({ action: 'RESUME_SEQUENTIAL' }, (response) => {
          if (response && response.success) {
            window.close();
          } else {
            setLoading(resumeBtn, false);
            showToast('Unable to resume session.', 'warning');
          }
        });
      };
    }
  }
}

loadPrompts();
checkSOP();
