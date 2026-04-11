/* ═══════════════════════════════════════════════════════════
   YouTube Channel Analyzer — Frontend Logic
   ═══════════════════════════════════════════════════════════ */

// ─── DOM Elements ──────────────────────────────────────────
const analyzeForm = document.getElementById('analyze-form');
const channelInput = document.getElementById('channel-input');
const analyzeBtn = document.getElementById('analyze-btn');

const heroSection = document.getElementById('hero-section');
const progressSection = document.getElementById('progress-section');
const resultsSection = document.getElementById('results-section');

const progressTitle = document.getElementById('progress-title');
const progressSteps = document.getElementById('progress-steps');

const newAnalysisBtn = document.getElementById('new-analysis-btn');

// ─── State ─────────────────────────────────────────────────
let currentChannelData = null;
let currentDetailedVideos = null;
let currentChannelName = '';

// ─── Formatting Helpers ────────────────────────────────────

function formatNumber(num) {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Toast Notification ───────────────────────────────────

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${message}`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ─── Progress ──────────────────────────────────────────────

function addProgressStep(message, status = 'active') {
  const step = document.createElement('div');
  step.className = 'progress-step';
  step.innerHTML = `
    <div class="progress-step-icon ${status}">${status === 'done' ? '✓' : '●'}</div>
    <div class="progress-step-text">${message}</div>
  `;
  progressSteps.appendChild(step);

  const steps = progressSteps.querySelectorAll('.progress-step');
  for (let i = 0; i < steps.length - 1; i++) {
    const icon = steps[i].querySelector('.progress-step-icon');
    icon.className = 'progress-step-icon done';
    icon.textContent = '✓';
  }
  step.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Charts ────────────────────────────────────────────────

function renderViewsChart(viewsTrend) {
  const container = document.getElementById('views-chart');
  if (!viewsTrend || !viewsTrend.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">No data</p>';
    return;
  }

  const width = container.clientWidth;
  const height = 220;
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const cW = width - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;
  const maxV = Math.max(...viewsTrend.map(d => d.views));
  const minV = Math.min(...viewsTrend.map(d => d.views));
  const range = maxV - minV || 1;

  const pts = viewsTrend.map((d, i) => ({
    x: pad.left + (i / (viewsTrend.length - 1 || 1)) * cW,
    y: pad.top + cH - ((d.views - minV) / range) * cH,
    ...d,
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${pts[pts.length - 1].x} ${pad.top + cH} L ${pts[0].x} ${pad.top + cH} Z`;

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: pad.top + cH - t * cH,
    label: formatNumber(Math.round(minV + t * range)),
  }));

  let svg = `<svg width="${width}" height="${height}">`;
  svg += `<defs><linearGradient id="aG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(124,131,255,0.3)"/><stop offset="100%" stop-color="rgba(124,131,255,0)"/></linearGradient></defs>`;

  yLabels.forEach(l => {
    svg += `<line x1="${pad.left}" y1="${l.y}" x2="${width - pad.right}" y2="${l.y}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 4"/>`;
    svg += `<text x="${pad.left - 8}" y="${l.y + 3}" class="chart-label" text-anchor="end">${l.label}</text>`;
  });

  svg += `<path d="${areaD}" fill="url(#aG)"/>`;
  svg += `<path d="${pathD}" class="chart-line" stroke="var(--accent-primary)"/>`;

  pts.forEach(p => {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--accent-primary)" class="chart-dot"
      onmouseenter="showChartTooltip(event,'${p.title.replace(/'/g,"\\'")}','${formatNumber(p.views)} views')"
      onmouseleave="hideChartTooltip()"/>`;
  });

  svg += '</svg><div class="chart-tooltip" id="chart-tooltip"></div>';
  container.innerHTML = svg;
}

function renderDurationChart(duration) {
  const container = document.getElementById('duration-chart');
  if (!duration) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">No data</p>'; return; }

  const total = duration.shorts + duration.medium + duration.long;
  if (!total) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">No data</p>'; return; }

  const size = Math.min(container.clientWidth, 220);
  const cx = size / 2, cy = size / 2;
  const oR = size / 2 - 10, iR = oR * 0.6;

  const segs = [
    { label: 'Shorts', value: duration.shorts, color: '#fb923c' },
    { label: 'Medium', value: duration.medium, color: '#7c83ff' },
    { label: 'Long', value: duration.long, color: '#34d399' },
  ].filter(s => s.value > 0);

  let svg = `<svg width="${size}" height="${size + 50}">`;
  let angle = -Math.PI / 2;

  segs.forEach(seg => {
    const a = (seg.value / total) * 2 * Math.PI;
    const ea = angle + a;
    const la = a > Math.PI ? 1 : 0;
    const d = `M ${cx + oR * Math.cos(angle)} ${cy + oR * Math.sin(angle)} A ${oR} ${oR} 0 ${la} 1 ${cx + oR * Math.cos(ea)} ${cy + oR * Math.sin(ea)} L ${cx + iR * Math.cos(ea)} ${cy + iR * Math.sin(ea)} A ${iR} ${iR} 0 ${la} 0 ${cx + iR * Math.cos(angle)} ${cy + iR * Math.sin(angle)} Z`;
    svg += `<path d="${d}" fill="${seg.color}" opacity="0.85" class="donut-segment"/>`;
    angle = ea;
  });

  svg += `<text x="${cx}" y="${cy - 5}" class="donut-center-value" text-anchor="middle">${total}</text>`;
  svg += `<text x="${cx}" y="${cy + 12}" class="donut-center-label" text-anchor="middle">VIDEOS</text>`;

  const sp = size / (segs.length + 1);
  segs.forEach((seg, i) => {
    const x = sp * (i + 1);
    svg += `<circle cx="${x - 8}" cy="${size + 10}" r="4" fill="${seg.color}"/>`;
    svg += `<text x="${x + 2}" y="${size + 14}" class="donut-label">${seg.label} (${seg.value})</text>`;
  });

  svg += '</svg>';
  container.innerHTML = svg;
}

window.showChartTooltip = function (e, title, value) {
  const t = document.getElementById('chart-tooltip');
  if (!t) return;
  t.innerHTML = `<strong>${value}</strong><br>${title.substring(0, 40)}...`;
  t.style.display = 'block';
  t.style.left = e.offsetX + 10 + 'px';
  t.style.top = e.offsetY - 40 + 'px';
};

window.hideChartTooltip = function () {
  const t = document.getElementById('chart-tooltip');
  if (t) t.style.display = 'none';
};

// ─── Top Videos ───────────────────────────────────────────

function renderTopVideos(topVideos) {
  document.getElementById('top-videos-list').innerHTML = topVideos.map((v, i) => `
    <div class="top-video-item">
      <div class="top-video-rank ${i < 3 ? `rank-${i + 1}` : ''}">${i + 1}</div>
      ${v.thumbnail ? `<img class="top-video-thumb" src="${v.thumbnail}" alt="${v.title}" loading="lazy">` : ''}
      <div class="top-video-info">
        <div class="top-video-title">${v.title}</div>
        <div class="top-video-meta">${formatNumber(v.likes)} likes</div>
      </div>
      <div class="top-video-views">${formatNumber(v.views)}</div>
    </div>
  `).join('');
}

// ─── Hook Type Tag Color ──────────────────────────────────

function hookTagClass(hookType) {
  const t = (hookType || '').toLowerCase();
  if (t.includes('question')) return 'cell-tag-question';
  if (t.includes('bold') || t.includes('statement')) return 'cell-tag-bold';
  if (t.includes('story')) return 'cell-tag-story';
  if (t.includes('challenge') || t.includes('contrarian')) return 'cell-tag-challenge';
  if (t.includes('curiosity') || t.includes('tease')) return 'cell-tag-curiosity';
  return 'cell-tag-default';
}

// ─── Detailed Video Table ─────────────────────────────────

function renderVideoTable(videos) {
  const tbody = document.getElementById('video-table-body');
  const subtitle = document.getElementById('table-subtitle');

  subtitle.textContent = `${videos.length} videos analyzed with AI-powered hook, structure, and retention analysis`;

  tbody.innerHTML = videos.map(v => `
    <tr>
      <td class="cell-number">${v.videoNumber}</td>
      <td><div class="cell-title"><a href="${v.url}" target="_blank">${escHtml(v.title)}</a></div></td>
      <td class="cell-number">${formatNumber(v.views)}</td>
      <td class="cell-number">${formatNumber(v.likes)}</td>
      <td class="cell-number">${formatDuration(v.durationSec)}</td>
      <td><span class="cell-tag ${hookTagClass(v.hookType)}">${escHtml(v.hookType)}</span></td>
      <td><div class="cell-expandable" onclick="this.classList.toggle('expanded')">${escHtml(v.hookText)}</div></td>
      <td>${escHtml(v.hookFramework)}</td>
      <td><div class="cell-expandable" onclick="this.classList.toggle('expanded')">${escHtml(v.openingStructure)}</div></td>
      <td><div class="cell-expandable cell-script" onclick="this.classList.toggle('expanded')">${escHtml(v.scriptStructure)}</div></td>
      <td><span class="cell-tag cell-tag-default">${escHtml(v.storytellingFramework)}</span></td>
      <td><div class="cell-expandable" onclick="this.classList.toggle('expanded')">${escHtml(v.rehooksUsed)}</div></td>
      <td>${escHtml(v.retentionPattern)}</td>
      <td>${escHtml(v.ctaPlacement)}</td>
      <td><div class="cell-expandable" onclick="this.classList.toggle('expanded')">${escHtml(v.keyTakeaways)}</div></td>
      <td><div class="cell-expandable" onclick="this.classList.toggle('expanded')">${escHtml(v.thumbnailDescription)}</div></td>
    </tr>
  `).join('');
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Markdown to HTML ─────────────────────────────────────

function markdownToHtml(md) {
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*?<\/li>(\s*<br>)?)+/g, (match) => '<ul>' + match.replace(/<br>/g, '') + '</ul>');
  return '<p>' + html + '</p>';
}

// ─── CSV Export ───────────────────────────────────────────

async function downloadCSV() {
  if (!currentDetailedVideos?.length) {
    showToast('No video data to export', 'error');
    return;
  }

  try {
    const response = await fetch('/api/export-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelName: currentChannelName,
        videos: currentDetailedVideos,
      }),
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentChannelName || 'channel'}_analysis.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV downloaded successfully!');
  } catch (err) {
    showToast('CSV export failed: ' + err.message, 'error');
  }
}

// ─── Google Sheets Export ─────────────────────────────────

let gapiLoaded = false;
let gisLoaded = false;
let tokenClient;

function initGapi() {
  if (typeof gapi === 'undefined') return;
  gapi.load('client', async () => {
    await gapi.client.init({});
    gapiLoaded = true;
  });
}

function initGis(clientId) {
  if (typeof google === 'undefined' || !google.accounts) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    callback: (resp) => {
      if (resp.error) {
        showToast('Auth failed: ' + resp.error, 'error');
        return;
      }
      gisLoaded = true;
      createGoogleSheet();
    },
  });
}

async function createGoogleSheet() {
  if (!currentDetailedVideos?.length) {
    showToast('No video data to export', 'error');
    return;
  }

  try {
    showToast('Creating Google Sheet...');

    // Load Sheets API
    await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');

    // Create spreadsheet
    const createResponse = await gapi.client.sheets.spreadsheets.create({
      properties: { title: `${currentChannelName} — Channel Analysis` },
      sheets: [{
        properties: {
          title: 'Video Analysis',
          gridProperties: { frozenRowCount: 1 },
        },
      }],
    });

    const spreadsheetId = createResponse.result.spreadsheetId;
    const spreadsheetUrl = createResponse.result.spreadsheetUrl;

    // Prepare data
    const headers = [
      'Video #', 'Title', 'URL', 'Views', 'Likes', 'Comments',
      'Duration (sec)', 'Thumbnail URL', 'Thumbnail Description',
      'Hook Type', 'Hook Text', 'Hook Framework',
      'Opening Structure', 'Script Structure', 'Storytelling Framework',
      'Rehooks Used', 'Retention Pattern', 'CTA Placement', 'Key Takeaways'
    ];

    const rows = currentDetailedVideos.map(v => [
      v.videoNumber, v.title, v.url, v.views, v.likes, v.comments,
      v.durationSec, v.thumbnailUrl, v.thumbnailDescription,
      v.hookType, v.hookText, v.hookFramework,
      v.openingStructure, v.scriptStructure, v.storytellingFramework,
      v.rehooksUsed, v.retentionPattern, v.ctaPlacement, v.keyTakeaways,
    ]);

    // Write data
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Video Analysis!A1',
      valueInputOption: 'RAW',
      resource: { values: [headers, ...rows] },
    });

    // Format header row
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.15, green: 0.15, blue: 0.2 },
                  textFormat: { bold: true, foregroundColor: { red: 0.9, green: 0.9, blue: 0.95 } },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
            },
          },
        ],
      },
    });

    showToast('Saved to Google Sheets! Opening...');
    setTimeout(() => window.open(spreadsheetUrl, '_blank'), 500);

    closeSheetsModal();

  } catch (err) {
    console.error('Sheets export error:', err);
    showToast('Sheets export failed: ' + (err.result?.error?.message || err.message), 'error');
  }
}

window.openSheetsModal = function () {
  document.getElementById('sheets-modal').classList.remove('hidden');
  const savedId = localStorage.getItem('oauth_client_id');
  if (savedId) {
    document.getElementById('oauth-client-id').value = savedId;
  }
};

window.closeSheetsModal = function () {
  document.getElementById('sheets-modal').classList.add('hidden');
};

window.saveOAuthAndExport = function () {
  const clientId = document.getElementById('oauth-client-id').value.trim();
  if (!clientId) {
    showToast('Please enter an OAuth Client ID', 'error');
    return;
  }

  localStorage.setItem('oauth_client_id', clientId);

  // Initialize
  initGapi();
  initGis(clientId);

  // Wait for gapi to load, then request access
  const waitAndAuth = () => {
    if (gapiLoaded && tokenClient) {
      tokenClient.requestAccessToken({ prompt: '' });
    } else {
      setTimeout(waitAndAuth, 200);
    }
  };

  setTimeout(waitAndAuth, 500);
};

// Try to auto-init if gapi script is loaded
if (typeof gapi !== 'undefined') {
  initGapi();
}

// ─── Main Analysis Flow ───────────────────────────────────

async function analyzeChannel(input) {
  heroSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressSteps.innerHTML = '';
  progressTitle.textContent = 'Analyzing channel...';

  let channelData = null;
  let statsData = null;
  let detailedVideos = null;

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelInput: input }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          handleStreamEvent(data);

          if (data.step === 'channel_found') channelData = data.channel;
          if (data.step === 'data_analysis') statsData = data.stats;
          if (data.step === 'deep_analysis_complete') detailedVideos = data.detailedVideos;
          if (data.step === 'complete') {
            showResults(channelData, statsData, detailedVideos, data.report);
          }
          if (data.step === 'error') throw new Error(data.message);
        } catch (e) {
          if (!e.message.includes('JSON') && e.message !== 'Unexpected end of JSON input') throw e;
        }
      }
    }
  } catch (err) {
    progressTitle.textContent = 'Analysis failed';
    addProgressStep(`Error: ${err.message}`, 'error');
    console.error(err);
    setTimeout(() => {
      progressSteps.innerHTML += `<div class="progress-step" style="margin-top:16px"><button onclick="resetToHome()" class="btn-new-analysis" style="width:100%">Try Again</button></div>`;
    }, 500);
  }
}

function handleStreamEvent(data) {
  const msgs = {
    resolving: '🔍 Resolving channel...',
    fetching_channel: '📡 Fetching channel details...',
    channel_found: `✅ Found: ${data.message}`,
    fetching_videos: '📹 Fetching recent videos...',
    videos_fetched: `📊 ${data.message}`,
    analyzing: '🧮 Analyzing video data...',
    data_analysis: '✅ Data analysis complete',
    deep_analysis: `🤖 ${data.message}`,
    deep_analysis_batch: `⚙️ ${data.message}`,
    deep_analysis_complete: `✅ ${data.message}`,
    generating_report: '📝 Generating AI channel report...',
    complete: '🎉 Done!',
  };

  const msg = msgs[data.step] || data.message;
  addProgressStep(msg, data.step === 'complete' ? 'done' : 'active');
  progressTitle.textContent = msg;
}

function showResults(channel, stats, detailedVideos, report) {
  progressSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');

  // Store for export
  currentChannelData = channel;
  currentDetailedVideos = detailedVideos;
  currentChannelName = channel.title.replace(/[^a-zA-Z0-9]/g, '_');

  // Channel card
  document.getElementById('channel-avatar').src = channel.thumbnail || '';
  document.getElementById('channel-name').textContent = channel.title;
  document.getElementById('channel-desc').textContent = channel.description || '';
  document.getElementById('stat-subs').textContent = formatNumber(channel.subscribers);
  document.getElementById('stat-views').textContent = formatNumber(channel.totalViews);
  document.getElementById('stat-videos').textContent = formatNumber(channel.videoCount);
  document.getElementById('stat-created').textContent = formatDate(channel.createdAt);

  // Quick stats
  document.getElementById('qs-avg-views').textContent = formatNumber(stats.avgViews);
  document.getElementById('qs-avg-likes').textContent = formatNumber(stats.avgLikes);
  document.getElementById('qs-engagement').textContent = stats.engagementRate + '%';
  document.getElementById('qs-avg-duration').textContent = stats.avgDuration + ' min';
  document.getElementById('qs-frequency').textContent = 'Every ' + stats.postingGap + 'd';

  // Charts
  setTimeout(() => {
    renderViewsChart(stats.viewsTrend);
    renderDurationChart(stats.duration);
  }, 100);

  // Detailed video table
  if (detailedVideos && detailedVideos.length) {
    renderVideoTable(detailedVideos);
  }

  // Top videos
  renderTopVideos(stats.topVideos);

  // AI Report
  document.getElementById('ai-report').innerHTML = markdownToHtml(report);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Event Listeners ──────────────────────────────────────

analyzeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = channelInput.value.trim();
  if (!input) return;
  analyzeBtn.disabled = true;
  analyzeChannel(input).finally(() => { analyzeBtn.disabled = false; });
});

document.querySelectorAll('.hint-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    channelInput.value = chip.dataset.value;
    channelInput.focus();
  });
});

window.resetToHome = function () {
  resultsSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  heroSection.classList.remove('hidden');
  channelInput.value = '';
  channelInput.focus();
};

newAnalysisBtn?.addEventListener('click', resetToHome);

// Export button listeners
document.getElementById('export-csv-btn')?.addEventListener('click', downloadCSV);

document.getElementById('export-sheets-btn')?.addEventListener('click', () => {
  const savedId = localStorage.getItem('oauth_client_id');
  if (savedId && gapiLoaded && gisLoaded) {
    // Already authenticated, just export
    createGoogleSheet();
  } else {
    openSheetsModal();
  }
});

// ─── Auto-Load Strategic Dossier ───────────────────────────

async function loadLatestAnalysis() {
  try {
    const res = await fetch('/api/latest-analysis');
    const data = await res.json();
    if (data.success && data.analysis) {
      console.log('YT-to-AI: Loading Latest Dossier...', data.analysis);
      showLatestDossier(data.analysis);
    }
  } catch (err) {
    console.error('YT-to-AI: No history found.');
  }
}

function showLatestDossier(analysis) {
  heroSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  
  // Set Channel Context
  document.getElementById('channel-name').textContent = analysis.channel;
  document.getElementById('stat-subs').textContent = 'Live Analysis';
  
  // Display Synthesis Report
  document.getElementById('ai-report').innerHTML = markdownToHtml(analysis.report);
  
  // Display Video Breakdown
  if (analysis.videos && analysis.videos.length) {
    const tableBody = document.getElementById('video-table-body');
    tableBody.innerHTML = analysis.videos.map(v => `
      <tr>
        <td class="cell-number">${v.videoNumber || '-'}</td>
        <td><div class="cell-title">${escHtml(v.title || 'In-Depth Analysis')}</div></td>
        <td><span class="cell-tag cell-tag-bold">${escHtml(v.hookType || 'Detected')}</span></td>
        <td><div class="cell-expandable expanded">${escHtml(v.hookText || 'See full report above')}</div></td>
        <td>${escHtml(v.hookFramework || '-')}</td>
        <td><div class="cell-expandable">${escHtml(v.scriptStructure || '-')}</div></td>
        <td>${escHtml(v.retentionPattern || '-')}</td>
        <td>${escHtml(v.ctaPlacement || '-')}</td>
        <td><div class="cell-expandable">${escHtml(v.keyTakeaways || '-')}</div></td>
      </tr>
    `).join('');
  }
}

// Global Load Trigger
window.addEventListener('load', loadLatestAnalysis);
