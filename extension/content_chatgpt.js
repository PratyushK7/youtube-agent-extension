// content_chatgpt.js: Pro-Analyst with Progress Tracking

const style = document.createElement('style');
style.textContent = `
  #yt-ai-progress-container {
    position: fixed; top: 0; left: 0; width: 100%; height: 50px;
    background: rgba(13, 13, 18, 0.95); backdrop-filter: blur(10px);
    border-bottom: 2px solid rgba(124, 131, 255, 0.3);
    z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif; transition: all 0.3s ease;
  }
  .yt-ai-progress-bar {
    width: 60%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; margin-bottom: 5px;
  }
  #yt-ai-progress-fill {
    width: 0%; height: 100%; background: linear-gradient(90deg, #7c83ff, #34d399);
    box-shadow: 0 0 15px rgba(124, 131, 255, 0.5); transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  }
  #yt-ai-progress-text { color: #fff; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
  .yt-ai-toast {
    position: fixed; bottom: 30px; right: 30px; background: #059669; color: white;
    padding: 12px 24px; border-radius: 12px; font-weight: 600; z-index: 10001;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5); animation: toastIn 0.4s ease-out;
  }
  @keyframes toastIn { from { transform: translateY(100%) scale(0.9); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
`;
document.head.appendChild(style);

// --- UI Helpers ---
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'yt-ai-toast';
  toast.innerHTML = `✅ ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function updateProgressBar(current, total) {
  let barContainer = document.getElementById('yt-ai-progress-container');
  if (!barContainer) {
    barContainer = document.createElement('div');
    barContainer.id = 'yt-ai-progress-container';
    barContainer.innerHTML = `
      <div class="yt-ai-progress-bar">
        <div id="yt-ai-progress-fill"></div>
      </div>
      <div id="yt-ai-progress-text"></div>
    `;
    document.body.appendChild(barContainer);
  }
  const pct = (current / total) * 100;
  document.getElementById('yt-ai-progress-fill').style.width = `${pct}%`;
  document.getElementById('yt-ai-progress-text').innerText = `Strategic Research: Video ${current} of ${total}`;
}

// --- Logic ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TRIGGER_STEP') {
    automateChatGPT(request.retryAttempt || 0);
  }
  if (request.action === 'FINAL_SYNTHESIS') {
    generateMasterDossier(request.channelName);
  }
});

async function syncToBackend(reportText, channelName) {
  const data = await chrome.storage.local.get(['channelName', 'imageData']);
  const finalChannel = channelName || data.channelName || 'Unknown Channel';
  
  console.log('YT-to-AI: Deep-scanning for Strategic JSON...');
  let videos = [];
  try {
    const jsonMatch = reportText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) videos = JSON.parse(jsonMatch[0]);
  } catch (e) {}
  
  await chrome.runtime.sendMessage({
    action: 'SYNC_REPORT',
    payload: {
      channel: finalChannel,
      screenshot: data.imageData,
      report: reportText,
      videos: videos,
      promptUsed: 'Sequential Analysis'
    }
  });
  showToast('Strategic Data Captured & Synced');
}

async function monitorResponse(isFinal = false, channelName) {
  console.log('YT-to-AI: Heartbeat Monitor Active...');
  let lastText = '';
  let stabilityCount = 0;
  
  const interval = setInterval(() => {
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (messages.length === 0) return;
    const currentText = messages[messages.length - 1].innerText;
    
    const isGenerating = !!document.querySelector('button[aria-label="Stop generating"], [data-testid="stop-button"]');
    
    if (currentText === lastText && currentText.length > 20) {
      stabilityCount++;
    } else {
      stabilityCount = 0;
    }

    if (stabilityCount >= 2 && !isGenerating) {
      console.log('✅ YT-to-AI: Stability Reached.');
      clearInterval(interval);
      syncToBackend(currentText, channelName).then(() => {
        if (!isFinal) chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'success' });
      });
    }
    lastText = currentText;
  }, 2000);
}

async function automateChatGPT(retryAttempt = 0) {
  const data = await chrome.storage.local.get(['pendingAnalysis', 'imageData', 'prompt', 'step', 'totalSteps']);
  if (!data.pendingAnalysis) return;

  // 🛡️ CRITICAL: Clear pending flag immediately to prevent loops
  await chrome.storage.local.remove('pendingAnalysis');
  
  updateProgressBar(data.step || 1, data.totalSteps || 1);
  console.log(`YT-to-AI: Processing Video ${data.step}/${data.totalSteps}`);

  const waitForInput = () => new Promise(resolve => {
    const int = setInterval(() => {
      const input = document.querySelector('#prompt-textarea');
      if (input) { clearInterval(int); resolve(input); }
    }, 500);
  });

  const promptInput = await waitForInput();
  promptInput.focus();

  // Pulse-Paste Image
  if (data.imageData) {
    try {
      const resp = await fetch(data.imageData);
      const blob = await resp.blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'snapshot.png', { type: blob.type }));
      promptInput.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
    } catch (e) {}
  }

  // Inject Text
  setTimeout(() => {
    document.execCommand('insertText', false, data.prompt);
    setTimeout(() => {
      let sendBtn = document.querySelector('button[data-testid="send-button"]') || 
                    document.querySelector('button.bg-black, button[aria-label="Send prompt"]');
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        monitorResponse();
      } else {
        const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        promptInput.dispatchEvent(enter);
        monitorResponse();
      }
    }, 2000);
  }, 2500); 
}

async function generateMasterDossier(channelName) {
  const promptInput = document.querySelector('#prompt-textarea');
  updateProgressBar(10, 10); // Final state
  
  const finalPrompt = `[PHASE: FINAL CHANNEL SYNTHESIS]\n\nBased on all videos, provide the final JSON Master Synthesis.`;
  promptInput.focus();
  document.execCommand('insertText', false, finalPrompt);
  setTimeout(() => {
    const sendBtn = document.querySelector('button[data-testid="send-button"]') || document.querySelector('button.bg-black');
    if (sendBtn) { sendBtn.click(); monitorResponse(true, channelName); }
  }, 1200);
}

// Init
window.addEventListener('load', () => {
  chrome.storage.local.get(['pendingAnalysis'], (d) => { if (d.pendingAnalysis) automateChatGPT(); });
});
