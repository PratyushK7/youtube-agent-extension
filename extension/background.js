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
const ANALYTICS_ENDPOINT = `${SERVER}/api/analytics/event`;

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function trackEvent(eventName, properties = {}) {
  fetch(ANALYTICS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName,
      source: 'extension_background',
      properties,
      timestamp: new Date().toISOString()
    })
  }).catch(() => {
    // No-op: telemetry cannot block orchestration.
  });
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

  if (request.action === 'RESUME_SEQUENTIAL') {
    handleResumeSequential(request, sender, sendResponse);
    return true;
  }
  
  return false;
}

// --- Logic Handlers ---

async function handleStartSequential(request, sender) {
  trackEvent('analysis_started', {
    channelName: request.channelName,
    queueLength: request.queue?.length || 0
  });

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

  trackEvent('session_created', {
    sessionId,
    queueLength: state.queue.length
  });
  
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
  trackEvent('analysis_resumed', {
    sessionId: state.sessionId,
    currentIndex: state.currentIndex
  });
  
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
              `INSTRUCTION: Analyze this video completely. Return a JSON object with these fields: videoNumber, title, hookType, hookText, hookFramework, openingStructure, scriptStructure, storytellingFramework, rehooksUsed, retentionPattern, ctaPlacement, keyTakeaways, thumbnailDescription, titleStrategy, thumbnailStrategy.\n\n` +
              `---\n\n${state.basePrompt}`
    };

    // Write payload to storage BEFORE opening/triggering ChatGPT tab
    await chrome.storage.local.set(payload);
    trackEvent('video_payload_ready', {
      sessionId: state.sessionId,
      step: state.currentIndex + 1,
      totalSteps: state.queue.length,
      videoId
    });

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
    trackEvent('analysis_failed', {
      sessionId: state.sessionId,
      step: state.currentIndex + 1,
      reason: 'video_ready_flow_failed'
    });
    // CRITICAL: Don't let the flow die silently — skip to next video
    chrome.runtime.sendMessage({ action: 'STEP_RESULT', status: 'fail' });
  }
}

async function handleStepResult(request) {
  if (request.status === 'success') {
    trackEvent('analysis_step_completed', {
      sessionId: state.sessionId,
      step: state.currentIndex + 1,
      totalSteps: state.queue.length
    });
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
      trackEvent('analysis_completed', {
        sessionId: state.sessionId,
        totalSteps: state.queue.length
      });
      // All videos done — trigger final synthesis
      state.isSequential = false;
      await chrome.storage.local.remove(['isSequential', 'currentIndex']);
      await saveState();
      
      try {
        await chrome.tabs.get(state.chatTabId);
        await chrome.tabs.update(state.chatTabId, { active: true });
      } catch (e) {
        const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
        state.chatTabId = tab.id;
        await saveState();
      }
      
      await delay(1000);
      chrome.tabs.sendMessage(state.chatTabId, { 
        action: 'FINAL_SYNTHESIS',
        channelName: state.channelName,
        sessionId: state.sessionId,
        totalSteps: state.queue.length
      });
    }
  } else {
    trackEvent('analysis_step_failed', {
      sessionId: state.sessionId,
      step: state.currentIndex + 1,
      retryCount: state.retryCount
    });
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
        // Even if last video failed, still do synthesis with what we have
        state.isSequential = false;
        await chrome.storage.local.remove(['isSequential', 'currentIndex', 'totalSteps']);
        await saveState();
        try {
          await chrome.tabs.get(state.chatTabId);
          chrome.tabs.update(state.chatTabId, { active: true });
        } catch (e) {
          const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
          state.chatTabId = tab.id;
          await saveState();
        }
        await delay(500);
        chrome.tabs.sendMessage(state.chatTabId, { 
          action: 'FINAL_SYNTHESIS',
          channelName: state.channelName,
          sessionId: state.sessionId
        });
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
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
