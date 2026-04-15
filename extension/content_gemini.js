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

function waitForElm(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const directHit = document.querySelector(selector);
    if (directHit) return resolve(directHit);
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElm timed out after ${timeout}ms for: ${selector}`));
    }, timeout);
    const observer = new MutationObserver(() => {
      const hit = document.querySelector(selector);
      if (hit) { clearTimeout(timer); observer.disconnect(); resolve(hit); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// General Gemini Selectors
const INPUT_SELECTOR = 'rich-textarea, div[contenteditable="true"][aria-label="Enter a prompt here"], div[role="textbox"][aria-label*="Enter a prompt"], .ql-editor';
const SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"], button[mattooltip="Send message"], .send-button';
const RESPONSE_SELECTOR = 'message-content, div.model-response-text, .response-container';
const STOP_SELECTOR = 'button[aria-label="Stop response"], .generating-indicator, .stop-button';

async function handleNanoBananaSequence(sessionId) {
  console.log('YT-to-AI: [Gemini] Starting scene analysis for session:', sessionId);
  showToast('Initializing Nano Banana (Vision)...');
  
  try {
    const el = await waitForElm(INPUT_SELECTOR);
    await new Promise(r => setTimeout(r, 2000)); // Stabilization
    el.focus();

    // Fetch the stored session to get the frame paths
    const sessRes = await fetch(`http://127.0.0.1:3005/api/session/${sessionId}`);
    const sessData = await sessRes.json();
    if (!sessData.success || !sessData.session.sceneFrames || sessData.session.sceneFrames.length === 0) {
      throw new Error("No Scene Frames found on server.");
    }
    
    showToast('Injecting 5 Cinematic Frames...');
    
    // 🍌 Atomic Buffer Handoff
    showToast('Loading frames into buffer...');
    const dt = new DataTransfer();
    
    // 1. Fetch images and add to virtual clipboard
    for (let i = 0; i < sessData.session.sceneFrames.length; i++) {
        const url = `http://127.0.0.1:3005${sessData.session.sceneFrames[i]}`;
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], `scene_${i}.png`, { type: 'image/png' });
        dt.items.add(file);
    }

    // 2. Fetch Master Prompt (Keep separate from file buffer)
    console.log('YT-to-AI: [Gemini] Fetching Master prompt...');
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const promptsData = await promptsRes.json();
    const scenePrompt = promptsData.find(p => p.id === 'scene-analyzer.txt')?.content;
    const promptText = scenePrompt || "Analyze these images and provide a high-end style analysis and image prompt.";

    // 3. Focus and Dispatch Images
    el.focus();
    await new Promise(r => setTimeout(r, 300));

    console.log('YT-to-AI: [Gemini] Executing Image Paste');
    const pasteEvent = new ClipboardEvent('paste', { 
        bubbles: true, 
        cancelable: true, 
        clipboardData: dt 
    });
    el.dispatchEvent(pasteEvent);

    // D&D Fallback for images
    const dropZone = document.querySelector('.xap-uploader-dropzone') || document.querySelector('.chat-container') || el;
    dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));

    // 4. Manually Insert Text Prompt
    // We do this separately because Gemini's paste listener often ignores text when files are present
    await new Promise(r => setTimeout(r, 500));
    console.log('YT-to-AI: [Gemini] Injecting Prompt Text...');
    try {
      el.focus();
      // Use execCommand for better compatibility with rich editors behavior
      if (!document.execCommand('insertText', false, promptText)) {
        // Fallback to innerText + input event
        el.innerText = promptText;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
      console.warn('YT-to-AI: [Gemini] Primary text injection failed, trying fallback:', e);
      el.innerText = promptText;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 🛡️ Lock: Verify Upload before continuing
    showToast('Verifying Visual Data...');
    let encodingWait = 0;
    let imagesConfirmed = false;
    
    while (encodingWait < 15000) {
      await new Promise(r => setTimeout(r, 2000));
      encodingWait += 2000;
      
      const previews = document.querySelectorAll('img[src*="blob:"], .image-preview, .thumbnail-container img, [data-test-id="thumbnail"], .v-card-thumbnail');
      console.log(`YT-to-AI: [Gemini] Buffer Check: ${previews.length} frames detected.`);
      
      if (previews.length > 0) {
        imagesConfirmed = true;
        // Check if send button is enabled (means upload finished and text is present)
        const sBtn = document.querySelector(SEND_BUTTON_SELECTOR);
        if (previews.length >= sessData.session.sceneFrames.length && sBtn && !sBtn.disabled) break;
      }
    }
    
    if (!imagesConfirmed) {
      console.error('YT-to-AI: [Gemini] Injection failed - verification lock active.');
      showToast('⚠️ Data missing. Please try manually.');
      return;
    }

    // Final check for text before clicking send
    const currentInputText = el.innerText || el.textContent;
    if (!currentInputText || currentInputText.length < 10) {
        console.warn('YT-to-AI: [Gemini] Text still missing, re-injecting...');
        el.innerText = promptText;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1000));
    }

    setTimeout(() => {
      const sendBtn = document.querySelector(SEND_BUTTON_SELECTOR);
      if (sendBtn && !sendBtn.disabled) {
        showToast('Running Nano Banana Analysis...');
        sendBtn.click();
        monitorNanoBananaResponse(sessionId);
      } else {
        showToast('Capture Ready! Please click Send.');
        monitorNanoBananaResponse(sessionId);
      }
    }, 1500);


  } catch (err) {
    console.error('Nano Banana failed:', err);
    showToast('Error: ' + err.message);
  }
}

async function monitorNanoBananaResponse(sessionId) {
  console.log('YT-to-AI: [Gemini] Monitor started for session:', sessionId);
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false;
  const MAX_TICKS = 150;
  let emptyTicks = 0;
  
  const interval = setInterval(async () => {
    if (handled) return;
    tickCount++;
    if (tickCount % 15 === 0) console.log(`YT-to-AI: [Gemini] Monitor tick ${tickCount}/${MAX_TICKS}`);
    const messages = document.querySelectorAll(RESPONSE_SELECTOR);
    if (messages.length === 0) {
      emptyTicks++;
      if (emptyTicks > 30) {
        handled = true;
        clearInterval(interval);
        console.error('YT-to-AI: [Gemini] No response found after 60s. Aborting.');
        showToast('Gemini did not respond. Try again manually.');
      }
      return;
    }
    
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

// --- Global Signal Handler ---
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'GLOBAL_STOP') {
    handled = true;
    console.log('YT-to-AI: [Gemini] Global Stop received.');
  }
});

window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('scene_analyze') === 'true') {
    const sessionId = params.get('sessionId');
    if (sessionId) handleNanoBananaSequence(sessionId);
  }
});
