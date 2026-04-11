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
  
  clearTimeout(window.hudTimeout);
  window.hudTimeout = setTimeout(() => {
    if (hud) hud.remove();
  }, 8000);
}

async function navigateToSort(sortText) {
  const cleanSort = sortText.toLowerCase();
  showStatusHUD(`Sorting by: ${sortText.toUpperCase()}`);
  
  for (let i = 0; i < 8; i++) {
    const chips = Array.from(document.querySelectorAll('yt-chip-cloud-chip-renderer'));
    const allButtons = Array.from(document.querySelectorAll('button, tp-yt-paper-button, yt-formatted-string, span'));
    const target = chips.find(el => el.textContent.trim().toLowerCase().includes(cleanSort)) ||
                   allButtons.find(el => el.textContent.trim().toLowerCase().includes(cleanSort));
    
    if (target) {
      const isSelected = target.hasAttribute('selected') || target.classList.contains('selected');
      if (isSelected) return true;
      const clickable = target.querySelector('button') || target;
      clickable.click();
      await delay(3500); 
      return true;
    }
    await delay(800); 
  }
  
  if (cleanSort === 'popular' || cleanSort === 'latest') {
    const sortParam = cleanSort === 'popular' ? 'p' : 'dd';
    const baseUrl = window.location.origin + window.location.pathname;
    window.location.href = `${baseUrl}?view=0&sort=${sortParam}&flow=grid`;
    await delay(5000);
    return true;
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
    showStatusHUD(`Initializing Strategic Scan (Depth: ${depth})...`);

    if (isWatch) {
      const channelLink = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
      const url = channelLink ? channelLink.href : null;
      if (url) {
        chrome.storage.local.set({ autoStartSeq: true, selectedDepth: depth }, () => {
          window.location.href = url.endsWith('/videos') ? url : `${url}/videos`;
        });
        return;
      }
    }
    
    if (window.location.pathname.includes('/videos')) {
       await navigateToSort('popular');
       // Wait for video grid to re-render after sort
       await delay(3000);
       let queueData = scrapeVideoData(depth);
       // Retry scrape if empty (sort may still be loading)
       if (queueData.length === 0) {
         await delay(3000);
         queueData = scrapeVideoData(depth);
       }
       if (queueData.length === 0) {
         showStatusHUD('⚠ No videos found. Try scrolling down first.');
         btnAnalyze.disabled = false;
         return;
       }
       const queue = queueData.map(v => v.id);
       const data = await chrome.storage.local.get(['activePrompt']);
       
       chrome.runtime.sendMessage({
         action: 'START_SEQUENTIAL',
         channelName: document.title.split('- YouTube')[0].trim(),
         queue: queue,
         prompt: data.activePrompt || ''
       }, (res) => {
         if (res?.success) showStatusHUD(`Launching Analysis for ${queue.length} Videos...`);
       });
    } else {
       // Navigate to videos first
       chrome.storage.local.set({ autoStartSeq: true, selectedDepth: depth }, () => {
          const currentUrl = window.location.href.replace(/\/$/, '');
          window.location.href = currentUrl.includes('/videos') ? currentUrl : `${currentUrl}/videos`;
       });
    }
  };

  container.appendChild(depthRow);
  container.appendChild(btnAnalyze);
  document.body.appendChild(container);

  // Auto-Start Hook
  chrome.storage.local.get(['autoStartSeq', 'selectedDepth'], (data) => {
    if (data.autoStartSeq && isChannel && window.location.pathname.includes('/videos')) {
      chrome.storage.local.remove('autoStartSeq');
      if (data.selectedDepth) document.getElementById('yt-depth-dropdown').value = data.selectedDepth;
      btnAnalyze.click();
    }
  });
}

setInterval(() => {
  injectAnalyzerButton();
}, 2000);
