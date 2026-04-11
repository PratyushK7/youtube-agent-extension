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

async function harvestVideoInfo() {
  const data = await chrome.storage.local.get(['currentIndex']);
  const stepNum = (data.currentIndex || 0) + 1;
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;

  console.log(`YT-to-AI: Harvesting Video Player Data (Step ${stepNum}/5)...`);
  
  // Extract Title
  const videoTitle = document.querySelector('h1.style-scope.ytd-watch-metadata')?.innerText || document.title.split(' - YouTube')[0];
  showPlayerStatus(`📦 Harvesting Step ${stepNum}/5: ${videoTitle}`);

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
  showPlayerStatus('⛓ Bypassing Sandbox for Transcript...');
  let transcript = 'No transcript available.';
  
  try {
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'GET_TRANSCRIPT', videoId }, resolve);
    });
    if (response && response.success) {
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
  setTimeout(() => {
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
  }, 1000);
}

// Only trigger if we are in a Sequential Analysis flow
chrome.storage.local.get(['isSequential'], (data) => {
  if (data.isSequential) {
     console.log('YT-to-AI: Sequential Harvest Mode Active.');
     // TEMPORARY SILENCER: Only active during harvest
     const forcePause = () => {
       const video = document.querySelector('video');
       if (video) {
         video.muted = true;
         video.pause();
       }
     };

     const playLock = (e) => {
       e.target.pause();
     };

     const video = document.querySelector('video');
     if (video) {
       video.addEventListener('play', playLock);
       forcePause();
     }

     // Trigger Harvest
     setTimeout(async () => {
       await harvestVideoInfo();
       // RELEASE THE PLAYER: Let the user watch if they want after harvest
       if (video) {
         video.removeEventListener('play', playLock);
         video.muted = false; 
         console.log('YT-to-AI: Player Restrictions Released.');
       }
     }, 3500);
  }
});
