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
  
  // Extract Views
  let viewCount = 'Pending';
  try {
    viewCount = document.querySelector('ytd-watch-metadata #description-inner #info span:first-child')?.innerText 
              || document.querySelector('.view-count')?.innerText 
              || 'Pending';
  } catch(e) {}

  // Extract Duration
  let duration = 'Pending';
  try {
    const vid = document.querySelector('video');
    if (vid && vid.duration) {
      const mins = Math.floor(vid.duration / 60);
      const secs = Math.floor(vid.duration % 60);
      duration = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  } catch(e) {}

  showPlayerStatus('✅ Data Ready. Sending to AI Brain...');
  
  // Signal Orchestrator
  chrome.runtime.sendMessage({
    action: 'VIDEO_READY',
    videoTitle: videoTitle,
    transcript: transcript,
    views: viewCount,
    duration: duration
  });

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
    while(isNaN(video.duration) || video.duration <= 0) {
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
        showPlayerStatus(`👁️ Scene Analyzer: Snapping Frame ${i+1}/${timestamps.length}...`);
        
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
        showPlayerStatus('✅ Upload Complete. Transferring to AI Brain...');
        await chrome.storage.local.set({ sceneFramesBlobReady: true });
        setTimeout(() => {
          window.location.href = `https://gemini.google.com/app?scene_analyze=true&sessionId=${sessionId}`;
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
