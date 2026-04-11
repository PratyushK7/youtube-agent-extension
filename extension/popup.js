const promptSelect = document.getElementById('prompt-select');

async function loadPrompts() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('http://127.0.0.1:3005/api/prompts', { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const prompts = await res.json();
    let optionsHtml = '';
    
    const master = prompts.find(p => p.id === 'master_analysis.txt');
    if (master) {
      optionsHtml += `
        <optgroup label="Deep Research Engine">
          <option value="${master.id}" data-content="${encodeURIComponent(master.content).replace(/'/g, "&apos;")}">
            FULL CHANNEL METRICS (STRATEGIC SOP)
          </option>
        </optgroup>`;
    }
    
    const tools = prompts.filter(p => !p.id.includes('master_analysis'));
    if (tools.length > 0) {
      optionsHtml += `<optgroup label="Analytical Tools">`;
      optionsHtml += tools.map(p => `
        <option value="${p.id}" data-content="${encodeURIComponent(p.content).replace(/'/g, "&apos;")}">
          ${p.name.toUpperCase()}
        </option>
      `).join('');
      optionsHtml += `</optgroup>`;
    }
    
    promptSelect.innerHTML = optionsHtml;
    
    // Load last used and SYNC with latest server content
    const saved = await chrome.storage.local.get('selectedPromptId');
    if (saved.selectedPromptId) {
      promptSelect.value = saved.selectedPromptId;
      
      // Force update the activePrompt content if it exists in the new list
      const latest = prompts.find(p => p.id === saved.selectedPromptId);
      if (latest) {
        await chrome.storage.local.set({ activePrompt: latest.content });
        console.log('Popup: Synced activePrompt with latest server content.');
      }
    } else {
      promptSelect.dispatchEvent(new Event('change')); 
    }
  } catch (e) {
    console.error('Popup: Connection to local server failed.', e);
    promptSelect.innerHTML = '<option value="">ERROR: Run .command on Desktop</option>';
    const statusEl = document.querySelector('.stat span:last-child');
    if (statusEl) {
      statusEl.style.color = '#ff4444';
      statusEl.style.fontWeight = 'bold';
      statusEl.innerText = 'OFFLINE (Wake server)';
    }
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
      activePrompt: content
    });
  } catch (err) {
    console.error('Popup: Failed to save selected prompt:', err);
  }
};

document.getElementById('open-yt').onclick = () => {
  chrome.tabs.create({ url: 'https://youtube.com' });
};

document.getElementById('view-db').onclick = () => {
  chrome.tabs.create({ url: 'http://127.0.0.1:3005/dashboard.html' });
};

async function checkSOP() {
  const data = await chrome.storage.local.get('lastMasterAnalysis');
  const statusEl = document.getElementById('sop-status');
  if (statusEl) {
    if (data.lastMasterAnalysis) {
      statusEl.innerText = 'LOADED';
      statusEl.style.color = '#10a37f';
    } else {
      statusEl.innerText = 'NONE';
      statusEl.style.color = '#aaa';
    }
  }
}

loadPrompts();
checkSOP();
