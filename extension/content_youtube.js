// content_youtube.js

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showStatusHUD(text) {
  let hud = document.getElementById('yt-ai-status-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'yt-ai-status-hud';
    hud.innerHTML = '<div class="hud-pulse"></div><span id="yt-ai-status-text"></span>';
    document.body.appendChild(hud);
  }
  document.getElementById('yt-ai-status-text').innerText = text;
  hud.style.opacity = '1';
  hud.style.display = 'flex';
}

function hideStatusHUD() {
  const hud = document.getElementById('yt-ai-status-hud');
  if (hud) {
    hud.style.opacity = '0';
    setTimeout(() => { if (hud) hud.remove(); }, 500);
  }
}

async function navigateToSort(sortText) {
  const cleanSort = sortText.toLowerCase();
  showStatusHUD(`Sorting by: ${sortText.toUpperCase()}`);
  
  for (let i = 0; i < 15; i++) { // Increased retries for slower loads
    const allButtons = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"]'));
    
    const targetBtn = allButtons.find(btn => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = btn.textContent.trim().toLowerCase();
      return label.includes(cleanSort) || text === cleanSort;
    });

    if (targetBtn) {
      // Modern YouTube uses aria-selected="true" for the active sort
      const isSelected = targetBtn.getAttribute('aria-selected') === 'true' || 
                         targetBtn.classList.contains('selected') ||
                         targetBtn.hasAttribute('selected');
      
      if (isSelected) {
        console.log(`YT-to-AI: ${sortText} already selected.`);
        return true;
      }
      
      console.log(`YT-to-AI: Clicking sort button: ${sortText}`);
      targetBtn.click();
      
      // Give the grid time to begin updating
      await delay(2500); 
      return true;
    }

    await delay(1000); 
  }
  
  // URL Fallback Strategy (Advanced)
  const sortParam = cleanSort === 'popular' ? 'p' : 'dd';
  const url = new URL(window.location.href);
  if (url.searchParams.get('sort') !== sortParam) {
    url.searchParams.set('view', '0');
    url.searchParams.set('sort', sortParam);
    url.searchParams.set('flow', 'grid');
    showStatusHUD(`Syncing via URL: ${sortParam}`);
    window.location.href = url.toString();
    return new Promise(() => {}); // Stop execution for redirect
  }
  
  return false;
}

function scrapeVideoData(maxCount = 5) {
  const links = Array.from(document.querySelectorAll('a#video-title-link, a#video-title'));
  return links
    .filter(a => a.getAttribute('href')?.includes('/watch'))
    .slice(0, maxCount)
    .map(a => {
      const href = a.getAttribute('href').split('&')[0];
      const url = `https://www.youtube.com${href}`;
      const id = new URLSearchParams(href.split('?')[1] || '').get('v');
      return { url, id };
    })
    .filter(v => v.id);
}

function injectAnalyzerButton() {
  const isChannel = window.location.pathname.match(/\/(?:@|channel\/|c\/)([^\/]+)/);
  const isWatch = window.location.pathname.includes('/watch');
  
  if (!isChannel && !isWatch) return;
  if (document.getElementById('yt-ai-analyzer-container')) return;

  const container = document.createElement('div');
  container.id = 'yt-ai-analyzer-container';
  container.className = 'yt-ai-analyzer-container premium-suite';

  // --- Scan Depth Selector ---
  const depthRow = document.createElement('div');
  depthRow.className = 'hud-depth-row';
  depthRow.innerHTML = `
    <label>Scan Depth:</label>
    <select id="yt-depth-dropdown">
      ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${n===5 ? 'selected' : ''}>${n} Videos</option>`).join('')}
    </select>
  `;

  // --- Main Analyze Button ---
  const btnAnalyze = document.createElement('button');
  btnAnalyze.className = 'yt-ai-analyzer-btn sequential';
  btnAnalyze.innerHTML = `<span class="icon">🔍</span> Analyze Channel`;
  
  btnAnalyze.onclick = async () => {
    btnAnalyze.disabled = true;
    const depth = parseInt(document.getElementById('yt-depth-dropdown').value);
    showStatusHUD(`Scanning channel (${depth} videos)...`);

    if (isWatch) {
      const channelLink = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
      const url = channelLink ? channelLink.href : null;
      if (url) {
        chrome.storage.local.set({ autoStartSeq: true, autoStartSeqTime: Date.now(), selectedDepth: depth }, () => {
          window.location.href = url.endsWith('/videos') ? url : `${url}/videos`;
        });
        return;
      }
    }
    
    if (window.location.pathname.includes('/videos')) {
       await navigateToSort('popular');
       // Poll for video grid to render after sort (up to 15s)
       let queueData = [];
       for (let attempt = 0; attempt < 10; attempt++) {
         await delay(1500);
         queueData = scrapeVideoData(depth);
         if (queueData.length >= depth) break;
         showStatusHUD(`Waiting for video grid... (${queueData.length}/${depth} found)`);
       }
       if (queueData.length === 0) {
         showStatusHUD('⚠ No videos found. Try scrolling down first.');
         btnAnalyze.disabled = false;
         return;
       }
       const queue = queueData.map(v => v.id);
       
       // Get channel name — try page elements first, then clean document.title
       const channelEl = document.querySelector(
         '#channel-name #text, yt-formatted-string.ytd-channel-name, #channel-header-container #text, ytd-channel-name yt-formatted-string'
       );
       let channelName = channelEl?.textContent?.trim() || '';
       if (!channelName) {
         channelName = document.title.split('- YouTube')[0].trim();
       }
       // Always strip (1), (2) prefixes and - Videos/Home suffixes
       channelName = channelName.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*(Videos|Home|Shorts|Live|Playlists|Community)\s*$/i, '').trim();
       
       // Check if channel was already analyzed
       let shouldProceed = true;
       try {
         const checkRes = await fetch(`http://127.0.0.1:3005/api/sessions`);
         const sessions = await checkRes.json();
         const existing = sessions.find(s => s.channel === channelName);
         if (existing && existing.analyzedVideos > 0) {
           shouldProceed = confirm(`"${channelName}" already has ${existing.analyzedVideos} video(s) analyzed. Re-analyze?`);
           if (!shouldProceed) {
             btnAnalyze.disabled = false;
             showStatusHUD('Cancelled.');
             return;
           }
         }
       } catch (e) { /* server offline, proceed anyway */ }
       
       chrome.runtime.sendMessage({
         action: 'START_SEQUENTIAL',
         channelName: channelName,
         queue: queue
       }, (res) => {
         if (res?.success) {
           showStatusHUD(`Analyzing ${queue.length} videos...`);
           setTimeout(hideStatusHUD, 1500);
         }
       });
    } else {
       // Navigate to videos first
       chrome.storage.local.set({ autoStartSeq: true, autoStartSeqTime: Date.now(), selectedDepth: depth }, () => {
          const currentUrl = window.location.href.replace(/\/$/, '');
          window.location.href = currentUrl.includes('/videos') ? currentUrl : `${currentUrl}/videos`;
       });
    }
  };

  container.appendChild(depthRow);
  container.appendChild(btnAnalyze);
  document.body.appendChild(container);

  // Auto-Start Hook — only if flag was set recently (within 10 sec, not stale from refresh)
  chrome.storage.local.get(['autoStartSeq', 'autoStartSeqTime', 'selectedDepth'], (data) => {
    const isRecent = data.autoStartSeqTime && (Date.now() - data.autoStartSeqTime < 10000);
    if (data.autoStartSeq && isRecent && isChannel && window.location.pathname.includes('/videos')) {
      chrome.storage.local.remove(['autoStartSeq', 'autoStartSeqTime']);
      if (data.selectedDepth) document.getElementById('yt-depth-dropdown').value = data.selectedDepth;
      btnAnalyze.click();
    } else if (data.autoStartSeq) {
      // Stale flag — clear it
      chrome.storage.local.remove(['autoStartSeq', 'autoStartSeqTime']);
    }
  });
}

// Inject button on page changes using MutationObserver (avoids high-CPU polling)
{
  let injectionScheduled = false;
  const scheduleInjection = () => {
    if (injectionScheduled) return;
    injectionScheduled = true;
    requestAnimationFrame(() => {
      injectAnalyzerButton();
      injectionScheduled = false;
    });
  };
  // Initial injection
  scheduleInjection();
  // Watch for YouTube SPA navigations
  const navObserver = new MutationObserver(scheduleInjection);
  navObserver.observe(document.body, { childList: true, subtree: true });
}

// Auto-navigate to first search result if requested by Dashboard
{
  const searchUrlParams = new URLSearchParams(window.location.search);
  if (window.location.pathname === '/results' && searchUrlParams.get('analyze_scene') === 'true') {
    showStatusHUD('🔍 Finding video...');
    
    function navigateToVideo(firstVideo) {
      if (window.hasNavigated) return;
      window.hasNavigated = true;
      let targetHref = firstVideo.href;
      targetHref += targetHref.includes('?') ? '&' : '?';
      targetHref += `analyze_scene=true&sessionId=${searchUrlParams.get('sessionId')}`;
      
      // Inject to native DOM just in case the user clicks it manually
      firstVideo.href = targetHref;
      
      setTimeout(() => {
        showStatusHUD('🚀 Redirecting to Player...');
        window.location.href = targetHref;
        // Hard fallback if SPA blocks it
        setTimeout(() => { window.location.assign(targetHref); }, 500);
      }, 800);
    }

    const observer = new MutationObserver(() => {
      const firstVideo = document.querySelector('ytd-video-renderer a#thumbnail, ytd-video-renderer a#video-title');
      if (firstVideo && firstVideo.href && firstVideo.href.includes('/watch')) {
        observer.disconnect();
        navigateToVideo(firstVideo);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback timeout — only fires if observer hasn't already navigated
    setTimeout(() => {
      if (window.hasNavigated) return;
      observer.disconnect();
      const firstVideo = document.querySelector('ytd-video-renderer a#thumbnail, ytd-video-renderer a#video-title');
      if (firstVideo && firstVideo.href && firstVideo.href.includes('/watch')) {
        navigateToVideo(firstVideo);
      }
    }, 5000);
  }
}
