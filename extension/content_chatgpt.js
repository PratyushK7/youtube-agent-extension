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

  // 📦 Multi-Modal Package: Attach Thumbnail and Transcript
  const dt = new DataTransfer();
  
  // 1. Attach Video Metadata & Transcript (Clean context)
  const metaText = `VIDEO TITLE: ${data.videoTitle || 'Unknown'}\n\nTRANSCRIPT:\n${data.prompt || ''}`;
  const metaFile = new File([new Blob([metaText], { type: 'text/plain' })], 'video_transcript.txt', { type: 'text/plain' });
  dt.items.add(metaFile);

  // 2. Attach Thumbnail
  if (data.imageData && data.imageData.length > 100) {
    try {
      const resp = await fetch(data.imageData);
      const blob = await resp.blob();
      if (blob.size > 2500) {
        dt.items.add(new File([blob], 'video_frame.png', { type: blob.type }));
      }
    } catch (e) { console.warn('YT-to-AI: Thumbnail attachment failed.', e); }
  }

  showToast(`Injecting Video Assets (${data.videoTitle || 'Step ' + step})...`);
  promptInput.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
  await new Promise(r => setTimeout(r, 2200));

  // Inject Pure Instruction (Zero-Noise)
  const instructionPrompt = `[Step ${step}/${totalSteps}] Analyze this video completely. Return ONLY a single pure JSON object using the prescribed schema. No conversational filler. Just the JSON.`;
  document.execCommand('insertText', false, instructionPrompt);

  setTimeout(() => {
    const sendBtn = document.querySelector('button[data-testid="send-button"]') || 
                    document.querySelector('button[aria-label="Send prompt"]') ||
                    document.querySelector('form button[type="submit"]') ||
                    document.querySelector('button.bg-black');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      monitorResponse();
    }
  }, 1500);
}

async function generateMasterDossier(channelName, passedTotalSteps, passedSessionId) {
  console.log('YT-to-AI: Initiating Final Synthesis Phase...');
  
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
    console.error('YT-to-AI: Cannot find ChatGPT input for final synthesis.');
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
    showToast(`Uploading Strategic Dossier (${dt.items.length} assets)...`);
    promptInput.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
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
      showToast(`Injecting Strategic Evidence (${dt.items.length} assets)...`);
      promptInput.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
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
  console.log('YT-to-AI: Monitor Active for Niche Bender...');
  let lastText = '';
  let stabilityCount = 0;
  let tickCount = 0;
  let handled = false;
  const MAX_TICKS = 150; // 5 minutes (15 bends takes longer)
  
  const interval = setInterval(() => {
    if (handled) return;
    tickCount++;
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (messages.length === 0) return;
    
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

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    el.dispatchEvent(pasteEvent);
    
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
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  const channelName = params.get('channelName');

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
      automateChatGPT();
    }
  });
}

// Support both immediate and delayed load (ChatGPT SPA can be tricky)
if (document.readyState === 'complete') {
  initializeTriggers();
} else {
  window.addEventListener('load', initializeTriggers);
}
