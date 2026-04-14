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
  
  const selectors = [
    'yt-chip-cloud-chip-renderer',
    'tp-yt-paper-tab',
    'ytd-feed-filter-chip-bar-renderer',
    '#chips #text',
    'button',
    '[role="tab"]'
  ];

  // Variations for "Popular" in common languages and formats
  const targetVariations = [
    cleanSort, "most popular", "popular videos", "más populares", 
    "populares", "vidi plus", "beliebte videos", "plus populaires", "लोकप्रिय", "popularny"
  ];

  for (let i = 0; i < 45; i++) { 
    // Wait for the actual chip bar to be in the DOM
    const chipBar = document.querySelector('yt-chip-cloud-chip-renderer, #chips, ytd-feed-filter-chip-bar-renderer');
    if (!chipBar && i < 15) {
      await delay(800);
      continue;
    }

    const elements = Array.from(document.querySelectorAll(selectors.join(',')));
    
    // 1. Precise Text/Label Match
    let targetEl = elements.find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const text = el.textContent.trim().toLowerCase();
      return targetVariations.some(v => label === v || text === v || label.includes(v) || (text.includes(v) && text.length < 22));
    });

    // 2. Position-Based Fail-safe (Popular is usually the 2nd chip)
    if (!targetEl && i > 12 && cleanSort === 'popular') {
       const chips = Array.from(document.querySelectorAll('yt-chip-cloud-chip-renderer'));
       if (chips.length >= 2) targetEl = chips[1];
    }

    if (targetEl) {
      const interactive = targetEl.closest('yt-chip-cloud-chip-renderer') || 
                          targetEl.closest('tp-yt-paper-tab') || 
                          targetEl;

      const isSelected = interactive.getAttribute('aria-selected') === 'true' || 
                         interactive.hasAttribute('selected') ||
                         interactive.classList.contains('iron-selected') ||
                         interactive.classList.contains('selected');
      
      if (isSelected) {
        console.log(`YT-to-AI: ${sortText} is already active.`);
        return true;
      }
      
      console.log(`YT-to-AI: Engaged sort: ${sortText}`);
      interactive.scrollIntoView({ block: 'center' });
      await delay(800); // Stabilize
      
      // Precision Interaction
      interactive.click();
      interactive.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      interactive.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      
      // Multi-Step Verification
      for (let j = 0; j < 15; j++) {
        await delay(800);
        const confirmed = interactive.getAttribute('aria-selected') === 'true' || 
                          interactive.hasAttribute('selected') || 
                          interactive.classList.contains('iron-selected') ||
                          interactive.classList.contains('selected');
        if (confirmed) {
           console.log(`YT-to-AI: ${sortText} confirmed active.`);
           return true; 
        }
        if (j % 5 === 0) interactive.click(); // Persistent re-click
      }
    }

    await delay(1000); 
  }
  
  console.error(`YT-to-AI: FAILED to sort by ${sortText}. Proceeding anyway...`);
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
        await delay(3500); // Give grid time to settle after sort

        const channelBaseUrl = window.location.href.split('/videos')[0];
        
        // --- Channel Info Extraction ---
        const channelEl = document.querySelector(
          '#channel-name #text, yt-formatted-string.ytd-channel-name, #channel-header-container #text, ytd-channel-name yt-formatted-string'
        );
        let channelName = channelEl?.textContent?.trim() || '';
        if (!channelName) {
          channelName = document.title.split('- YouTube')[0].trim();
        }
        channelName = channelName.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*(Videos|Home|Shorts|Live|Playlists|Community)\s*$/i, '').trim();

        // Create session FIRST
        let currentSessionId = null;
        try {
          const createRes = await fetch(`http://127.0.0.1:3005/api/session/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: channelName,
              totalVideos: depth,
              promptUsed: 'sequential_chatgpt'
            })
          });
          const createData = await createRes.json();
          if (createData.success) {
            currentSessionId = createData.session.id;
            await fetch(`http://127.0.0.1:3005/api/session/${currentSessionId}/metadata`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelUrl: channelBaseUrl })
            });
          }
        } catch (e) { console.error('Early session creation failed', e); }

        if (currentSessionId) {
          showStatusHUD('Capturing Popular Overview...');
          await chrome.runtime.sendMessage({ action: 'CAPTURE_YOUTUBE_OVERVIEW', sessionId: currentSessionId });
          showStatusHUD('Overview Captured ✓');
          await delay(1000);
        }

        let queueData = [];
        for (let attempt = 0; attempt < 12; attempt++) {
          await delay(1500);
          queueData = scrapeVideoData(depth);
          if (queueData.length >= depth) break;
          showStatusHUD(`Waiting for video grid... (${queueData.length}/${depth} found)`);
        }
        
       if (queueData.length === 0) {
         showStatusHUD('⚠ No videos found.');
         btnAnalyze.disabled = false;
         return;
       }
       const queue = queueData.map(v => v.id);
       
       chrome.runtime.sendMessage({
         action: 'START_SEQUENTIAL',
         channelName: channelName,
         queue: queue,
         sessionId: currentSessionId
       }, (res) => {
         if (res?.success) {
           showStatusHUD(`Analyzing ${queue.length} videos...`);
           setTimeout(hideStatusHUD, 1500);
         }
       });
    } else {
       chrome.storage.local.set({ autoStartSeq: true, autoStartSeqTime: Date.now(), selectedDepth: depth }, () => {
          const currentUrl = window.location.href.replace(/\/$/, '');
          window.location.href = currentUrl.includes('/videos') ? currentUrl : `${currentUrl}/videos`;
       });
    }
  };

  container.appendChild(depthRow);
  container.appendChild(btnAnalyze);
  document.body.appendChild(container);

  chrome.storage.local.get(['autoStartSeq', 'autoStartSeqTime', 'selectedDepth'], (data) => {
    const isRecent = data.autoStartSeqTime && (Date.now() - data.autoStartSeqTime < 10000);
    if (data.autoStartSeq && isRecent && isChannel && window.location.pathname.includes('/videos')) {
      chrome.storage.local.remove(['autoStartSeq', 'autoStartSeqTime']);
      if (data.selectedDepth) document.getElementById('yt-depth-dropdown').value = data.selectedDepth;
      btnAnalyze.click();
    }
  });
}

// Inject button on page changes
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
  scheduleInjection();
  const navObserver = new MutationObserver(scheduleInjection);
  navObserver.observe(document.body, { childList: true, subtree: true });
}

// Handler for watch page (capture_niche from video fallback)
{
  const params = new URLSearchParams(window.location.search);
  const captureNiche = params.get('capture_niche') === 'true';
  const sessionId = params.get('sessionId');
  
  if (captureNiche && sessionId && window.location.pathname.includes('/watch')) {
    (async () => {
       showStatusHUD('🔍 Locating Channel...');
       for (let i = 0; i < 25; i++) {
         const channelLink = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint, #owner #channel-name a');
         if (channelLink && channelLink.href) {
           const baseUrl = channelLink.href.replace(/\/videos$/, '').replace(/\/$/, '');
           const target = `${baseUrl}/videos?capture_niche=true&sessionId=${sessionId}`;
           window.location.href = target;
           return;
         }
         await delay(800);
       }
       showStatusHUD('⚠ Channel not found.');
    })();
  }
}

// specialized handler for Dashboard manual Niche Bending triggers
{
  const params = new URLSearchParams(window.location.search);
  const captureNiche = params.get('capture_niche') === 'true';
  const sessionId = params.get('sessionId');
  
  if (captureNiche && sessionId && window.location.pathname.includes('/videos')) {
    (async () => {
       await delay(2500); // Wait for SPA stabilization
       showStatusHUD('Fresh Context Capture...');
       await navigateToSort('popular');
       await delay(5000); // Final check stabilization
       
       await chrome.runtime.sendMessage({ action: 'CAPTURE_YOUTUBE_OVERVIEW', sessionId: sessionId });

       showStatusHUD('Handing off to ChatGPT...');
       await delay(2000);
       const CHATGPT_URL = 'https://chatgpt.com/g/g-p-69ddde8c65a88191b308076bcb28bebf-channellens/project';
       window.location.href = `${CHATGPT_URL}?niche_bend=true&sessionId=${sessionId}`;
    })();
  }
}

// Handler for search results page (capture_niche fallback)
{
  const params = new URLSearchParams(window.location.search);
  const captureNiche = params.get('capture_niche') === 'true';
  const sessionId = params.get('sessionId');
  
  if (captureNiche && sessionId && window.location.pathname === '/results') {
    const observer = new MutationObserver(() => {
      // Look for a channel link in the search results
      const channelLink = document.querySelector('ytd-channel-renderer a#main-link, ytd-video-renderer a.ytd-channel-name');
      if (channelLink && channelLink.href) {
        observer.disconnect();
        const baseUrl = channelLink.href.replace(/\/videos$/, '').replace(/\/$/, '');
        const target = `${baseUrl}/videos?capture_niche=true&sessionId=${sessionId}`;
        showStatusHUD('Channel Found. Entering Videos...');
        window.location.href = target;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }
}
