// content_chatgpt.js: Pro-Analyst with Progress Tracking

const style = document.createElement('style');
style.textContent = `
  #yt-ai-progress-container {
    position: fixed; top: 0; left: 0; width: 100%; height: 40px;
    background: rgba(25, 25, 25, 0.97); backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255,255,255,0.055);
    z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif;
  }
  .yt-ai-progress-bar {
    width: 50%; height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; margin-bottom: 4px;
  }
  #yt-ai-progress-fill {
    width: 0%; height: 100%; background: #6366f1;
    transition: width 0.8s ease;
  }
  #yt-ai-progress-text { color: #9b9a97; font-size: 10px; letter-spacing: 0.3px; font-weight: 500; }
  .yt-ai-toast {
    position: fixed; bottom: 20px; right: 20px; background: #252525; color: #ebebeb;
    padding: 8px 16px; border-radius: 4px; font-weight: 500; font-size: 12px; z-index: 10001;
    border: 1px solid rgba(255,255,255,0.055);
    animation: toastIn 0.2s ease-out;
  }
  @keyframes toastIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
document.head.appendChild(style);

// ─── Logging Helpers ────────────────────────────────────────
const _log = (msg, ...a) => console.log(`YT-to-AI: [ChatGPT] ${msg}`, ...a);
const _warn = (msg, ...a) => console.warn(`YT-to-AI: [ChatGPT] ${msg}`, ...a);
const _err = (msg, ...a) => console.error(`YT-to-AI: [ChatGPT] ${msg}`, ...a);

// Reliable file upload — uses ChatGPT's file input (paste doesn't work with React)
async function uploadFilesToChatGPT(targetInput, files) {
  if (!files || !files.length) return;
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    _log(`Uploaded ${files.length} files via file input`);
    await new Promise(r => setTimeout(r, 2500));
    return;
  }
  _warn('No file input found, trying paste fallback...');
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  const evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'clipboardData', { value: dt });
  targetInput.dispatchEvent(evt);
  await new Promise(r => setTimeout(r, 2200));
}

// Legacy alias
function dispatchPaste(element, dataTransfer) {
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: dataTransfer, writable: false });
  element.dispatchEvent(event);
}

// --- UI Helpers ---

// Inject text into ChatGPT input and click send
async function injectTextAndSend(el, text) {
  // Step 0: Wait for any pending file uploads to finish processing
  // ChatGPT shows upload progress indicators — wait until they're gone
  await waitForUploadsToFinish();

  el.focus();
  await new Promise(r => setTimeout(r, 300));

  // Clear existing content via execCommand (ProseMirror-compatible)
  document.execCommand('selectAll');
  document.execCommand('delete');
  await new Promise(r => setTimeout(r, 200));

  // Insert text via execCommand — this is the ONLY method ProseMirror reliably handles
  document.execCommand('insertText', false, text);
  _log(`Text inserted via execCommand (${text.length} chars)`);

  // Wait for ChatGPT UI to process
  await new Promise(r => setTimeout(r, 1500));

  // Find and click send button — with longer patience for upload processing
  for (let i = 0; i < 15; i++) {
    const btn = document.querySelector('button[data-testid="send-button"]');
    const altBtn = document.querySelector('button[aria-label="Send prompt"]')
                || document.querySelector('button[aria-label="Send"]');
    const target = btn || altBtn;
    
    if (target && !target.disabled) {
      target.click();
      _log(`Send clicked (attempt ${i}).`);
      return;
    }
    
    if (i === 0) {
      _log(`Send button state: exists=${!!target}, disabled=${target?.disabled}`);
    }
    
    // Every few attempts, re-focus and re-trigger input to nudge React
    if (i % 3 === 2) {
      el.focus();
      document.execCommand('insertText', false, ' ');
      document.execCommand('delete');
    }
    await new Promise(r => setTimeout(r, 800));
  }

  // Last resort: force-click even if disabled, then try Enter
  const forcedBtn = document.querySelector('button[data-testid="send-button"]');
  if (forcedBtn) {
    _warn('Force-clicking disabled send button...');
    forcedBtn.removeAttribute('disabled');
    forcedBtn.click();
    return;
  }

  _warn('No send button found. Pressing Enter...');
  el.focus();
  el.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
    bubbles: true, cancelable: true
  }));
}

// Wait for ChatGPT file upload chips/progress indicators to finish
async function waitForUploadsToFinish() {
  // ChatGPT shows upload progress as spinning indicators or progress bars on file chips
  // We wait until there are no more "uploading" indicators
  for (let i = 0; i < 30; i++) { // max 30s wait
    // Check for upload progress indicators
    const uploading = document.querySelector('[data-testid="file-thumbnail-spinner"]')
                   || document.querySelector('.animate-spin')
                   || document.querySelector('[role="progressbar"]');
    // Also check if the send button exists and is disabled (could mean upload in progress)
    const sendBtn = document.querySelector('button[data-testid="send-button"]');
    const fileChips = document.querySelectorAll('[data-testid^="file"]');
    
    if (!uploading && fileChips.length > 0 && sendBtn && !sendBtn.disabled) {
      _log('Uploads finished, send button enabled.');
      return;
    }
    
    if (!uploading && fileChips.length === 0) {
      // No files attached yet or no upload indicators — proceed
      _log('No upload indicators found, proceeding.');
      return;
    }
    
    if (i === 0) {
      _log(`Waiting for uploads: spinner=${!!uploading}, fileChips=${fileChips.length}, sendDisabled=${sendBtn?.disabled}`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  _warn('Upload wait timeout (30s) — proceeding anyway');
}
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'yt-ai-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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
  document.getElementById('yt-ai-progress-text').innerText = `Analyzing video ${current} of ${total}`;
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

// Fix unescaped double quotes inside JSON string values (ChatGPT often outputs these)
function fixUnescapedQuotes(jsonText) {
  const lines = jsonText.split('\n');
  const fixed = lines.map(line => {
    const keyValMatch = line.match(/^(\s*"[^"]*"\s*:\s*")(.*)$/);
    if (!keyValMatch) return line;
    const prefix = keyValMatch[1];
    const rest = keyValMatch[2];
    const endMatch = rest.match(/^([\s\S]*)"(\s*[,\}\]]?\s*)$/);
    if (!endMatch) return line;
    const innerContent = endMatch[1];
    const suffix = '"' + endMatch[2];
    const fixedContent = innerContent.replace(/\\"/g, '\x00ESC\x00')
                                     .replace(/"/g, '\\"')
                                     .replace(/\x00ESC\x00/g, '\\"');
    return prefix + fixedContent + suffix;
  });
  return fixed.join('\n');
}

// Safely parse JSON with multiple fix strategies
function safeJSONParse(text) {
  // Attempt 1: direct parse
  try { return JSON.parse(text); } catch (e) { _log('safeJSON attempt1 error:', e.message); }
  // Attempt 2: fix unescaped quotes (most common ChatGPT issue)
  try {
    const fixed = fixUnescapedQuotes(text);
    _log('After fixUnescapedQuotes, changed:', fixed !== text, 'length:', fixed.length);
    // Show the area around the position that failed in attempt 1
    const posMatch = arguments[1] || '';
    return JSON.parse(fixed);
  } catch (e) { _log('safeJSON attempt2 error:', e.message); }
  // Attempt 3: fix trailing commas + unescaped quotes
  try {
    const fixed = fixUnescapedQuotes(text).replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(fixed);
  } catch (e) { _log('safeJSON attempt3 error:', e.message); }
  // Attempt 4: nuclear option — extract key-value pairs with regex
  try {
    _log('safeJSON attempt4: trying line-by-line manual construction');
    // Remove outer braces, split by line, try to reconstruct
    let inner = text.trim();
    if (inner.startsWith('{')) inner = inner.substring(1);
    if (inner.endsWith('}')) inner = inner.substring(0, inner.length - 1);
    // Replace all unescaped quotes in values by converting to single quotes temporarily
    // Actually, just try replacing problematic characters
    inner = inner
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013/g, '-')
      .replace(/\u2014/g, '-')
      .replace(/\u2192/g, '->')
      .replace(/\u2026/g, '...');
    const reconstructed = '{' + inner + '}';
    return JSON.parse(reconstructed);
  } catch (e) { _log('safeJSON attempt4 error:', e.message); }
  return null;
}

function extractVideoJSON(text) {
  _log('=== extractVideoJSON input length:', text.length);
  _log('=== First 500 chars:', JSON.stringify(text.substring(0, 500)));
  _log('=== Last 200 chars:', JSON.stringify(text.substring(text.length - 200)));

  // Pre-clean: remove common ChatGPT UI artifacts from innerText
  text = text
    .replace(/^Copy code\s*/gm, '')     // "Copy code" button text
    .replace(/^\s*json\s*\n/i, '')       // Loose "json" language label
    .replace(/\u00A0/g, ' ')             // Non-breaking spaces
    .replace(/[\u201C\u201D]/g, '"')     // Smart double quotes
    .replace(/[\u2018\u2019]/g, "'")     // Smart single quotes
    .replace(/\r\n/g, '\n')             // Normalize line endings
    .trim();

  // Stage 0: Extract from markdown code fences first (most common ChatGPT format)
  try {
    const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeFenceMatch) {
      const inside = codeFenceMatch[1].trim();
      _log('Stage 0: Code fence found, inside length:', inside.length);
      const parsed = safeJSONParse(inside);
      if (parsed) {
        _log('JSON extracted from code fence.');
        return { success: true, data: Array.isArray(parsed) ? parsed[0] : parsed, raw: text };
      }
      _log('Stage 0: All parse attempts failed for code fence content');
    } else {
      _log('Stage 0: No code fence match found');
    }
  } catch (e) { _log('Stage 0 error:', e.message); }

  // Stage 1: Brace-balanced extraction — find the outermost { ... } block
  try {
    const firstBrace = text.indexOf('{');
    _log('Stage 1: firstBrace at index:', firstBrace);
    if (firstBrace !== -1) {
      let depth = 0;
      let inStr = false;
      let esc = false;
      let endIndex = -1;
      for (let i = firstBrace; i < text.length; i++) {
        const ch = text[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { endIndex = i; break; }
        }
      }
      if (endIndex !== -1) {
        const candidate = text.substring(firstBrace, endIndex + 1);
        _log('Stage 1: Balanced block length:', candidate.length);
        const parsed = safeJSONParse(candidate);
        if (parsed) {
          _log('JSON extracted via brace-balanced parsing.');
          return { success: true, data: parsed, raw: text };
        }
        _log('Stage 1: safeJSONParse failed on balanced block');
      } else {
        _log('Stage 1: Never reached depth 0');
      }
    }
  } catch (e) { _log('Stage 1 error:', e.message); }

  // Stage 2: Try first { to last } as a raw substring
  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    _log('Stage 2: firstBrace:', firstBrace, 'lastBrace:', lastBrace);
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      let candidate = text.substring(firstBrace, lastBrace + 1);
      candidate = candidate.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      _log('Stage 2: candidate length:', candidate.length);
      const parsed = safeJSONParse(candidate);
      if (parsed) {
        _log('JSON extracted via first/last brace substring.');
        return { success: true, data: parsed, raw: text };
      }
      _log('Stage 2: safeJSONParse failed');
    }
  } catch (e) { _log('Stage 2 error:', e.message); }

  _warn('JSON extraction FAILED. Full text dumped below:');
  console.warn('YT-to-AI: RAW TEXT START >>>');
  console.warn(text);
  console.warn('<<< RAW TEXT END');
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
    
    // For JSON responses: prefer textContent from <code> blocks (avoids "Copy code" button text, extra whitespace)
    let currentTextFromCode = '';
    const codeBlock = lastMessage.querySelector('pre code');
    if (codeBlock) {
      currentTextFromCode = codeBlock.textContent.trim();
    }
    
    // If the text seems to have lost its headings but has structure, use the enhanced extractor
    const currentText = (isFinal && !currentTextRaw.includes('#')) ? extractMarkdown(lastMessage) : (currentTextFromCode || currentTextRaw);
    
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
  const data = await chrome.storage.local.get(['pendingAnalysis', 'imageData', 'transcript', 'step', 'totalSteps', 'sessionId', 'videoTitle', 'videoId', 'views', 'duration']);
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
  _log(`Transcript: ${data.transcript ? data.transcript.length + ' chars' : 'MISSING'}, Image: ${data.imageData ? (data.imageData.length/1024).toFixed(0) + 'KB' : 'MISSING'}`);

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

  // 📦 Upload files via ChatGPT's file input (paste events don't work with React)
  const filesToUpload = [];

  // 1. Transcript file
  const metaText = `VIDEO TITLE: ${data.videoTitle || 'Unknown'}\nVIEWS: ${data.views || 'TBD'}\nLENGTH: ${data.duration || 'TBD'}\n\nTRANSCRIPT:\n${data.transcript || ''}`;
  filesToUpload.push(new File([metaText], 'video_transcript.txt', { type: 'text/plain' }));
  _log(`Transcript file created (${metaText.length} chars)`);

  // 2. Thumbnail image
  if (data.imageData && data.imageData.length > 100) {
    try {
      let blob;
      if (data.imageData.startsWith('data:')) {
        const [header, b64data] = data.imageData.split(',');
        const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/png';
        const byteString = atob(b64data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        blob = new Blob([ab], { type: mime });
      } else {
        blob = await (await fetch(data.imageData)).blob();
      }
      if (blob.size > 2500) {
        filesToUpload.push(new File([blob], 'video_thumbnail.png', { type: blob.type || 'image/png' }));
        _log(`Thumbnail file created (${(blob.size/1024).toFixed(1)}KB)`);
      }
    } catch (e) {
      _err('Thumbnail blob failed:', e.message);
    }
  }

  // Upload via file input element (the only reliable way on ChatGPT)
  let uploaded = false;
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput && filesToUpload.length > 0) {
    const dt = new DataTransfer();
    filesToUpload.forEach(f => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    _log(`Uploaded ${filesToUpload.length} files via file input`);
    uploaded = true;
    await new Promise(r => setTimeout(r, 2500));
  }

  // Fallback: try paste if file input not found
  if (!uploaded) {
    _warn('No file input found, trying paste fallback...');
    const dt = new DataTransfer();
    filesToUpload.forEach(f => dt.items.add(f));
    const pasteEvt = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvt, 'clipboardData', { value: dt });
    promptInput.dispatchEvent(pasteEvt);
    await new Promise(r => setTimeout(r, 2200));
  }

  showToast(`Uploading video ${step}/${totalSteps}...`);

  // Always use the dedicated per-video-analysis prompt — never mix in other prompts
  let analysisPrompt = '';
  try {
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const promptsData = await promptsRes.json();
    analysisPrompt = promptsData.find(p => p.id === 'per-video-analysis.txt')?.content || '';
    _log(`Fetched per-video-analysis.txt (${analysisPrompt.length} chars)`);
  } catch (e) { _warn('Prompt fetch failed:', e.message); }
  if (!analysisPrompt) {
    analysisPrompt = `[Step ${step}/${totalSteps}] Analyze this video completely. Return ONLY a single pure JSON object using the prescribed schema. No conversational filler. Just the JSON.`;
  }

  await injectTextAndSend(promptInput, analysisPrompt);
  monitorResponse();

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
    const files = [];
    for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    await uploadFilesToChatGPT(promptInput, files);
  }

  await injectTextAndSend(promptInput, dossierPrompt);
  monitorResponse(true, channelName, sid);
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
      const files = [];
      for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
      await uploadFilesToChatGPT(promptInput, files);
    }

    await injectTextAndSend(promptInput, benderPrompt);
    monitorNicheBendResponse(sessionId);

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

    const sceneFiles = [];
    for (let i = 0; i < dt.files.length; i++) sceneFiles.push(dt.files[i]);
    await uploadFilesToChatGPT(el, sceneFiles);

    // Fetch Prompt
    const promptsRes = await fetch('http://127.0.0.1:3005/api/prompts');
    const prompts = await promptsRes.json();
    const scenePrompt = prompts.find(p => p.id === 'scene-analyzer.txt');
    const promptText = scenePrompt ? scenePrompt.content : "Analyze these images and tell me the composition.";

    await injectTextAndSend(el, promptText);
    showToast('Running Multi-Modal Analysis...');
    monitorSceneAnalyzerResponse(sessionId);

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
