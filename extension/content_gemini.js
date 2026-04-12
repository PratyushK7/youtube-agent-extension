// content_gemini.js: Nano Banana Orchestrator

const style = document.createElement('style');
style.textContent = `
  .yt-ai-toast {
    position: fixed; bottom: 30px; right: 30px; background: #fbbf24; color: black;
    padding: 12px 24px; border-radius: 12px; font-weight: 700; z-index: 10001;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5); animation: toastIn 0.4s ease-out;
    font-family: sans-serif;
  }
  @keyframes toastIn { from { transform: translateY(100%) scale(0.9); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
`;
document.head.appendChild(style);

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'yt-ai-toast';
  toast.innerHTML = `🍌 ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function waitForElm(selector) {
  return new Promise(resolve => {
    const directHit = document.querySelector(selector);
    if (directHit) return resolve(directHit);
    const observer = new MutationObserver(() => {
      const hit = document.querySelector(selector);
      if (hit) { observer.disconnect(); resolve(hit); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// General Gemini Selectors
const INPUT_SELECTOR = 'rich-textarea, div[contenteditable="true"][aria-label="Enter a prompt here"], rich-textarea > div[contenteditable="true"]';
const SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"], button[mattooltip="Send message"], .send-button';
const RESPONSE_SELECTOR = 'message-content, div.model-response-text';
const STOP_SELECTOR = 'button[aria-label="Stop response"], .generating-indicator';

async function handleNanoBananaSequence(sessionId) {
  showToast('Initializing Nano Banana (Vision)...');
  
  try {
    const el = await waitForElm(INPUT_SELECTOR);
    await new Promise(r => setTimeout(r, 1500)); // Stabilization
    el.focus();

    // Fetch the stored session to get the frame paths
    const sessRes = await fetch(`http://127.0.0.1:3005/api/session/${sessionId}`);
    const sessData = await sessRes.json();
    if (!sessData.success || !sessData.session.sceneFrames || sessData.session.sceneFrames.length === 0) {
      throw new Error("No Scene Frames found on server.");
    }
    
    showToast('Injecting 5 Cinematic Frames...');
    
    // Construct Multi-Image Paste Event
    const dt = new DataTransfer();
    for (let i = 0; i < sessData.session.sceneFrames.length; i++) {
        const url = `http://127.0.0.1:3005${sessData.session.sceneFrames[i]}`;
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], `scene_${i}.png`, { type: 'image/png' });
        dt.items.add(file);
    }

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    el.dispatchEvent(pasteEvent);
    
    // 🛡️ Give Gemini plenty of time to process 5 high-res frames
    showToast('Encoding Visual Data (Processing Frames)...');
    await new Promise(r => setTimeout(r, 7000));

    // Fetch Prompt
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const prompts = await promptsRes.json();
    const scenePrompt = prompts.find(p => p.id === 'scene-analyzer.txt');
    const promptText = scenePrompt ? scenePrompt.content : "Analyze these images and provide a high-end style analysis and image prompt.";

    el.focus();
    document.execCommand('insertText', false, promptText);
    
    setTimeout(() => {
      const sendBtn = document.querySelector(SEND_BUTTON_SELECTOR);
      if (sendBtn && !sendBtn.disabled) {
        showToast('Running Nano Banana Analysis...');
        sendBtn.click();
        monitorNanoBananaResponse(sessionId);
      } else {
        showToast('Ready! Please click Send manually.');
        monitorNanoBananaResponse(sessionId);
      }
    }, 3000);

  } catch (err) {
    console.error('Nano Banana failed:', err);
    showToast('Error: ' + err.message);
  }
}

async function monitorNanoBananaResponse(sessionId) {
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false;
  const MAX_TICKS = 150;
  
  const interval = setInterval(async () => {
    if (handled) return;
    tickCount++;
    const messages = document.querySelectorAll(RESPONSE_SELECTOR);
    if (messages.length === 0) return;
    
    // ─── Enhanced Markdown Capture ──────────────────────────
    const lastMessage = messages[messages.length - 1];
    const extractMarkdown = (el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('h1').forEach(h => h.innerHTML = '# ' + h.innerHTML + '\n\n');
      clone.querySelectorAll('h2').forEach(h => h.innerHTML = '## ' + h.innerHTML + '\n\n');
      clone.querySelectorAll('h3').forEach(h => h.innerHTML = '### ' + h.innerHTML + '\n\n');
      clone.querySelectorAll('li').forEach(li => li.innerHTML = '- ' + li.innerHTML + '\n');
      clone.querySelectorAll('p').forEach(p => p.innerHTML = p.innerHTML + '\n\n');
      clone.querySelectorAll('strong, b').forEach(s => s.innerHTML = '**' + s.innerHTML + '**');
      return clone.innerText;
    };

    const currentTextRaw = lastMessage.innerText;
    // For Gemini, we always try to preserve structure for scene analysis logic
    const currentText = (currentTextRaw.length > 50 && !currentTextRaw.includes('#')) ? extractMarkdown(lastMessage) : currentTextRaw;
    
    const isGenerating = !!document.querySelector(STOP_SELECTOR);
    
    if (currentText === lastText && currentText.length > 50) stabilityCount++;
    else stabilityCount = 0;

    if ((stabilityCount >= 3 && !isGenerating) || tickCount > MAX_TICKS) {
      handled = true;
      clearInterval(interval);
      try {
        await fetch(`http://127.0.0.1:3005/api/session/${sessionId}/scene-analysis`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneAnalysis: currentText })
        });
        showToast(tickCount > MAX_TICKS ? 'Nano Banana Result Saved (Timeout) ✓' : 'Nano Banana Result Saved to Dashboard ✓');
      } catch (err) {
        showToast('Failed to save Vision Analysis ⚠');
      }
    }
    lastText = currentText;
  }, 2000);
}

window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('scene_analyze') === 'true') {
    const sessionId = params.get('sessionId');
    if (sessionId) handleNanoBananaSequence(sessionId);
  }
});
