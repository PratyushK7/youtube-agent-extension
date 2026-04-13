// content_chatgpt.js: Pro-Analyst with Progress Tracking

const style = document.createElement('style');
style.textContent = `
  #yt-ai-progress-container {
    position: fixed; top: 0; left: 0; width: 100%; height: 44px;
    background: rgba(15, 17, 23, 0.95); backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif; transition: all 0.3s ease;
  }
  .yt-ai-progress-bar {
    width: 60%; height: 4px; background: rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; margin-bottom: 5px;
  }
  #yt-ai-progress-fill {
    width: 0%; height: 100%; background: #6366f1;
    transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  }
  #yt-ai-progress-text { color: #94a3b8; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600; }
  .yt-ai-toast {
    position: fixed; bottom: 24px; right: 24px; background: #1e293b; color: #e2e8f0;
    padding: 10px 20px; border-radius: 8px; font-weight: 500; font-size: 13px; z-index: 10001;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); animation: toastIn 0.3s ease-out;
  }
  @keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
document.head.appendChild(style);

// ─── Logging Helpers ────────────────────────────────────────
const _log = (msg, ...a) => console.log(`YT-to-AI: [ChatGPT] ${msg}`, ...a);
const _warn = (msg, ...a) => console.warn(`YT-to-AI: [ChatGPT] ${msg}`, ...a);
const _err = (msg, ...a) => console.error(`YT-to-AI: [ChatGPT] ${msg}`, ...a);

// Reliable paste helper — Chrome ignores clipboardData in synthetic ClipboardEvent constructor
function dispatchPaste(element, dataTransfer) {
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: dataTransfer, writable: false });
  element.dispatchEvent(event);
}

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
  _log(`Message received: ${request.action}`);
  if (request.action === 'TRIGGER_STEP') {
    automateChatGPT(request.retryAttempt || 0);
  }
  if (request.action === 'FINAL_SYNTHESIS') {
    generateMasterDossier(request.channelName, request.totalSteps, request.sessionId);
  }
});

// ─── Robust JSON Extraction ────────────────────────────────
// Multi-stage extraction: never discard data silently

function extractVideoJSON(text) {
  // Ultra-Resilient Stage: Find any block that looks like { ... "hookType" ... }
  try {
    const blockMatch = text.match(/\{[\s\S]*?"hookType"[\s\S]*?\}/);
    if (blockMatch) {
       // Deep Clean: sometimes AI adds markdown code fences inside the match
       let cleaned = blockMatch[0].replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
       try {
         const parsed = JSON.parse(cleaned);
         console.log('YT-to-AI: JSON extracted via ultra-resilient object match.');
         return { success: true, data: parsed, raw: text };
       } catch (jsonErr) {
         // Fallback: try to fix common JSON errors like trailing commas
         let fixed = cleaned.replace(/,\s*([\]}])/g, '$1');
         try {
           const parsedFixed = JSON.parse(fixed);
           return { success: true, data: parsedFixed, raw: text };
         } catch (e) {}
       }
    }
  } catch (e) {}

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

  // Stage 2: Last-Ditch substring capture
  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      console.log('YT-to-AI: JSON extracted via last-ditch substring.');
      return { success: true, data: parsed, raw: text };
    }
  } catch (e) {}

  console.warn('YT-to-AI: JSON extraction failed. Storing raw response.');
  return { success: false, data: null, raw: text };
}

// ─── Save to Session via Background ────────────────────────

async function saveVideoToSession(reportText) {
  const storageData = await chrome.storage.local.get(['sessionId', 'imageData', 'videoTitle', 'step', 'videoId', 'views', 'duration']);
  const sessionId = storageData.sessionId;
  
  const extraction = extractVideoJSON(reportText);
  
  const videoData = extraction.success ? {
    ...extraction.data,
    views: storageData.views || extraction.data.views || 'TBD',
    duration: storageData.duration || extraction.data.duration || 'TBD',
    title: extraction.data.title || storageData.videoTitle || '',
    videoNumber: storageData.step || 1,
    videoId: storageData.videoId || ''
  } : {
    views: storageData.views || 'TBD',
    duration: storageData.duration || 'TBD',
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
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'SAVE_VIDEO_TO_SESSION',
          sessionId,
          videoData,
          rawResponse: extraction.raw,
          screenshot: storageData.imageData || ''
        }, (response) => {
          if (chrome.runtime.lastError) {
            _warn('sendMessage failed (background may have restarted):', chrome.runtime.lastError.message);
            // Retry once after a short delay — service worker may need to wake up
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'SAVE_VIDEO_TO_SESSION',
                sessionId,
                videoData,
                rawResponse: extraction.raw,
                screenshot: storageData.imageData || ''
              }, resolve);
            }, 1000);
          } else {
            resolve(response);
          }
        });
      });
    } catch (e) {
      _err('Failed to save video to session:', e.message);
    }
  }

  showToast(`Video ${storageData.step || '?'} captured${extraction.success ? ' ✓ JSON' : ' ⚠ Raw text'}`);
}

async function monitorResponse(isFinal = false, channelName, sessionId) {
  _log(`Monitor started (isFinal=${isFinal})`);
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false;
  const MAX_TICKS = 120; // 4 minutes max (120 * 2s)
  // Track initial message count to avoid reading stale messages from previous conversations
  const initialMsgCount = document.querySelectorAll('div[data-message-author-role="assistant"]').length;
  
  const interval = setInterval(() => {
    if (handled) return;
    tickCount++;
    if (tickCount % 15 === 0) _log(`Monitor tick ${tickCount}/${MAX_TICKS}, stability=${stabilityCount}`);
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (messages.length <= initialMsgCount) {
      if (tickCount > MAX_TICKS) {
        handled = true;
        console.error('YT-to-AI: Monitor timed out waiting for response.');
        clearInterval(interval);
        if (!isFinal) chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
      }
      return;
    }
    // ─── Enhanced Markdown Capture ──────────────────────────
    const lastMessage = messages[messages.length - 1];
    
    const extractMarkdown = (el) => {
      // 1. Try to find a markdown code block first
      const codeBlock = el.querySelector('pre code.language-markdown, pre code');
      if (codeBlock && codeBlock.textContent.includes('#')) {
        return codeBlock.textContent;
      }

      // 2. Clone to avoid messing with live DOM
      const clone = el.cloneNode(true);
      
      // Simple reconstruction for headings if innerText stripped them
      clone.querySelectorAll('h1').forEach(h => h.innerHTML = '# ' + h.innerHTML + '\n\n');
      clone.querySelectorAll('h2').forEach(h => h.innerHTML = '## ' + h.innerHTML + '\n\n');
      clone.querySelectorAll('h3').forEach(h => h.innerHTML = '### ' + h.innerHTML + '\n\n');
      clone.querySelectorAll('li').forEach(li => li.innerHTML = '- ' + li.innerHTML + '\n');
      clone.querySelectorAll('p').forEach(p => p.innerHTML = p.innerHTML + '\n\n');
      clone.querySelectorAll('strong, b').forEach(s => s.innerHTML = '**' + s.innerHTML + '**');
      
      return clone.innerText;
    };

    const currentTextRaw = lastMessage.innerText;
    // If the text seems to have lost its headings but has structure, use the enhanced extractor
    const currentText = (isFinal && !currentTextRaw.includes('#')) ? extractMarkdown(lastMessage) : currentTextRaw;
    
    const isGenerating = !!document.querySelector('button[aria-label="Stop generating"], button[aria-label="Stop streaming"], [data-testid="stop-button"]');
    
    if (currentText === lastText && currentText.length > 20) {
      stabilityCount++;
    } else {
      stabilityCount = 0;
    }

    if (stabilityCount >= 3 && !isGenerating) {
      handled = true;
      _log(`Stability reached at tick ${tickCount}. Response length: ${currentText.length}`);
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
      _warn(`Monitor timed out at tick ${tickCount}. Saving what we have (${(currentText||lastText).length} chars).`);
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
  
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'COMPLETE_SESSION',
        sessionId: sid,
        synthesis: synthesisText,
        screenshot: storageData.imageData || ''
      }, () => {
        if (chrome.runtime.lastError) {
          _warn('completeSession sendMessage failed, retrying...', chrome.runtime.lastError.message);
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: 'COMPLETE_SESSION',
              sessionId: sid,
              synthesis: synthesisText,
              screenshot: storageData.imageData || ''
            }, resolve);
          }, 1000);
        } else { resolve(); }
      });
    });
  } catch (e) {
    _err('Failed to complete session:', e.message);
  }
}

async function automateChatGPT(retryAttempt = 0) {
  const data = await chrome.storage.local.get(['pendingAnalysis', 'imageData', 'transcript', 'step', 'totalSteps', 'sessionId', 'videoTitle', 'videoId', 'basePrompt', 'views', 'duration']);
  if (!data.pendingAnalysis) {
    _warn('automateChatGPT called but no pendingAnalysis flag');
    return;
  }

  // 🛡️ CRITICAL: Clear pending flag immediately to prevent loops
  await chrome.storage.local.remove('pendingAnalysis');
  
  const step = data.step || 1;
  const totalSteps = data.totalSteps || 1;
  updateProgressBar(step, totalSteps);
  _log(`Processing Video ${step}/${totalSteps}: "${data.videoTitle}" (retry=${retryAttempt})`);

  try { // Global try-catch — ANY error must signal STEP_RESULT fail

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
    _err('ChatGPT input not found:', e.message);
    chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
    return;
  }
  promptInput.focus();
  _log('ChatGPT input field found, injecting assets...');

  // 📦 Multi-Modal Package: Attach Thumbnail and Transcript
  const dt = new DataTransfer();
  
  // 1. Attach Video Metadata & Transcript (Clean context — no prompt mixed in)
  const metaText = `VIDEO TITLE: ${data.videoTitle || 'Unknown'}\nVIEWS: ${data.views || 'TBD'}\nLENGTH: ${data.duration || 'TBD'}\n\nTRANSCRIPT:\n${data.transcript || ''}`;
  const metaFile = new File([new Blob([metaText], { type: 'text/plain' })], 'video_transcript.txt', { type: 'text/plain' });
  dt.items.add(metaFile);

  // 2. Attach Thumbnail
  if (data.imageData && data.imageData.length > 100) {
    try {
      console.log(`YT-to-AI: [Screenshot→ChatGPT] imageData present (${(data.imageData.length/1024).toFixed(1)}KB), converting to blob...`);
      let blob;
      if (data.imageData.startsWith('data:')) {
        // Convert base64 data URL to blob directly (more reliable than fetch for large data URLs)
        const [header, b64data] = data.imageData.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const byteString = atob(b64data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        blob = new Blob([ab], { type: mime });
      } else {
        const resp = await fetch(data.imageData);
        blob = await resp.blob();
      }
      console.log(`YT-to-AI: [Screenshot→ChatGPT] Blob created: ${(blob.size/1024).toFixed(1)}KB, type=${blob.type}`);
      if (blob.size > 2500) {
        dt.items.add(new File([blob], 'video_frame.png', { type: blob.type || 'image/png' }));
        console.log('YT-to-AI: [Screenshot→ChatGPT] ✓ Thumbnail attached to paste payload');
      } else {
        console.warn('YT-to-AI: [Screenshot→ChatGPT] Blob too small, skipping:', blob.size);
      }
    } catch (e) {
      console.error('YT-to-AI: [Screenshot→ChatGPT] Thumbnail attachment FAILED:', e.message, e.stack);
    }
  } else {
    console.warn(`YT-to-AI: [Screenshot→ChatGPT] No imageData available (length=${data.imageData?.length || 0})`);
  }

  showToast(`Uploading video ${step}/${totalSteps}...`);
  dispatchPaste(promptInput, dt);
  await new Promise(r => setTimeout(r, 2200));

  // Inject the ACTUAL analysis prompt (per-video-analysis.txt or user-selected prompt)
  let analysisPrompt = data.basePrompt || '';
  if (!analysisPrompt) {
    // Fallback: fetch the dedicated per-video prompt from server
    try {
      const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
      const promptsData = await promptsRes.json();
      analysisPrompt = promptsData.find(p => p.id === 'per-video-analysis.txt')?.content || '';
    } catch (e) { console.warn('YT-to-AI: Prompt fetch failed, using fallback.', e); }
  }
  if (!analysisPrompt) {
    analysisPrompt = `[Step ${step}/${totalSteps}] Analyze this video completely. Return ONLY a single pure JSON object using the prescribed schema. No conversational filler. Just the JSON.`;
  }
  document.execCommand('insertText', false, analysisPrompt);
  _log(`Prompt injected (${analysisPrompt.length} chars). Waiting for send button...`);

  setTimeout(() => {
    const sendBtn = document.querySelector('button[data-testid="send-button"]') || 
                    document.querySelector('button[aria-label="Send prompt"]') ||
                    document.querySelector('form button[type="submit"]') ||
                    document.querySelector('button.bg-black');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      _log('Send button clicked. Starting monitor...');
      monitorResponse();
    } else {
      _warn('Send button not found or disabled. Trying Enter key fallback...');
      try {
        const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        promptInput.dispatchEvent(enter);
        _log('Enter key dispatched. Starting monitor...');
        monitorResponse();
      } catch (e) {
        _err('Send fallback failed:', e.message);
        chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
      }
    }
  }, 1500);

  } catch (globalErr) {
    _err('FATAL in automateChatGPT:', globalErr.message, globalErr.stack);
    chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
  }
}

async function generateMasterDossier(channelName, passedTotalSteps, passedSessionId) {
  _log(`Initiating Final Synthesis: channel=${channelName}, session=${passedSessionId}`);
  
  const data = await chrome.storage.local.get(['sessionId']);
  const total = passedTotalSteps || 1;
  const sid = passedSessionId || data.sessionId;
  updateProgressBar(total, total); // Reflect 100% completion based on actual count
  
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
    _err('Cannot find ChatGPT input for final synthesis.');
    showToast('Error: ChatGPT input not found');
    return;
  }
  
  // Fetch Dynamic Prompt from Server
  let dossierPrompt = "";
  try {
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const promptsData = await promptsRes.json();
    dossierPrompt = promptsData.find(p => p.id === 'master_analysis.txt')?.content;
    if (!dossierPrompt) throw new Error('master_analysis.txt not found');
  } catch (err) {
    console.warn('YT-to-AI: Synthesis prompt fetch failed.', err);
    dossierPrompt = "Provide a comprehensive Master Strategic SOP (Markdown) based on the provided video data.";
  }

  // 📦 Multi-Modal Package: Attach JSON and Screenshots
  const dt = new DataTransfer();
  try {
    const sessionRes = await fetch(`http://127.0.0.1:3005/api/session/${sid}`);
    const sessionData = await sessionRes.json();
    if (sessionData.success) {
      // 1. Attach Raw JSON
      const metricsBlob = new Blob([JSON.stringify(sessionData.session.videos, null, 2)], { type: 'application/json' });
      dt.items.add(new File([metricsBlob], 'video_metrics.json', { type: 'application/json' }));
      
      // 2. Attach Screenshots
      for (let i = 0; i < sessionData.session.videos.length; i++) {
        const v = sessionData.session.videos[i];
        if (v.screenshot) {
          const res = await fetch(`http://127.0.0.1:3005${v.screenshot}`);
          const blob = await res.blob();
          dt.items.add(new File([blob], `evidence_${i+1}.png`, { type: 'image/png' }));
        }
      }
    }
  } catch (e) { console.warn('Failed to harvest evidence for dossier:', e); }

  promptInput.focus();
  
  if (dt.items.length > 0) {
    showToast(`Uploading dossier (${dt.items.length} assets)...`);
    dispatchPaste(promptInput, dt);
    await new Promise(r => setTimeout(r, 2000));
  }

  document.execCommand('insertText', false, dossierPrompt);
    setTimeout(() => {
      const sendBtn = document.querySelector('button[data-testid="send-button"]') ||
                      document.querySelector('button[aria-label="Send prompt"]') ||
                      document.querySelector('form button[type="submit"]') ||
                      document.querySelector('button.bg-black');
      
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        monitorResponse(true, channelName, sid);
      } else {
        // Fallback to Enter key if button is disabled or missing
        const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        promptInput.dispatchEvent(enter);
        monitorResponse(true, channelName, sid);
      }
    }, 2000); // 2s delay gives more time for large dossiers to be ready
}

// Init
async function handleNicheBendTrigger(sessionId) {
  console.log('YT-to-AI: Initiating Niche Bender Bridge for session:', sessionId);
  showToast('Niche Bender Triggered. Fetching Dossier...');
  
  try {
    const sessionRes = await fetch(`http://127.0.0.1:3005/api/session/${sessionId}`);
    const sessionData = await sessionRes.json();
    if (!sessionData.success) throw new Error('Could not fetch session');
    
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const promptsData = await promptsRes.json();
    const benderPrompt = promptsData.find(p => p.id === 'niche-bending.txt')?.content;
    
    if (!benderPrompt) throw new Error('niche-bending.txt not found');
    
    const waitForInput = () => new Promise((resolve, reject) => {
      let elapsed = 0;
      const int = setInterval(() => {
        const input = document.querySelector('#prompt-textarea, [contenteditable="true"][data-placeholder]');
        if (input) { clearInterval(int); resolve(input); }
        elapsed += 500;
        if (elapsed > 15000) { clearInterval(int); reject(new Error('Input not found')); }
      }, 500);
    });
    
    const promptInput = await waitForInput();
    promptInput.focus();

    // 📦 Multi-Modal Package: Attach JSON and Screenshots
    const dt = new DataTransfer();
    
    // 1. Attach Raw JSON
    const metricsBlob = new Blob([JSON.stringify(sessionData.session.videos, null, 2)], { type: 'application/json' });
    dt.items.add(new File([metricsBlob], 'video_metrics.json', { type: 'application/json' }));
    
    // 2. Attach Screenshots
    for (let i = 0; i < sessionData.session.videos.length; i++) {
        const v = sessionData.session.videos[i];
        if (v.screenshot) {
          try {
            const res = await fetch(`http://127.0.0.1:3005${v.screenshot}`);
            const blob = await res.blob();
            dt.items.add(new File([blob], `evidence_${i+1}.png`, { type: 'image/png' }));
          } catch (e) {}
        }
    }

    if (dt.items.length > 0) {
      showToast(`Uploading evidence (${dt.items.length} assets)...`);
      dispatchPaste(promptInput, dt);
      await new Promise(r => setTimeout(r, 2200)); // Wait for upload
    }

    document.execCommand('insertText', false, benderPrompt);
    
    setTimeout(() => {
      const sendBtn = document.querySelector('button[data-testid="send-button"]') || 
                      document.querySelector('button[aria-label="Send prompt"]') ||
                      document.querySelector('form button[type="submit"]') ||
                      document.querySelector('button.bg-black');
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        monitorNicheBendResponse(sessionId);
      }
    }, 1500);

  } catch (err) {
    console.error('Niche Bender failed:', err);
    showToast('Error: ' + err.message);
  }
}

async function monitorNicheBendResponse(sessionId) {
  _log('Niche Bender Monitor started...');
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false;
  let emptyTicks = 0;
  const MAX_TICKS = 150; // 5 minutes (15 bends takes longer)
  
  const interval = setInterval(() => {
    if (handled) return;
    tickCount++;
    if (tickCount % 15 === 0) _log(`Niche monitor tick ${tickCount}/${MAX_TICKS}`);
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (messages.length === 0) {
      emptyTicks++;
      if (emptyTicks > 30) { // 60s with no response
        handled = true;
        clearInterval(interval);
        _err('Niche Bender: No AI response after 60s');
        showToast('ChatGPT did not respond. Try again.');
      }
      return;
    }
    
    const currentText = messages[messages.length - 1].innerText;
    const isGenerating = !!document.querySelector('button[aria-label="Stop generating"], button[aria-label="Stop streaming"], [data-testid="stop-button"]');
    
    if (currentText === lastText && currentText.length > 50) {
      stabilityCount++;
    } else {
      stabilityCount = 0;
    }

    if (stabilityCount >= 3 && !isGenerating) {
      handled = true;
      clearInterval(interval);
      chrome.runtime.sendMessage({ action: 'SAVE_NICHE_BENDS', sessionId, nicheBends: currentText }, (response) => {
        if (response && response.success) {
          showToast('15 Niche Bends Saved to Dashboard ✓');
        } else {
          showToast('Failed to save Bends ⚠');
        }
      });
    } else if (tickCount > MAX_TICKS) {
      handled = true;
      clearInterval(interval);
      chrome.runtime.sendMessage({ action: 'SAVE_NICHE_BENDS', sessionId, nicheBends: currentText }, (response) => {
        showToast('Niche Bends Saved (Timeout) ✓');
      });
    }
    
    lastText = currentText;
  }, 2000);
}

async function handleSceneAnalyzerTrigger(sessionId) {
  showToast('Initializing Vision AI Pipeline...');
  
  try {
    const el = await waitForElm('#prompt-textarea');
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

    dispatchPaste(el, dt);
    
    // Let DOM update the image preview thumbnails
    await new Promise(r => setTimeout(r, 2000));

    // Fetch Prompt
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const prompts = await promptsRes.json();
    const scenePrompt = prompts.find(p => p.id === 'scene-analyzer.txt');
    const promptText = scenePrompt ? scenePrompt.content : "Analyze these images and tell me the composition.";

    document.execCommand('insertText', false, promptText);
    
    setTimeout(() => {
      const sendBtn = document.querySelector('button[data-testid="send-button"]') || 
                      document.querySelector('button[aria-label="Send prompt"]') ||
                      document.querySelector('button.bg-black');
      if (sendBtn && !sendBtn.disabled) {
        showToast('Running Multi-Modal Analysis...');
        sendBtn.click();
        monitorSceneAnalyzerResponse(sessionId);
      }
    }, 1500);

  } catch (err) {
    console.error('Scene Analyzer failed:', err);
    showToast('Error: ' + err.message);
  }
}

async function monitorSceneAnalyzerResponse(sessionId) {
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false;
  const MAX_TICKS = 150;
  
  const interval = setInterval(async () => {
    if (handled) return;
    tickCount++;
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (messages.length === 0) return;
    
    const currentText = messages[messages.length - 1].innerText;
    const isGenerating = !!document.querySelector('button[aria-label="Stop generating"], button[aria-label="Stop streaming"], [data-testid="stop-button"]');
    
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
        showToast(tickCount > MAX_TICKS ? 'Vision Analysis Saved (Timeout) ✓' : 'Vision Analysis Saved to Dashboard ✓');
      } catch (err) {
        showToast('Failed to save Vision Analysis ⚠');
      }
    }
    lastText = currentText;
  }, 2000);
}

// ─── Entry Point & URL Trigger Logic ────────────────────────
async function initializeTriggers() {
  try {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  const channelName = params.get('channelName');
  _log(`Init triggers: synthesis=${params.get('trigger_synthesis')}, niche=${params.get('niche_bend')}, sessionId=${sessionId}`);

  if (params.get('trigger_synthesis') === 'true' && sessionId) {
    const totalVideos = params.get('totalVideos');
    showToast('🚀 Synthesis Mode: Initializing Master Dossier...');
    generateMasterDossier(channelName, parseInt(totalVideos || '1'), sessionId);
    return;
  }

  if (params.get('niche_bend') === 'true' && sessionId) {
    showToast('🚀 Strategy Mode: Initializing Niche Bender...');
    handleNicheBendTrigger(sessionId);
    return;
  }

  // Fallback to sequential flow check
  chrome.storage.local.get(['pendingAnalysis'], (data) => {
    if (data.pendingAnalysis) {
      showToast('🚀 Sequential Mode: Resuming Analysis...');
      _log('pendingAnalysis flag found, auto-triggering automateChatGPT');
      automateChatGPT();
    } else {
      _log('No triggers matched. Idle.');
    }
  });

  } catch (initErr) {
    _err('FATAL in initializeTriggers:', initErr.message, initErr.stack);
    showToast('Error: Extension init failed — check console');
  }
}

// Support both immediate and delayed load (ChatGPT SPA can be tricky)
if (document.readyState === 'complete') {
  initializeTriggers();
} else {
  window.addEventListener('load', initializeTriggers);
}
