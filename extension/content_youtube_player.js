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

// Only trigger if we are in a Sequential Analysis flow
chrome.storage.local.get(['isSequential'], async (data) => {
  if (data.isSequential) {
     console.log('YT-to-AI: Sequential Harvest Mode Active.');
     
     // Wait for video element (YouTube SPA may load it late)
     const video = await waitForVideo();
     
     // MUTE-LOCK: Automatic muting + pause (Req 2.4)
     let harvestComplete = false;
     
     const forceSilence = () => {
       if (video && !harvestComplete) {
         video.muted = true;
         video.pause();
       }
     };

     // ANTI-PLAY SHIELD: Persistent listener prevents auto-resume during harvest
     const playLock = () => {
       if (!harvestComplete && video) {
         video.pause();
         video.muted = true;
       }
     };

     if (video) {
       video.addEventListener('play', playLock);
       video.addEventListener('playing', playLock);
       forceSilence();
     }

     // Trigger Harvest after page settles
     setTimeout(async () => {
       await harvestVideoInfo();
       
       // RELEASE THE PLAYER after harvest
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
