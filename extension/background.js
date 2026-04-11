// background.js: Orchestrator for Sequential Analysis (Modern Async Edition)

let state = {
  queue: [],
  currentIndex: -1,
  retryCount: 0,
  ytTabId: null,
  chatTabId: null,
  channelName: '',
  isSequential: false,
  basePrompt: ''
};

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

  if (request.action === 'SYNC_REPORT') {
    handleSyncReport(request, sendResponse);
    return true;
  }
});

// --- Logic Handlers ---

async function handleStartSequential(request, sender) {
  state = {
    queue: request.queue,
    currentIndex: 0,
    retryCount: 0,
    ytTabId: sender.tab.id,
    chatTabId: null,
    channelName: request.channelName,
    isSequential: true,
    basePrompt: request.prompt
  };
  
  await chrome.storage.local.set({ 
    isSequential: true, 
    currentIndex: 0, 
    channelName: request.channelName 
  });

  chrome.tabs.update(state.ytTabId, { url: `https://www.youtube.com/watch?v=${state.queue[0]}` });
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
      prompt: `[SEQUENTIAL ANALYSIS STEP ${state.currentIndex + 1}/${state.queue.length}]\n\n` + 
              `VIDEO TITLE: ${request.videoTitle}\n` +
              `TRANSCRIPT:\n${request.transcript}\n\n` +
              `INSTRUCTION: Add this video to your strategic context. Analyze its hook, retention pattern, and unique tactical components. Do not generate the final SOP yet.\n\n` +
              `---\n\n${state.basePrompt}`
    };

    await chrome.storage.local.set(payload);

    if (!state.chatTabId) {
      const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/' });
      state.chatTabId = tab.id;
    } else {
      await chrome.tabs.update(state.chatTabId, { active: true });
      chrome.tabs.sendMessage(state.chatTabId, { action: 'TRIGGER_STEP' });
    }
  } catch (err) {
    console.error('YT-to-AI: Video Ready flow failed', err);
  }
}

async function handleStepResult(request) {
  if (request.status === 'success') {
    state.retryCount = 0;
    state.currentIndex++;
    
    if (state.currentIndex < state.queue.length) {
      await chrome.storage.local.set({ currentIndex: state.currentIndex });
      chrome.tabs.update(state.ytTabId, { 
        url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}`,
        active: true
      });
    } else {
      await chrome.storage.local.remove(['isSequential', 'currentIndex']);
      chrome.tabs.update(state.chatTabId, { active: true });
      chrome.tabs.sendMessage(state.chatTabId, { 
        action: 'FINAL_SYNTHESIS',
        channelName: state.channelName
      });
      state.isSequential = false;
    }
  } else {
    // Retry logic
    if (state.retryCount < 3) {
      state.retryCount++;
      chrome.tabs.sendMessage(state.chatTabId, { action: 'TRIGGER_STEP', retryAttempt: state.retryCount });
    } else {
      state.retryCount = 0;
      state.currentIndex++;
      if (state.currentIndex < state.queue.length) {
         await chrome.storage.local.set({ currentIndex: state.currentIndex });
         chrome.tabs.update(state.ytTabId, { 
           url: `https://www.youtube.com/watch?v=${state.queue[state.currentIndex]}`,
           active: true
         });
      }
    }
  }
}

async function handleGetTranscript(request, sendResponse) {
  try {
    const res = await fetch('http://127.0.0.1:3005/api/get-transcripts', {
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

async function handleSyncReport(request, sendResponse) {
  try {
    const res = await fetch('http://127.0.0.1:3005/api/save-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload)
    });
    const data = await res.json();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
