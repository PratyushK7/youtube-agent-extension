// background.js: Orchestrator for Sequential Analysis (Modern Async Edition)
// NOTE: MV3 service workers can be killed after ~30s of inactivity.
// All state MUST be persisted to chrome.storage.local and restored on wake.

let state = {
  queue: [],
  currentIndex: -1,
  retryCount: 0,
  ytTabId: null,
  chatTabId: null,
  channelName: '',
  isSequential: false,
  sessionId: null
};

const SERVER = 'http://127.0.0.1:3005';

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Logging helper — all background logs use this prefix
const log = (msg, ...args) => console.log(`YT-to-AI: [BG] ${msg}`, ...args);
const logWarn = (msg, ...args) => console.warn(`YT-to-AI: [BG] ${msg}`, ...args);
const logErr = (msg, ...args) => console.error(`YT-to-AI: [BG] ${msg}`, ...args);

// ─── Step Watchdog Timer ────────────────────────────────────
// If no STEP_RESULT arrives within 5 minutes after sending to ChatGPT,
// auto-fail the step so the flow doesn't get permanently stuck.
let stepWatchdogTimer = null;
const STEP_WATCHDOG_MS = 5 * 60 * 1000; // 5 minutes

function startStepWatchdog() {
  clearStepWatchdog();
  log(`Watchdog started (${STEP_WATCHDOG_MS/1000}s timeout)`);
  stepWatchdogTimer = setTimeout(() => {
    logErr('WATCHDOG FIRED — no STEP_RESULT received in time. Auto-failing step.');
    stepWatchdogTimer = null;
    handleStepResult({ status: 'fail' });
  }, STEP_WATCHDOG_MS);
}

function clearStepWatchdog() {
  if (stepWatchdogTimer) {
    clearTimeout(stepWatchdogTimer);
    stepWatchdogTimer = null;
  }
}

// Set one-time harvest flag before navigating to a video
async function setHarvestFlag(videoId) {
  await chrome.storage.local.set({ harvestNow: true, harvestVideoId: videoId });
  log(`Harvest flag set for: ${videoId}`);
}

// ─── State Persistence (MV3 survival) ──────────────────────
async function saveState() {
  await chrome.storage.local.set({
    _bgState: {
      queue: state.queue,
      currentIndex: state.currentIndex,
      retryCount: state.retryCount,
      ytTabId: state.ytTabId,
      chatTabId: state.chatTabId,
      channelName: state.channelName,
      isSequential: state.isSequential,
      sessionId: state.sessionId
    }
  });
}

async function restoreState() {
  try {
    const data = await chrome.storage.local.get('_bgState');
    if (data._bgState && data._bgState.queue && data._bgState.queue.length > 0) {
      Object.assign(state, data._bgState);
      log(`State restored — step ${state.currentIndex + 1}/${state.queue.length}, session=${state.sessionId}`);
    }
  } catch (e) {
    logErr('Failed to restore state:', e.message);
  }
}

// Restore state on service worker startup (MV3 wake)
restoreState();

// ─── Tab Close Detection ───────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!state.isSequential) return;
  if (tabId === state.ytTabId) {
    console.error('YT-to-AI: YouTube tab was closed. Attempting recovery...');
    // Re-create the YouTube tab and continue
    setHarvestFlag(state.queue[state.currentIndex]);
    chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}` }, (tab) => {
      state.ytTabId = tab.id;
      saveState();
    });
  }
  if (tabId === state.chatTabId) {
    console.error('YT-to-AI: ChatGPT tab was closed. Will re-create on next step.');
    state.chatTabId = null;
    saveState();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ensure state is alive (MV3 may have restarted)
  if (state.queue.length === 0 && ['VIDEO_READY', 'STEP_RESULT', 'SAVE_VIDEO_TO_SESSION', 'COMPLETE_SESSION', 'SAVE_NICHE_BENDS'].includes(request.action)) {
    restoreState().then(() => {
      routeMessage(request, sender, sendResponse);
    });
    return true;
  }
  return routeMessage(request, sender, sendResponse);
});

function routeMessage(request, sender, sendResponse) {
  if (request.action === 'START_SEQUENTIAL') {
    handleStartSequential(request, sender);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'VIDEO_READY') {
    handleVideoReady(request, sender);
    return true;
  }

  if (request.action === 'STEP_RESULT') {
    handleStepResult(request);
    return true;
  }

  if (request.action === 'GET_TRANSCRIPT') {
    handleGetTranscript(request, sendResponse);
    return true;
  }

  if (request.action === 'SAVE_VIDEO_TO_SESSION') {
    handleSaveVideoToSession(request, sendResponse);
    return true;
  }

  if (request.action === 'COMPLETE_SESSION') {
    handleCompleteSession(request, sendResponse);
    return true;
  }

  if (request.action === 'SAVE_NICHE_BENDS') {
    handleSaveNicheBends(request, sendResponse);
    return true;
  }

  if (request.action === 'SAVE_SCENE_ANALYSIS') {
    handleSaveSceneAnalysis(request, sendResponse);
    return true;
  }

  if (request.action === 'RESUME_SEQUENTIAL') {
    handleResumeSequential(request, sender, sendResponse);
    return true;
  }

  if (request.action === 'RESET_SESSION') {
    handleResetSession(sendResponse);
    return true;
  }

  if (request.action === 'DASHBOARD_TRIGGER_SYNTHESIS') {
    handleDashboardTriggerSynthesis(request, sendResponse);
    return true;
  }
  
  return false;
}

// --- Logic Handlers ---

async function handleDashboardTriggerSynthesis(request, sendResponse) {
  const { sessionId, channelName, totalVideos } = request;
  log(`Dashboard synthesis trigger: session=${sessionId}, channel=${channelName}`);
  state.sessionId = sessionId;
  state.channelName = channelName;
  state.isSequential = false;

  // Helper to safely send message with retry
  const safeSendSynthesis = async (tabId, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'FINAL_SYNTHESIS',
          channelName,
          sessionId,
          totalSteps: totalVideos
        });
        log('FINAL_SYNTHESIS sent to tab', tabId);
        return;
      } catch (e) {
        logWarn(`FINAL_SYNTHESIS send attempt ${i+1} failed:`, e.message);
        if (i < retries) await delay(2000);
      }
    }
    logErr('All FINAL_SYNTHESIS send attempts failed — reloading tab');
    try { await chrome.tabs.reload(tabId); } catch (e) {}
  };

  // Create/Focus ChatGPT tab
  chrome.tabs.query({ url: '*://chatgpt.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      state.chatTabId = tabs[0].id;
      chrome.tabs.update(state.chatTabId, { active: true }, () => {
        setTimeout(() => safeSendSynthesis(state.chatTabId), 1500);
      });
    } else {
      chrome.tabs.create({ url: 'https://chatgpt.com/' }, (tab) => {
        state.chatTabId = tab.id;
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(() => safeSendSynthesis(tab.id), 3000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // Timeout safety: if tab never fires 'complete', try anyway after 10s
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          safeSendSynthesis(tab.id);
        }, 10000);
      });
    }
  });

  sendResponse({ success: true });
}

async function handleStartSequential(request, sender) {
  log(`Starting sequential: channel=${request.channelName}, videos=${request.queue.length}`);
  // Create a server-side session first
  let sessionId = null;
  try {
    const res = await fetch(`${SERVER}/api/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: request.channelName,
        totalVideos: request.queue.length,
        promptUsed: 'sequential_chatgpt'
      })
    });
    const data = await res.json();
    if (data.success) sessionId = data.session.id;
    log('Session created:', sessionId);
  } catch (e) {
    logWarn('Could not create server session, continuing offline.', e.message);
  }

  state = {
    queue: request.queue,
    currentIndex: 0,
    retryCount: 0,
    ytTabId: sender.tab.id,
    chatTabId: null,
    channelName: request.channelName,
    isSequential: true,
    sessionId: sessionId
  };
  
  await chrome.storage.local.set({ 
    isSequential: true, 
    currentIndex: 0,
    totalSteps: request.queue.length,
    channelName: request.channelName,
    sessionId: sessionId
  });
  await saveState();

  await setHarvestFlag(state.queue[0]);
  chrome.tabs.update(state.ytTabId, { url: `https://www.youtube.com/watch?v=${state.queue[0]}` });
}

async function handleResumeSequential(request, sender, sendResponse) {
  if (!state.isSequential || state.queue.length === 0 || state.currentIndex >= state.queue.length) {
    sendResponse({ success: false, error: 'No active sequence to resume.' });
    return;
  }
  log(`Resuming sequence from step ${state.currentIndex + 1}/${state.queue.length}`);
  
  // Create a fresh YouTube tab to kickstart the monitor
  chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}` }, (tab) => {
    state.ytTabId = tab.id;
    setHarvestFlag(state.queue[state.currentIndex]);
    saveState();
    sendResponse({ success: true });
  });
}

async function handleResetSession(sendResponse) {
  log('RESET_SESSION: Clearing all state...');
  clearStepWatchdog();
  
  state = {
    queue: [],
    currentIndex: -1,
    retryCount: 0,
    ytTabId: null,
    chatTabId: null,
    channelName: '',
    isSequential: false,
    sessionId: null
  };
  
  await chrome.storage.local.remove([
    '_bgState', 'isSequential', 'currentIndex', 'totalSteps', 
    'channelName', 'sessionId', 'pendingAnalysis', 'imageData',
    'transcript', 'videoTitle', 'videoId', 'step', 'views', 
    'duration'
  ]);
  
  log('RESET_SESSION: State cleared successfully.');
  sendResponse({ success: true });
}

async function handleVideoReady(request, sender) {
  try {
    const videoId = new URLSearchParams(new URL(sender.tab.url).search).get('v');
    
    // 📸 Thumbnail Harvester — use player-provided URL first, then fallback to img.youtube.com
    const fetchBestThumbnail = async (id, playerUrl) => {
      const urls = [
        playerUrl,
        `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        `https://img.youtube.com/vi/${id}/0.jpg`
      ].filter(Boolean);
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            // Reject gray placeholders (~1.1kb). Real thumbnails are usually > 5kb.
            if (blob.size > 2500) {
              console.log(`YT-to-AI: [Screenshot] Fetched thumbnail from ${url} (${(blob.size/1024).toFixed(1)}KB)`);
              return blob;
            } else {
              console.warn(`YT-to-AI: [Screenshot] Rejected placeholder from ${url} (${blob.size}B)`);
            }
          }
        } catch (e) {
          console.warn(`YT-to-AI: [Screenshot] Failed to fetch ${url}:`, e.message);
        }
      }
      return null;
    };

    const thumbnailBlob = await fetchBestThumbnail(videoId, request.thumbnailUrl);
    let finalImageData = '';

    if (thumbnailBlob) {
      finalImageData = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(thumbnailBlob);
      });
      console.log(`YT-to-AI: [Screenshot] Converted to data URL (${(finalImageData.length/1024).toFixed(1)}KB)`);
    } else {
      // Fallback to snapshot if URLs are somehow blocked
      console.warn('YT-to-AI: [Screenshot] All thumbnail URLs failed, falling back to tab capture');
      try {
        finalImageData = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 90 });
        console.log(`YT-to-AI: [Screenshot] Tab capture success (${(finalImageData.length/1024).toFixed(1)}KB)`);
      } catch (captureErr) {
        console.error('YT-to-AI: [Screenshot] Tab capture also failed:', captureErr.message);
        finalImageData = '';
      }
    }
    
    const payload = {
      pendingAnalysis: true,
      isSequential: true,
      step: state.currentIndex + 1,
      totalSteps: state.queue.length,
      videoTitle: request.videoTitle,
      transcript: request.transcript,
      views: request.views || 'TBD',
      duration: request.duration || 'TBD',
      imageData: finalImageData,
      sessionId: state.sessionId,
      videoId: videoId
    };

    // Write payload to storage BEFORE opening/triggering ChatGPT tab
    await chrome.storage.local.set(payload);

    // Start watchdog — auto-fail if ChatGPT never responds
    startStepWatchdog();

    if (!state.chatTabId) {
      const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
      state.chatTabId = tab.id;
      await saveState();
      // The content script will auto-trigger via window.load -> pendingAnalysis check
    } else {
      // Verify the ChatGPT tab still exists
      try {
        await chrome.tabs.get(state.chatTabId);
      } catch (e) {
        // Tab was closed — re-create it
        const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
        state.chatTabId = tab.id;
        await saveState();
        return; // Content script will auto-trigger on load
      }
      await chrome.tabs.update(state.chatTabId, { active: true });
      // Small delay to ensure tab is focused before sending message
      await delay(500);
      
      // Send TRIGGER_STEP with error recovery — if content script isn't loaded, reload the tab
      try {
        await chrome.tabs.sendMessage(state.chatTabId, { action: 'TRIGGER_STEP' });
        console.log('YT-to-AI: TRIGGER_STEP sent to ChatGPT tab', state.chatTabId);
      } catch (msgErr) {
        console.warn('YT-to-AI: Content script not responding on ChatGPT tab, reloading tab...', msgErr.message);
        // Content script is dead/not injected — reload the tab so it re-injects and picks up pendingAnalysis from storage
        try {
          await chrome.tabs.reload(state.chatTabId);
          console.log('YT-to-AI: ChatGPT tab reloaded, content script will auto-trigger via pendingAnalysis flag');
        } catch (reloadErr) {
          // Tab is truly gone — create a new one
          console.warn('YT-to-AI: Reload failed, creating new ChatGPT tab');
          const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
          state.chatTabId = tab.id;
          await saveState();
        }
      }
    }
  } catch (err) {
    console.error('YT-to-AI: Video Ready flow failed', err);
    // CRITICAL: Don't let the flow die silently — skip to next video
    chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
  }
}

async function handleStepResult(request) {
  clearStepWatchdog();
  log(`STEP_RESULT received: ${request.status} (step ${state.currentIndex + 1}/${state.queue.length})`);
  if (request.status === 'success') {
    state.retryCount = 0;
    state.currentIndex++;
    
    if (state.currentIndex < state.queue.length) {
      await chrome.storage.local.set({ currentIndex: state.currentIndex, totalSteps: state.queue.length });
      await saveState();
      // Verify YT tab still exists
      try {
        await chrome.tabs.get(state.ytTabId);
        await setHarvestFlag(state.queue[state.currentIndex]);
        chrome.tabs.update(state.ytTabId, { 
          url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}`,
          active: true
        });
      } catch (e) {
        await setHarvestFlag(state.queue[state.currentIndex]);
        const tab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}` });
        state.ytTabId = tab.id;
        await saveState();
      }
    } else {
      // All videos done — Finish sequential flow without auto-synthesis
      console.log('YT-to-AI: Sequential analysis complete. Returning to Dashboard.');
      state.isSequential = false;
      await chrome.storage.local.remove(['isSequential', 'currentIndex', 'totalSteps']);
      await saveState();
      
      // Move focus to the Dashboard instead of auto-running synthesis
      focusDashboardTab();
    }
  } else {
    // Retry logic
    if (state.retryCount < 3) {
      state.retryCount++;
      await saveState();
      log(`Retrying step ${state.currentIndex + 1} (attempt ${state.retryCount}/3)`);
      await delay(2000);
      try {
        await chrome.tabs.sendMessage(state.chatTabId, { action: 'TRIGGER_STEP', retryAttempt: state.retryCount });
      } catch (msgErr) {
        logWarn('Retry sendMessage failed, reloading ChatGPT tab:', msgErr.message);
        try {
          await chrome.tabs.reload(state.chatTabId);
        } catch (e) {
          const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
          state.chatTabId = tab.id;
          await saveState();
        }
      }
    } else {
      // Skip this video after max retries
      console.warn(`YT-to-AI: Skipping video ${state.currentIndex + 1} after 3 failed retries.`);
      state.retryCount = 0;
      state.currentIndex++;
      await saveState();
      if (state.currentIndex < state.queue.length) {
         await chrome.storage.local.set({ currentIndex: state.currentIndex, totalSteps: state.queue.length });
         try {
           await chrome.tabs.get(state.ytTabId);
           await setHarvestFlag(state.queue[state.currentIndex]);
           chrome.tabs.update(state.ytTabId, { 
             url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}`,
             active: true
           });
         } catch (e) {
           await setHarvestFlag(state.queue[state.currentIndex]);
           const tab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}` });
           state.ytTabId = tab.id;
           await saveState();
         }
      } else {
        // Queue finished (path with failures) — Return to Dashboard
        console.log('YT-to-AI: Sequential analysis concluded with some skips. Returning to Dashboard.');
        state.isSequential = false;
        await chrome.storage.local.remove(['isSequential', 'currentIndex', 'totalSteps']);
        await saveState();
        focusDashboardTab();
      }
    }
  }
}

async function handleGetTranscript(request, sendResponse) {
  try {
    const res = await fetch(`${SERVER}/api/get-transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds: [request.videoId] })
    });
    const data = await res.json();
    sendResponse({ success: true, transcript: data.transcripts?.[0]?.transcript });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleSaveVideoToSession(request, sendResponse) {
  const { sessionId, videoData, rawResponse, screenshot } = request;
  if (!sessionId) {
    sendResponse({ success: false, error: 'No session ID' });
    return;
  }
  try {
    const res = await fetch(`${SERVER}/api/session/${sessionId}/video`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoData, rawResponse, screenshot })
    });
    const data = await res.json();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleCompleteSession(request, sendResponse) {
  const { sessionId, synthesis, screenshot } = request;
  if (!sessionId) {
    sendResponse({ success: false, error: 'No session ID' });
    return;
  }
  try {
    const res = await fetch(`${SERVER}/api/session/${sessionId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synthesis, screenshot })
    });
    const data = await res.json();
    focusDashboardTab();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleSaveNicheBends(request, sendResponse) {
  const { sessionId, nicheBends } = request;
  if (!sessionId) {
    sendResponse({ success: false, error: 'No session ID' });
    return;
  }
  try {
    const res = await fetch(`${SERVER}/api/session/${sessionId}/niche-bends`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nicheBends })
    });
    const data = await res.json();
    focusDashboardTab();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleSaveSceneAnalysis(request, sendResponse) {
  const { sessionId, sceneAnalysis } = request;
  if (!sessionId) {
    sendResponse({ success: false, error: 'No session ID' });
    return;
  }
  try {
    const res = await fetch(`${SERVER}/api/session/${sessionId}/scene-analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneAnalysis })
    });
    const data = await res.json();
    focusDashboardTab();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function focusDashboardTab() {
  console.log('YT-to-AI: Searching for Dashboard tab...');
  // Query for any tab containing dashboard.html on common local ports
  chrome.tabs.query({}, (tabs) => {
    const dashboardTab = tabs.find(t => 
      t.url && (t.url.includes('127.0.0.1:3005') || t.url.includes('localhost:3005'))
    );

    if (dashboardTab) {
      console.log('YT-to-AI: Dashboard found! Switching focus...');
      chrome.tabs.update(dashboardTab.id, { active: true });
      chrome.windows.update(dashboardTab.windowId, { focused: true });
      
      // Force an immediate UI refresh
      chrome.tabs.sendMessage(dashboardTab.id, { action: 'FORCE_REFRESH' });
    } else {
      console.warn('YT-to-AI: Dashboard tab not found. Please keep it open at http://127.0.0.1:3005');
    }
  });
}
