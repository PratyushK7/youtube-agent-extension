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
    generateMasterDossier(request.channelName, request.sessionId);
  }
});

// ─── Robust JSON Extraction ────────────────────────────────
// Multi-stage extraction: never discard data silently

function extractVideoJSON(text) {
  // Stage 1: Try to find a JSON array [{...}, ...]
  try {
    const arrayMatch = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('YT-to-AI: JSON extracted via array match.');
        return { success: true, data: parsed[0], raw: text };
      }
    }
  } catch (e) {}

  // Stage 2: Try to find a single JSON object {...}
  try {
    const objMatch = text.match(/\{[\s\S]*?"hookType"[\s\S]*?\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      console.log('YT-to-AI: JSON extracted via single object match.');
      return { success: true, data: parsed, raw: text };
    }
  } catch (e) {}

  // Stage 3: Strip markdown code fences and retry
  try {
    const cleaned = text.replace(/```json?\s*\n?/g, '').replace(/```\s*/g, '').trim();
    // Try array
    const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('YT-to-AI: JSON extracted after stripping code fences (array).');
        return { success: true, data: parsed[0], raw: text };
      }
    }
    // Try object
    const objMatch = cleaned.match(/\{[\s\S]*?"hookType"[\s\S]*?\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      console.log('YT-to-AI: JSON extracted after stripping code fences (object).');
      return { success: true, data: parsed, raw: text };
    }
  } catch (e) {}

  // Stage 4: Extraction failed — return raw text as fallback
  console.warn('YT-to-AI: JSON extraction failed. Storing raw response.');
  return { success: false, data: null, raw: text };
}

// ─── Save to Session via Background ────────────────────────

async function saveVideoToSession(reportText) {
  const storageData = await chrome.storage.local.get(['sessionId', 'imageData', 'videoTitle', 'step', 'videoId']);
  const sessionId = storageData.sessionId;
  
  const extraction = extractVideoJSON(reportText);
  
  const videoData = extraction.success ? {
    ...extraction.data,
    title: extraction.data.title || storageData.videoTitle || '',
    videoNumber: storageData.step || 1,
    videoId: storageData.videoId || ''
  } : {
    title: storageData.videoTitle || 'Unknown',
    videoNumber: storageData.step || 1,
    videoId: storageData.videoId || '',
    hookType: 'Parse Failed',
    hookText: '',
    hookFramework: '',
    openingStructure: '',
    scriptStructure: '',
    storytellingFramework: '',
    rehooksUsed: '',
    retentionPattern: '',
    ctaPlacement: '',
    keyTakeaways: '',
    thumbnailDescription: ''
  };

  if (sessionId) {
    await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'SAVE_VIDEO_TO_SESSION',
        sessionId,
        videoData,
        rawResponse: extraction.raw,
        screenshot: storageData.imageData || ''
      }, resolve);
    });
  }

  showToast(`Video ${storageData.step || '?'} captured${extraction.success ? ' ✓ JSON' : ' ⚠ Raw text'}`);
}

async function monitorResponse(isFinal = false, channelName, sessionId) {
  console.log('YT-to-AI: Heartbeat Monitor Active...');
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false; // Guard against double-fire
  const MAX_TICKS = 120; // 4 minutes max (120 * 2s)
  
  const interval = setInterval(() => {
    if (handled) return; // Already resolved — prevent double-fire
    tickCount++;
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (messages.length === 0) {
      if (tickCount > MAX_TICKS) {
        handled = true;
        console.error('YT-to-AI: Monitor timed out waiting for response.');
        clearInterval(interval);
        if (!isFinal) chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
      }
      return;
    }
    const currentText = messages[messages.length - 1].innerText;
    
    const isGenerating = !!document.querySelector('button[aria-label="Stop generating"], button[aria-label="Stop streaming"], [data-testid="stop-button"]');
    
    if (currentText === lastText && currentText.length > 20) {
      stabilityCount++;
    } else {
      stabilityCount = 0;
    }

    if (stabilityCount >= 3 && !isGenerating) {
      handled = true;
      console.log('✅ YT-to-AI: Stability Reached.');
      clearInterval(interval);
      
      if (isFinal) {
        completeSession(currentText, sessionId).then(() => {
          showToast('Master Synthesis Complete ✓');
        });
      } else {
        saveVideoToSession(currentText).then(() => {
          chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'success' });
        }).catch(() => {
          chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'success' });
        });
      }
      return; // Early return — prevent timeout check from also firing
    }
    
    // Timeout failsafe
    if (tickCount > MAX_TICKS) {
      handled = true;
      console.warn('YT-to-AI: Monitor timed out, treating as success.');
      clearInterval(interval);
      
      const finalText = currentText || lastText;
      if (isFinal) {
        completeSession(finalText, sessionId);
      } else {
        saveVideoToSession(finalText).then(() => {
          chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'success' });
        }).catch(() => {
          chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
        });
      }
    }
    
    lastText = currentText;
  }, 2000);
}

async function completeSession(synthesisText, sessionId) {
  const storageData = await chrome.storage.local.get(['sessionId', 'imageData']);
  const sid = sessionId || storageData.sessionId;
  if (!sid) {
    console.warn('YT-to-AI: No session ID for final synthesis.');
    return;
  }
  
  await new Promise(resolve => {
    chrome.runtime.sendMessage({
      action: 'COMPLETE_SESSION',
      sessionId: sid,
      synthesis: synthesisText,
      screenshot: storageData.imageData || ''
    }, resolve);
  });
}

async function automateChatGPT(retryAttempt = 0) {
  const data = await chrome.storage.local.get(['pendingAnalysis', 'imageData', 'prompt', 'step', 'totalSteps', 'sessionId', 'videoTitle', 'videoId']);
  if (!data.pendingAnalysis) return;

  // 🛡️ CRITICAL: Clear pending flag immediately to prevent loops
  await chrome.storage.local.remove('pendingAnalysis');
  
  const step = data.step || 1;
  const totalSteps = data.totalSteps || 1;
  updateProgressBar(step, totalSteps);
  console.log(`YT-to-AI: Processing Video ${step}/${totalSteps}`);

  const waitForInput = () => new Promise((resolve, reject) => {
    let elapsed = 0;
    const int = setInterval(() => {
      const input = document.querySelector('#prompt-textarea, [contenteditable="true"][data-placeholder]');
      if (input) { clearInterval(int); resolve(input); }
      elapsed += 500;
      if (elapsed > 30000) { clearInterval(int); reject(new Error('ChatGPT input not found')); }
    }, 500);
  });

  let promptInput;
  try {
    promptInput = await waitForInput();
  } catch (e) {
    console.error('YT-to-AI:', e.message);
    chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
    return;
  }
  promptInput.focus();

  // Pulse-Paste Image (Req 2.2)
  if (data.imageData && data.imageData.length > 100) {
    try {
      const resp = await fetch(data.imageData);
      const blob = await resp.blob();
      if (blob.size > 2500) {
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'snapshot.png', { type: blob.type }));
        promptInput.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
      }
    } catch (e) {
      console.warn('YT-to-AI: Image paste failed, continuing with text-only.', e);
    }
  }

  // Inject Text
  const promptText = data.prompt || `[Step ${step}/${totalSteps}] Analyze this video.`;
  setTimeout(() => {
    document.execCommand('insertText', false, promptText);
    setTimeout(() => {
      const sendBtn = document.querySelector('button[data-testid="send-button"]') || 
                      document.querySelector('button[aria-label="Send prompt"]') ||
                      document.querySelector('form button[type="submit"]') ||
                      document.querySelector('button.bg-black');
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

async function generateMasterDossier(channelName, sessionId) {
  const data = await chrome.storage.local.get(['totalSteps', 'sessionId']);
  const total = data.totalSteps || 10;
  const sid = sessionId || data.sessionId;
  updateProgressBar(total, total); // Final state
  
  const waitForInput = () => new Promise((resolve, reject) => {
    let elapsed = 0;
    const int = setInterval(() => {
      const input = document.querySelector('#prompt-textarea, [contenteditable="true"][data-placeholder]');
      if (input) { clearInterval(int); resolve(input); }
      elapsed += 500;
      if (elapsed > 15000) { clearInterval(int); reject(new Error('Input not found')); }
    }, 500);
  });
  
  let promptInput;
  try {
    promptInput = await waitForInput();
  } catch (e) {
    console.error('YT-to-AI: Cannot find ChatGPT input for final synthesis.');
    return;
  }
  
  const finalPrompt = `[PHASE: FINAL CHANNEL SYNTHESIS]\n\nBased on all ${total} videos analyzed above, provide a comprehensive Master Strategic SOP. Include:\n1. Channel Identity & Positioning\n2. Content Strategy Patterns\n3. Hook Engineering Summary (most common types, best performers)\n4. Retention Strategy Overview\n5. Storytelling Framework Analysis\n6. CTA Strategy\n7. Actionable Recommendations\n\nProvide as detailed markdown.`;
  promptInput.focus();
  document.execCommand('insertText', false, finalPrompt);
  setTimeout(() => {
    const sendBtn = document.querySelector('button[data-testid="send-button"]') ||
                    document.querySelector('button[aria-label="Send prompt"]') ||
                    document.querySelector('form button[type="submit"]') ||
                    document.querySelector('button.bg-black');
    if (sendBtn) { sendBtn.click(); monitorResponse(true, channelName, sid); }
  }, 1200);
}

// Init
window.addEventListener('load', () => {
  chrome.storage.local.get(['pendingAnalysis'], (d) => { if (d.pendingAnalysis) automateChatGPT(); });
});
