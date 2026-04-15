// content_youtube.js

// --- Global Signal Handler ---
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'GLOBAL_STOP') {
    hideStatusHUD();
    
    // Remove analyzer button container too
    const container = document.getElementById('yt-ai-analyzer-container');
    if (container) container.remove();

    console.log('YT-to-AI: Global Stop received.');
    // If we're in the middle of sequential navigation, force-reload to kill loops
    chrome.storage.local.get(['isSequential'], (data) => {
      if (data && data.isSequential) window.location.reload();
    });
  }
});

// Periodic check for orphaned scripts (context invalidated on extension reload)
// This ensures that if the user reloads the extension, the "old" HUD disappears.
setInterval(() => {
  try {
    // This will throw if the extension context has been invalidated
    chrome.runtime.id;
  } catch (e) {
    // If we reach here, this script is orphaned. Clean up UI.
    const hud = document.getElementById('yt-ai-status-hud');
    if (hud) hud.remove();
    const container = document.getElementById('yt-ai-analyzer-container');
    if (container) container.remove();
  }
}, 2000);

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showStatusHUD(text) {
  let hud = document.getElementById('yt-ai-status-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'yt-ai-status-hud';
    hud.innerHTML = `
      <div class="hud-pulse"></div>
      <span id="yt-ai-status-text"></span>
      <button id="yt-ai-hud-cancel" title="Stop Analysis">×</button>
    `;
    document.body.appendChild(hud);
    
    document.getElementById('yt-ai-hud-cancel').onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'STOP_EXECUTION' });
      hideStatusHUD();
    };
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
  const targetVariations = [
    cleanSort, "most popular", "popular videos", "más populares", 
    "populares", "beliebte videos", "plus populaires", "लोकप्रिय", "popularny"
  ];

  for (let i = 0; i < 40; i++) { 
    const bar = document.querySelector('ytd-feed-filter-chip-bar-renderer, #chips, #header tp-yt-paper-tabs');
    if (!bar && i < 15) { await delay(600); continue; }

    const elements = Array.from(document.querySelectorAll(selectors.join(',')));
    let targetEl = elements.find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const text = el.textContent.trim().toLowerCase();
      return targetVariations.some(v => label === v || text === v || label.includes(v) || (text.includes(v) && text.length < 25));
    });

    if (!targetEl && i > 15 && cleanSort === 'popular') {
       const chips = Array.from(document.querySelectorAll('yt-chip-cloud-chip-renderer'));
       if (chips.length >= 2) targetEl = chips[1];
    }

    if (targetEl) {
      const interactive = targetEl.closest('yt-chip-cloud-chip-renderer, tp-yt-paper-tab, [role="tab"]') || targetEl;
      const checkActive = () => (
        interactive.getAttribute('aria-selected') === 'true' || 
        interactive.hasAttribute('selected') ||
        interactive.classList.contains('iron-selected') ||
        interactive.classList.contains('selected') ||
        interactive.querySelector('[aria-selected="true"]') !== null
      );

      if (checkActive()) return true;
      
      interactive.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      await delay(500); 
      interactive.click();
      const inner = interactive.querySelector('yt-formatted-string, span, .tab-content');
      if (inner) inner.click();
      
      for (let j = 0; j < 12; j++) {
        await delay(1000);
        if (checkActive()) return true;
        if (j % 4 === 0) {
          interactive.click();
        }
      }
    }
    await delay(1000); 
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

  const depthRow = document.createElement('div');
  depthRow.className = 'hud-depth-row';
  depthRow.innerHTML = `
    <label>Scan Depth:</label>
    <select id="yt-depth-dropdown">
      ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${n===5 ? 'selected' : ''}>${n} Videos</option>`).join('')}
    </select>
  `;

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
        await delay(3500);

        const channelBaseUrl = window.location.href.split('/videos')[0];
        const channelEl = document.querySelector(
          '#channel-name #text, yt-formatted-string.ytd-channel-name, #channel-header-container #text, ytd-channel-name yt-formatted-string'
        );
        let channelName = channelEl?.textContent?.trim() || '';
        if (!channelName) {
          channelName = document.title.split('- YouTube')[0].trim();
        }
        channelName = channelName.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*(Videos|Home|Shorts|Live|Playlists|Community)\s*$/i, '').trim();

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
          showStatusHUD('Capturing Full Strategic View...');
          const originalZoom = document.body.style.zoom || "1";
          document.body.style.zoom = "0.4";
          await delay(1500);

          const capRes = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'CAPTURE_YOUTUBE_OVERVIEW', sessionId: currentSessionId }, resolve);
          });
          
          document.body.style.zoom = originalZoom;
          
          if (capRes && capRes.success) {
            showStatusHUD('Full Overview Captured ✓');
            await delay(1000);
          } else {
            showStatusHUD(`❌ Capture Error.`);
            btnAnalyze.disabled = false;
            return;
          }
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

// Handler for watch page
{
  const params = new URLSearchParams(window.location.search);
  const captureNiche = params.get('capture_niche') === 'true';
  const sessionId = params.get('sessionId');
  
  if (captureNiche && sessionId && window.location.pathname.includes('/watch')) {
    (async () => {
        showStatusHUD('🔍 Locating Channel...');
        for (let i = 0; i < 25; i++) {
          const ownerLink = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint')
            || document.querySelector('#owner #channel-name a');
          if (ownerLink && ownerLink.href) {
            const baseUrl = ownerLink.href.split('?')[0].split('#')[0].replace(/\/videos$/, '').replace(/\/$/, '');
            window.location.href = `${baseUrl}?capture_niche=true&sessionId=${sessionId}`;
            return;
          }
          await delay(800);
        }
    })();
  }
}

// manual Niche Bending triggers
{
  const params = new URLSearchParams(window.location.search);
  const captureNiche = params.get('capture_niche') === 'true';
  const sessionId = params.get('sessionId');
  
  const isAtChannel = window.location.pathname.match(/\/(?:@|channel\/|c\/|user\/)([^\/]+)/) || window.location.pathname.length > 5;
  if (captureNiche && sessionId && isAtChannel) {
    (async () => {
       await delay(2000);
       showStatusHUD('Capturing Full Strategic View...');
       const originalZoom = document.body.style.zoom || "1";
       document.body.style.zoom = "0.4";
       await delay(2000);
       
       chrome.runtime.sendMessage({ action: 'CAPTURE_YOUTUBE_OVERVIEW', sessionId: sessionId }, (res) => {
         document.body.style.zoom = originalZoom;
         if (res && res.success) {
            showStatusHUD('Full Overview Captured ✓');
            setTimeout(() => {
              window.location.href = `https://chatgpt.com/g/g-p-69ddde8c65a88191b308076bcb28bebf-channellens/project?niche_bend=true&sessionId=${sessionId}`;
            }, 2000);
         }
       });
    })();
  }
}
