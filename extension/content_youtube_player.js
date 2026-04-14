// Minimal HUD for the player page
function showPlayerStatus(text) {
  let hud = document.getElementById('yt-ai-status-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'yt-ai-status-hud';
    hud.innerHTML = '<div class="hud-pulse"></div><span id="yt-ai-status-text"></span>';
    document.body.appendChild(hud);
  }
  document.getElementById('yt-ai-status-text').innerText = text;
  hud.style.display = 'flex';
  hud.style.opacity = '1';
  hud.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
}

function hidePlayerStatus() {
  const hud = document.getElementById('yt-ai-status-hud');
  if (hud) {
    hud.style.opacity = '0';
    setTimeout(() => {
      if (document.getElementById('yt-ai-status-hud')) {
        hud.remove();
      }
    }, 600);
  }
}

// Wait for video element to appear in DOM (YouTube SPA may not have it immediately)
function waitForVideo(timeout = 10000) {
  return new Promise((resolve) => {
    const check = () => {
      const vid = document.querySelector('video');
      // Ensure it's not a tiny hidden preview or empty element
      if (vid && vid.src && vid.videoWidth > 0) return true;
      return false;
    };

    if (check()) return resolve(document.querySelector('video'));

    const observer = new MutationObserver(() => {
      if (check()) { observer.disconnect(); resolve(document.querySelector('video')); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector('video'));
    }, timeout);
  });
}

function isAdPlaying() {
  return !!document.querySelector('.ad-showing, .ad-interrupting');
}

// Scrape transcript by programmatically clicking YouTube's "Show transcript" button
async function scrapeTranscriptFromDOM() {
  // Step 1: Expand the description if collapsed (transcript button is inside it)
  const expandBtn = document.querySelector('tp-yt-paper-button#expand');
  if (expandBtn) {
    expandBtn.click();
    await new Promise(r => setTimeout(r, 800));
  }

  // Step 2: Find and click the "Show transcript" button
  // It lives inside ytd-video-description-transcript-section-renderer
  let transcriptBtn = null;

  // Primary selector: the button inside the transcript section of the description
  const section = document.querySelector('ytd-video-description-transcript-section-renderer');
  if (section) {
    transcriptBtn = section.querySelector('button')
      || section.querySelector('[aria-label="Show transcript"]');
  }

  // Fallback: search all buttons for one with "Show transcript" text
  if (!transcriptBtn) {
    const allButtons = document.querySelectorAll('button, ytd-button-renderer, tp-yt-paper-button');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('show transcript')) {
        transcriptBtn = btn;
        break;
      }
    }
  }

  if (!transcriptBtn) {
    console.warn('YT-to-AI: [Player] "Show transcript" button not found');
    return '[TRANSCRIPT UNAVAILABLE]';
  }

  console.log('YT-to-AI: [Player] Clicking "Show transcript" button...');
  transcriptBtn.click();

  // Step 3: Wait for the transcript panel to render with segments
  let panel = null;
  let segments = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    // The engagement panel that contains transcript segments
    panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
    if (panel) {
      segments = panel.querySelectorAll('ytd-transcript-segment-renderer');
      if (segments.length > 0) break;
    }
  }

  if (!segments || segments.length === 0) {
    console.warn('YT-to-AI: [Player] Transcript panel opened but no segments found');
    // Try to close the panel before returning
    closeTranscriptPanel(panel);
    return '[TRANSCRIPT UNAVAILABLE]';
  }

  console.log('YT-to-AI: [Player] Found', segments.length, 'transcript segments');

  // Step 4: Scrape timestamp + text from each segment
  const lines = [];
  for (const seg of segments) {
    const timestamp = (seg.querySelector('.segment-timestamp')?.textContent || '').trim();
    const text = (seg.querySelector('.segment-text')?.textContent || '').trim();
    if (text) {
      // Normalize timestamp to [MM:SS] format
      const formatted = formatTimestamp(timestamp);
      lines.push(`${formatted} ${text}`);
    }
  }

  // Step 5: Close the transcript panel
  closeTranscriptPanel(panel);

  if (lines.length === 0) {
    return '[TRANSCRIPT UNAVAILABLE]';
  }

  return lines.join('\n');
}

function formatTimestamp(ts) {
  // YouTube shows timestamps like "0:00", "1:23", "10:05", "1:00:05"
  const parts = ts.split(':').map(p => parseInt(p, 10));
  if (parts.length === 3) {
    // H:MM:SS → [HH:MM:SS]
    return `[${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:${String(parts[2]).padStart(2, '0')}]`;
  } else if (parts.length === 2) {
    // M:SS → [MM:SS]
    return `[${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}]`;
  }
  return `[${ts}]`;
}

function closeTranscriptPanel(panel) {
  try {
    if (!panel) {
      panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
    }
    if (panel) {
      const closeBtn = panel.querySelector('#close-button button, [aria-label="Close transcript"]');
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    }
    // Fallback: press Escape to close any open panel
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } catch (e) {
    console.warn('YT-to-AI: [Player] Could not close transcript panel:', e.message);
  }
}

async function harvestVideoInfo() {
  const data = await chrome.storage.local.get(['currentIndex', 'totalSteps']);
  const stepNum = (data.currentIndex || 0) + 1;
  const totalSteps = data.totalSteps || '?';
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;

  console.log(`YT-to-AI: Harvesting Video Player Data (Step ${stepNum}/${totalSteps})...`);

  // Extract Title — wait for it to render
  let videoTitle = '';
  for (let i = 0; i < 10; i++) {
    videoTitle = document.querySelector('h1.style-scope.ytd-watch-metadata')?.innerText
      || document.querySelector('yt-formatted-string.ytd-watch-metadata')?.innerText
      || '';
    if (videoTitle) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!videoTitle) videoTitle = document.title.split(' - YouTube')[0];

  showPlayerStatus(`Harvesting ${stepNum}/${totalSteps}: ${videoTitle}`);

  // THUMBNAIL: Deep harvest from internal player data (100% accuracy)
  showPlayerStatus('Capturing thumbnail...');
  let thumbnailUrl = '';
  try {
    const scripts = Array.from(document.querySelectorAll('script'));
    const playerScript = scripts.find(s => s.textContent.includes('ytInitialPlayerResponse'));
    if (playerScript) {
      const jsonText = playerScript.textContent.split('var ytInitialPlayerResponse = ')[1].split(';')[0];
      const playerData = JSON.parse(jsonText);
      const thumbs = playerData.videoDetails.thumbnail.thumbnails;
      thumbnailUrl = thumbs[thumbs.length - 1].url;
    }
  } catch (e) {
    thumbnailUrl = document.querySelector('meta[property="og:image"]')?.content || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  // Fetch transcript by clicking YouTube's "Show transcript" button and scraping the panel
  showPlayerStatus('Fetching transcript...');
  let transcript = '[TRANSCRIPT UNAVAILABLE]';

  try {
    transcript = await scrapeTranscriptFromDOM();
    if (transcript && transcript !== '[TRANSCRIPT UNAVAILABLE]') {
      console.log('YT-to-AI: [Player] DOM transcript:', transcript.split('\n').length, 'lines,', transcript.length, 'chars');
      showPlayerStatus('Transcript fetched (' + transcript.split('\n').length + ' lines)');
    }
  } catch (e) {
    console.warn('YT-to-AI: [Player] DOM transcript scrape failed:', e.message);
  }

  // Fallback: server relay via background.js
  if (!transcript || transcript === '[TRANSCRIPT UNAVAILABLE]') {
    try {
      console.log('YT-to-AI: [Player] Trying server fallback...');
      showPlayerStatus('Fetching transcript (server)...');
      const response = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ success: false }), 15000);
        chrome.runtime.sendMessage({ action: 'GET_TRANSCRIPT', videoId }, (res) => {
          clearTimeout(timer);
          resolve(res || { success: false });
        });
      });
      if (response?.success && response.transcript && !response.transcript.includes('UNAVAILABLE')) {
        transcript = response.transcript;
        console.log('YT-to-AI: [Player] Server transcript:', transcript.length, 'chars');
        showPlayerStatus('Transcript fetched (' + transcript.split('\n').length + ' lines)');
      }
    } catch (e2) {
      console.error('YT-to-AI: [Player] Server transcript also failed:', e2.message);
    }
  }

  if (!transcript || transcript === '[TRANSCRIPT UNAVAILABLE]') {
    showPlayerStatus('No transcript available');
  }

  showPlayerStatus('Preparing snapshot...');

  // Clean UI for the snapshot
  const sidebar = document.querySelector('#secondary');
  const comments = document.querySelector('ytd-comments');
  if (sidebar) sidebar.style.opacity = '0';
  if (comments) comments.style.opacity = '0';
  window.scrollTo(0, 0);

  // Small delay to let the UI settle
  await new Promise(r => setTimeout(r, 1000));

  // Extract Views
  let viewCount = 'Pending';
  try {
    viewCount = document.querySelector('ytd-watch-metadata #description-inner #info span:first-child')?.innerText
      || document.querySelector('.view-count')?.innerText
      || 'Pending';
  } catch (e) { }

  // Extract Duration
  let duration = 'Pending';
  try {
    const vid = document.querySelector('video');
    if (vid && vid.duration) {
      const mins = Math.floor(vid.duration / 60);
      const secs = Math.floor(vid.duration % 60);
      duration = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  } catch (e) { }

  showPlayerStatus('Data ready. Opening ChatGPT...');

  // Signal Orchestrator
  chrome.runtime.sendMessage({
    action: 'VIDEO_READY',
    videoTitle: videoTitle,
    transcript: transcript,
    views: viewCount,
    duration: duration,
    thumbnailUrl: thumbnailUrl || ''
  });

  // Fade out the pill after data is sent
  setTimeout(hidePlayerStatus, 1500);

  // Restore UI after a delay
  setTimeout(() => {
    if (sidebar) sidebar.style.opacity = '1';
    if (comments) comments.style.opacity = '1';
  }, 2000);
}

const urlParams = new URLSearchParams(window.location.search);

if (urlParams.get('analyze_scene') === 'true') {
  console.log('YT-to-AI: Scene Analyzer Mode Detected. Initializing stabilization...');

  (async () => {
    // 🛡️ Stabilization Delay: Ensure YouTube's SPA transition is solid
    showPlayerStatus('👁️ Scene Analyzer: Stabilizing Environment...');
    await new Promise(r => setTimeout(r, 2000));

    const sessionId = urlParams.get('sessionId');
    let video = await waitForVideo();

    if (!video) {
      showPlayerStatus('❌ Error: Could not find video player.');
      return;
    }

    // 🛡️ Ad Detection: Pause if ad is playing
    if (isAdPlaying()) {
      showPlayerStatus('👁️ Waiting for Ad to Finish/Skip...');
      while (isAdPlaying()) {
        await new Promise(r => setTimeout(r, 1000));
      }
      showPlayerStatus('👁️ Ad Cleared. Stabilizing again...');
      await new Promise(r => setTimeout(r, 2000));
      video = await waitForVideo(); // Re-grab video just in case
    }

    // Mute and pause immediately to control state
    video.muted = true;
    video.pause();

    showPlayerStatus('👁️ Scene Analyzer: Waiting for Video Metadata...');

    // Ensure metadata is loaded for duration
    let metadataWaitCount = 0;
    while (isNaN(video.duration) || video.duration <= 0) {
      metadataWaitCount++;
      if (metadataWaitCount > 30) { // 15 seconds max
        showPlayerStatus('❌ Error: Video metadata timeout.');
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    const duration = video.duration;
    const timestamps = [duration * 0.15, duration * 0.35, duration * 0.55, duration * 0.75, duration * 0.9];
    const frames = [];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < timestamps.length; i++) {
      try {
        showPlayerStatus(`👁️ Scene Analyzer: Snapping Frame ${i + 1}/${timestamps.length}...`);

        video.currentTime = timestamps[i];

        // Wait for the player to finish rendering the seeked frame
        await new Promise(r => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            r();
          };
          video.addEventListener('seeked', onSeeked);
          setTimeout(r, 3000); // 3s max per frame seek
        });

        // Small visual buffer for rendering
        await new Promise(r => setTimeout(r, 500));

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.85));
      } catch (frameErr) {
        console.warn(`Frame ${i} snap failed, skipping...`, frameErr);
      }
    }

    if (frames.length === 0) {
      showPlayerStatus('❌ Error: Failed to capture any frames.');
      return;
    }

    showPlayerStatus(`🚀 ${frames.length} Frames Captured! Sending to Server...`);

    try {
      const res = await fetch(`http://127.0.0.1:3005/api/session/${sessionId}/scene-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames })
      });
      const data = await res.json();

      if (data.success) {
        showPlayerStatus('✅ Upload Complete. Handing over to Gemini..');
        await chrome.storage.local.set({ sceneFramesBlobReady: true });
        const GEMINI_URL = 'https://gemini.google.com/notebook/notebooks%2Fe2cdd09a-3e98-4aa1-8095-26f96675bd12';
        setTimeout(() => {
          window.location.href = `${GEMINI_URL}?scene_analyze=true&sessionId=${sessionId}`;
        }, 1200);
      } else {
        showPlayerStatus('❌ Server Failed to Save Frames');
      }
    } catch (e) {
      console.error(e);
      showPlayerStatus('❌ API Connection Error. Check Server.');
    }
  })();
} else {
  // Only trigger harvest if background explicitly requested it (one-time flag)
  chrome.storage.local.get(['harvestNow', 'harvestVideoId'], async (data) => {
    const currentVideoId = new URLSearchParams(window.location.search).get('v');

    if (data.harvestNow && data.harvestVideoId === currentVideoId) {
      // Clear the flag immediately so refresh won't re-trigger
      await chrome.storage.local.remove(['harvestNow', 'harvestVideoId']);
      console.log('YT-to-AI: [Player] Harvest triggered for:', currentVideoId);

      try {
        const video = await waitForVideo();
        console.log('YT-to-AI: [Player] Video element found:', !!video);

        let harvestComplete = false;
        const forceSilence = () => { if (video && !harvestComplete) { video.muted = true; video.pause(); } };
        const playLock = () => { if (!harvestComplete && video) { video.pause(); video.muted = true; } };

        if (video) {
          video.addEventListener('play', playLock);
          video.addEventListener('playing', playLock);
          forceSilence();
        }

        const waitForMetadata = () => new Promise(resolve => {
          if (video && video.readyState >= 1) return resolve();
          if (!video) return resolve();
          const onLoaded = () => { video.removeEventListener('loadedmetadata', onLoaded); resolve(); };
          video.addEventListener('loadedmetadata', onLoaded);
          setTimeout(resolve, 8000);
        });
        await waitForMetadata();
        console.log('YT-to-AI: [Player] Metadata ready. Waiting for UI...');
        await new Promise(r => setTimeout(r, 1500));

        console.log('YT-to-AI: [Player] Starting harvestVideoInfo...');
        await harvestVideoInfo();
        harvestComplete = true;
        if (video) {
          video.removeEventListener('play', playLock);
          video.removeEventListener('playing', playLock);
          video.muted = false;
          console.log('YT-to-AI: [Player] Harvest complete. Player unlocked.');
        }

      } catch (harvestErr) {
        console.error('YT-to-AI: [Player] FATAL harvest error:', harvestErr.message, harvestErr.stack);
        showPlayerStatus('❌ Harvest failed — sending error signal');
        // Signal VIDEO_READY with error data so the flow doesn't get permanently stuck
        chrome.runtime.sendMessage({
          action: 'VIDEO_READY',
          videoTitle: document.title.split(' - YouTube')[0] || 'Unknown',
          transcript: '[HARVEST ERROR: ' + harvestErr.message + ']',
          views: 'Error',
          duration: 'Error'
        });
      }
    } else {
      const isNiche = urlParams.get('capture_niche') === 'true';
      const isScene = urlParams.get('analyze_scene') === 'true';
      if (isNiche) {
        showPlayerStatus('🔍 Locating Channel for Niche Analysis...');
      } else if (!isScene) {
        console.log('YT-to-AI: [Player] Idle (Not in sequential mode).');
      }
    }
  });
}
