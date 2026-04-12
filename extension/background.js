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
  basePrompt: '',
  sessionId: null
};

const SERVER = 'http://127.0.0.1:3005';

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      basePrompt: state.basePrompt,
      sessionId: state.sessionId
    }
  });
}

async function restoreState() {
  const data = await chrome.storage.local.get('_bgState');
  if (data._bgState && data._bgState.queue && data._bgState.queue.length > 0) {
    Object.assign(state, data._bgState);
    console.log(`YT-to-AI: State restored — step ${state.currentIndex + 1}/${state.queue.length}, session=${state.sessionId}`);
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

  if (request.action === 'SAVE_NICHE_BENDS') {
    handleSaveNicheBends(request, sendResponse);
    return true;
  }

  if (request.action === 'RESUME_SEQUENTIAL') {
    handleResumeSequential(request, sender, sendResponse);
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
  state.sessionId = sessionId;
  state.channelName = channelName;
  state.isSequential = false;

  // Create/Focus ChatGPT tab
  chrome.tabs.query({ url: '*://chatgpt.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      state.chatTabId = tabs[0].id;
      chrome.tabs.update(state.chatTabId, { active: true }, () => {
        setTimeout(() => {
          chrome.tabs.sendMessage(state.chatTabId, {
            action: 'FINAL_SYNTHESIS',
            channelName,
            sessionId,
            totalSteps: totalVideos
          });
        }, 1500);
      });
    } else {
      chrome.tabs.create({ url: 'https://chatgpt.com/' }, (tab) => {
        state.chatTabId = tab.id;
        // Wait for page load
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'FINAL_SYNTHESIS',
                channelName,
                sessionId,
                totalSteps: totalVideos
              });
            }, 3000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }
  });

  sendResponse({ success: true });
}

async function handleStartSequential(request, sender) {
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
  } catch (e) {
    console.warn('YT-to-AI: Could not create server session, continuing offline.', e);
  }

  state = {
    queue: request.queue,
    currentIndex: 0,
    retryCount: 0,
    ytTabId: sender.tab.id,
    chatTabId: null,
    channelName: request.channelName,
    isSequential: true,
    basePrompt: request.prompt || '',
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

  chrome.tabs.update(state.ytTabId, { url: `https://www.youtube.com/watch?v=${state.queue[0]}` });
}

async function handleResumeSequential(request, sender, sendResponse) {
  if (!state.isSequential || state.queue.length === 0 || state.currentIndex >= state.queue.length) {
    sendResponse({ success: false, error: 'No active sequence to resume.' });
    return;
  }
  console.log(`YT-to-AI: Resuming sequence from step ${state.currentIndex + 1}/${state.queue.length}`);
  
  // Create a fresh YouTube tab to kickstart the monitor
  chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}` }, (tab) => {
    state.ytTabId = tab.id;
    saveState();
    sendResponse({ success: true });
  });
}

async function handleVideoReady(request, sender) {
  try {
    const videoId = new URLSearchParams(new URL(sender.tab.url).search).get('v');
    
    // 📸 ARTICLE-BASED RESILIENT HARVESTER
    const fetchBestThumbnail = async (id) => {
      const urls = [
        `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        `https://img.youtube.com/vi/${id}/0.jpg`
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            // Reject gray placeholders (~1.1kb). Real thumbnails are usually > 5kb.
            if (blob.size > 2500) return blob;
          }
        } catch (e) {}
      }
      return null;
    };

    const thumbnailBlob = await fetchBestThumbnail(videoId);
    let finalImageData = '';

    if (thumbnailBlob) {
      finalImageData = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(thumbnailBlob);
      });
    } else {
      // Fallback to snapshot if URLs are somehow blocked
      finalImageData = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 90 });
    }
    
    const payload = {
      pendingAnalysis: true,
      isSequential: true,
      step: state.currentIndex + 1,
      totalSteps: state.queue.length,
      videoTitle: request.videoTitle,
      transcript: request.transcript,
      imageData: finalImageData,
      sessionId: state.sessionId,
      videoId: videoId,
      prompt: `[SEQUENTIAL ANALYSIS STEP ${state.currentIndex + 1}/${state.queue.length}]\n\n` + 
              `VIDEO TITLE: ${request.videoTitle}\n` +
              `TRANSCRIPT:\n${request.transcript}\n\n` +
              `INSTRUCTION: Analyze this video completely. Return ONLY a single pure JSON object. No conversational filler, no introductions, no closing remarks. Just the JSON.\n\n` +
              `JSON Fields: videoNumber, title, hookType, hookText, hookFramework, openingStructure, scriptStructure, storytellingFramework, rehooksUsed, retentionPattern, ctaPlacement, keyTakeaways, thumbnailDescription, titleStrategy, thumbnailStrategy.\n\n` +
              `---\n\n${state.basePrompt}`
    };

    // Write payload to storage BEFORE opening/triggering ChatGPT tab
    await chrome.storage.local.set(payload);

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
      chrome.tabs.sendMessage(state.chatTabId, { action: 'TRIGGER_STEP' });
    }
  } catch (err) {
    console.error('YT-to-AI: Video Ready flow failed', err);
    // CRITICAL: Don't let the flow die silently — skip to next video
    chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
  }
}

async function handleStepResult(request) {
  if (request.status === 'success') {
    state.retryCount = 0;
    state.currentIndex++;
    
    if (state.currentIndex < state.queue.length) {
      await chrome.storage.local.set({ currentIndex: state.currentIndex, totalSteps: state.queue.length });
      await saveState();
      // Verify YT tab still exists
      try {
        await chrome.tabs.get(state.ytTabId);
        chrome.tabs.update(state.ytTabId, { 
          url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}`,
          active: true
        });
      } catch (e) {
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
      console.log(`YT-to-AI: Retrying step ${state.currentIndex + 1} (attempt ${state.retryCount}/3)`);
      await delay(2000);
      chrome.tabs.sendMessage(state.chatTabId, { action: 'TRIGGER_STEP', retryAttempt: state.retryCount });
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
           chrome.tabs.update(state.ytTabId, { 
             url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}`,
             active: true
           });
         } catch (e) {
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
