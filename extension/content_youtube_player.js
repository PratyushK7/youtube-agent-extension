// Minimal HUD for the player page
function showPlayerStatus(text) {
  let hud = document.getElementById('yt-ai-status-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'yt-ai-status-hud';
    hud.setAttribute('role', 'status');
    hud.setAttribute('aria-live', 'polite');
    hud.innerHTML = '<div class="hud-pulse" aria-hidden="true"></div><span id="yt-ai-status-text"></span>';
    document.body.appendChild(hud);
  }
  document.getElementById('yt-ai-status-text').innerText = text;
}

// Wait for video element to appear in DOM (YouTube SPA may not have it immediately)
function waitForVideo(timeout = 8000) {
  return new Promise((resolve) => {
    const existing = document.querySelector('video');
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const vid = document.querySelector('video');
      if (vid) { observer.disconnect(); resolve(vid); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(document.querySelector('video')); }, timeout);
  });
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
  
  showPlayerStatus(`📦 Harvesting Step ${stepNum}/${totalSteps}: ${videoTitle}`);

  // THUMBNAIL: Deep harvest from internal player data (100% accuracy)
  showPlayerStatus('📸 Capturing High-Res Preview...');
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

  // Fetch Transcript via RELAY (Bypass Security)
  showPlayerStatus('⛓ Fetching Transcript...');
  let transcript = '[TRANSCRIPT UNAVAILABLE: Analyze strategic direction based on Title and Screen Capture.]';
  
  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ success: false }), 15000);
      chrome.runtime.sendMessage({ action: 'GET_TRANSCRIPT', videoId }, (res) => {
        clearTimeout(timer);
        resolve(res || { success: false });
      });
    });
    if (response && response.success && response.transcript) {
      transcript = response.transcript;
    }
  } catch (e) {
    console.error('Transcript relay failed:', e);
  }

  showPlayerStatus('📸 Preparing Cinematic Snapshot...');
  
  // Clean UI for the snapshot
  const sidebar = document.querySelector('#secondary');
  const comments = document.querySelector('ytd-comments');
  if (sidebar) sidebar.style.opacity = '0';
  if (comments) comments.style.opacity = '0';
  window.scrollTo(0, 0);

  // Small delay to let the UI settle
  await new Promise(r => setTimeout(r, 1000));
  
  showPlayerStatus('✅ Data Ready. Sending to AI Brain...');
  
  // Signal Orchestrator
  chrome.runtime.sendMessage({
    action: 'VIDEO_READY',
    videoTitle: videoTitle,
    transcript: transcript
  });

  // Restore UI after a delay
  setTimeout(() => {
    if (sidebar) sidebar.style.opacity = '1';
    if (comments) comments.style.opacity = '1';
  }, 2000);
}

const urlParams = new URLSearchParams(window.location.search);

if (urlParams.get('analyze_scene') === 'true') {
  console.log('YT-to-AI: Scene Analyzer Mode Activated.');
  // Execute the multi-modal frame scraping
  (async () => {
    const sessionId = urlParams.get('sessionId');
    const video = await waitForVideo();
    
    // Mute and pause the video immediately
    video.muted = true;
    video.pause();

    showPlayerStatus('👁️ Scene Analyzer: Harvesting Cinematic Frames...');
    
    // Ensure metadata is loaded for duration
    for(let w=0; w<20; w++) {
      if(!isNaN(video.duration) && video.duration > 0) break;
      await new Promise(r => setTimeout(r, 500));
    }


    const duration = video.duration;
    const timestamps = [duration * 0.2, duration * 0.4, duration * 0.6, duration * 0.8, duration * 0.95];
    const frames = [];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < timestamps.length; i++) {
      showPlayerStatus(`👁️ Scene Analyzer: Snapping Frame ${i+1}/5...`);
      
      video.currentTime = timestamps[i];
      // Wait for the player to finish rendering the seeked frame
      await new Promise(r => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); r(); };
        video.addEventListener('seeked', onSeeked);
        // Fallback timeout just in case it stalls
        setTimeout(r, 2000);
      });
      // Small visual buffer
      await new Promise(r => setTimeout(r, 400));

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.85));
    }

    showPlayerStatus('🚀 Frames Captured! Uploading to Server...');

    try {
      const res = await fetch(`http://127.0.0.1:3005/api/session/${sessionId}/scene-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames })
      });
      const data = await res.json();
      
      if (data.success) {
        showPlayerStatus('✅ Upload Complete. Transferring to Nano Banana (Gemini)...');
        await chrome.storage.local.set({ sceneFramesBlobReady: true });
        setTimeout(() => {
          window.location.href = `https://gemini.google.com/app?scene_analyze=true&sessionId=${sessionId}`;
        }, 1000);
      } else {
        showPlayerStatus('❌ Server Failed to Save Frames');
      }
    } catch (e) {
      console.error(e);
      showPlayerStatus('❌ API Connection Error');
    }
  })();
} else {
  // Only trigger if we are in a Sequential Analysis flow
  chrome.storage.local.get(['isSequential'], async (data) => {
    if (data.isSequential) {
       console.log('YT-to-AI: Sequential Harvest Mode Active.');
       
       const video = await waitForVideo();
       
       let harvestComplete = false;
       const forceSilence = () => { if (video && !harvestComplete) { video.muted = true; video.pause(); } };
       const playLock = () => { if (!harvestComplete && video) { video.pause(); video.muted = true; } };

       if (video) {
         video.addEventListener('play', playLock);
         video.addEventListener('playing', playLock);
         forceSilence();
       }

       setTimeout(async () => {
         await harvestVideoInfo();
         harvestComplete = true;
         if (video) {
           video.removeEventListener('play', playLock);
           video.removeEventListener('playing', playLock);
           video.muted = false; 
           console.log('YT-to-AI: Player Restrictions Released.');
         }
       }, 3500);
    }
  });
}
