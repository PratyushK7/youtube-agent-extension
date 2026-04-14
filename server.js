import express from 'express';
import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync, mkdirSync, unlinkSync, rmSync, renameSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Persistent Error Logging ──────────────────────────────
const ERROR_LOG = join(__dirname, 'data', 'error.log');

const MAX_ERROR_LOG_BYTES = 1024 * 1024; // 1MB max

const logError = (err, context = 'Server') => {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${context}] ${err.stack || err}\n`;
  console.error(message);
  try {
    const dataDir = join(__dirname, 'data');
    if (!existsSync(dataDir)) { try { mkdirSync(dataDir, { recursive: true }); } catch { } }
    // Rotate if log exceeds size limit
    if (existsSync(ERROR_LOG)) {
      try {
        const stats = statSync(ERROR_LOG);
        if (stats.size > MAX_ERROR_LOG_BYTES) {
          const content = readFileSync(ERROR_LOG, 'utf-8');
          const lines = content.split('\n');
          const truncated = lines.slice(-500).join('\n');
          writeFileSync(ERROR_LOG, truncated);
        }
      } catch (rotateErr) { /* ignore rotation errors */ }
    }
    appendFileSync(ERROR_LOG, message);
  } catch (e) {
    console.error('Failed to write to error log:', e);
  }
};

process.on('uncaughtException', (err) => logError(err, 'Uncaught Exception'));
process.on('unhandledRejection', (reason) => logError(reason, 'Unhandled Rejection'));

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use((req, res, next) => {
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  res.header('Surrogate-Control', 'no-speed');
  next();
});

app.use(express.static(join(__dirname, 'public')));
app.use('/data', express.static(join(__dirname, 'data')));
app.use(express.json({ limit: '50mb' }));

// ─── Request Logging ───────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const orig = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const icon = status >= 400 ? '❌' : '✓';
    console.log(`${icon} ${req.method} ${req.url} → ${status} (${duration}ms)`);
    orig.apply(this, args);
  };
  next();
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  // Return the high-quality PNG as the icon
  res.sendFile(join(__dirname, 'public', 'favicon.png'));
});

const PORT = process.env.PORT || 3005;

// ═══════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════

app.get('/api/prompts', (req, res) => {
  try {
    const promptsDir = join(__dirname, 'prompts');
    const files = readdirSync(promptsDir).filter(f => f.endsWith('.txt'));
    const prompts = files.map(f => {
      const content = readFileSync(join(promptsDir, f), 'utf-8');
      const name = f.replace('.txt', '').replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { id: f, name, content };
    });
    res.json(prompts);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/get-transcripts', async (req, res) => {
  try {
    const { videoIds } = req.body;
    if (!videoIds || !Array.isArray(videoIds)) return res.status(400).json({ error: 'Invalid video IDs' });

    const results = [];
    for (const id of videoIds) {
      let formatted = '[TRANSCRIPT UNAVAILABLE]';
      try {
        console.log(`Fetching transcript for: ${id}`);
        let transcript = null;

        // Method 1: Scrape YouTube page for caption tracks (most reliable)
        try {
          const pageRes = await fetch(`https://www.youtube.com/watch?v=${id}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cookie': 'CONSENT=PENDING+999'
            }
          });
          const html = await pageRes.text();
          const markerIdx = html.indexOf('ytInitialPlayerResponse');
          if (markerIdx > -1) {
            // Find the JSON object start after the marker
            const startIdx = html.indexOf('{', markerIdx);
            let depth = 0, endIdx = startIdx;
            for (let i = startIdx; i < html.length && i < startIdx + 500000; i++) {
              if (html[i] === '{') depth++;
              else if (html[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
            }
            const playerData = JSON.parse(html.substring(startIdx, endIdx));
            const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length > 0) {
              // Prefer English, then auto-generated, then first available
              const track = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
                || tracks.find(t => t.languageCode === 'en')
                || tracks.find(t => t.kind === 'asr')
                || tracks[0];
              if (track?.baseUrl) {
                const captionRes = await fetch(track.baseUrl + '&fmt=json3');
                const captionData = await captionRes.json();
                if (captionData.events) {
                  transcript = captionData.events
                    .filter(e => e.segs)
                    .map(e => ({
                      offset: (e.tStartMs || 0),
                      text: e.segs.map(s => s.utf8 || '').join('').trim()
                    }))
                    .filter(e => e.text);
                  console.log(`Page scrape success for ${id}: ${transcript.length} segments`);
                }
              }
            } else {
              console.warn(`No caption tracks on page for ${id}`);
            }
          }
        } catch (pageErr) {
          console.warn(`Page scrape failed for ${id}:`, pageErr.message);
        }

        // Method 2: youtube-transcript library fallback
        if (!transcript || transcript.length === 0) {
          try {
            const libResult = await YoutubeTranscript.fetchTranscript(id);
            if (libResult && libResult.length > 0) {
              transcript = libResult;
              console.log(`Library fallback success for ${id}: ${transcript.length} segments`);
            }
          } catch (libErr) {
            console.warn(`Library failed for ${id}: ${libErr.message}`);
          }
        }

        if (transcript && transcript.length > 0) {
          formatted = transcript.map(part => {
            const totalSec = Math.floor((part.offset || 0) / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}] ${part.text}`;
          }).join('\n');
          console.log(`Transcript for ${id}: ${formatted.length} chars`);
        } else {
          console.warn(`No transcript available for ${id}`);
        }
      } catch (e) {
        console.error(`Transcript error for ${id}:`, e.message);
        formatted = '[TRANSCRIPT ERROR]';
      }
      results.push({ id, transcript: formatted });
    }
    res.json({ success: true, transcripts: results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// SESSION-BASED ANALYSIS API (Extension Sequential Flow)
// ═══════════════════════════════════════════════════════════════

const SESSIONS_FILE = join(__dirname, 'data', 'sessions.json');

function readSessions() {
  if (!existsSync(SESSIONS_FILE)) { writeFileSync(SESSIONS_FILE, '[]'); return []; }
  return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
}

function writeSessions(sessions) {
  const tmpFile = SESSIONS_FILE + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(sessions, null, 2));
  renameSync(tmpFile, SESSIONS_FILE);
}

// Create or replace analysis session (one session per channel)
app.post('/api/session/create', (req, res) => {
  try {
    const { channel, totalVideos, promptUsed } = req.body;
    if (!channel) return res.status(400).json({ error: 'Channel name required' });

    const sessions = readSessions();

    // Find existing session(s) for this channel (case-insensitive & trimmed)
    const cleanChannel = channel.trim().toLowerCase();
    
    // Find all indices to remove (in case of duplicates)
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (s.channel.trim().toLowerCase() === cleanChannel) {
        const oldSession = s;
        const assetsDir = join(__dirname, 'data', 'channel_assets', oldSession.id);
        if (existsSync(assetsDir)) {
          try { 
            rmSync(assetsDir, { recursive: true, force: true });
            console.log(`🧹 Deleted old assets: ${assetsDir}`);
          } catch (e) {
            console.error(`❌ Failed to delete old assets: ${e.message}`);
          }
        }
        sessions.splice(i, 1);
        console.log(`🚮 Removed old session entry for "${channel}" (${oldSession.id})`);
      }
    }

    const session = {
      id: `ses_${Date.now()}`,
      channel,
      totalVideos: totalVideos || 0,
      promptUsed: promptUsed || 'master_analysis',
      status: 'in-progress',
      videos: [],
      synthesis: '',
      startedAt: new Date().toISOString(),
      completedAt: null
    };

    sessions.unshift(session);
    writeSessions(sessions);
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Append a single video analysis to a session
app.put('/api/session/:id/video', (req, res) => {
  try {
    const { id } = req.params;
    const { videoData, rawResponse, screenshot } = req.body;

    if (videoData && typeof videoData !== 'object') {
      return res.status(400).json({ error: 'videoData must be an object' });
    }

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Save screenshot if provided
    let screenshotPath = '';
    if (screenshot && screenshot.length > 100) {
      const sessionAssetsDir = join(__dirname, 'data', 'channel_assets', id);
      const screenshotsDir = join(sessionAssetsDir, 'thumbnails');
      if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });
      const imgId = `${id}_v${session.videos.length + 1}`;
      const imagePath = join(screenshotsDir, `${imgId}.png`);
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
      writeFileSync(imagePath, base64Data, 'base64');
      screenshotPath = `/data/channel_assets/${id}/thumbnails/${imgId}.png`;
    }

    const entry = {
      stepNumber: session.videos.length + 1,
      ...(videoData || {}),
      rawResponse: rawResponse || '',
      screenshot: screenshotPath,
      capturedAt: new Date().toISOString()
    };

    session.videos.push(entry);
    writeSessions(sessions);
    res.json({ success: true, videoCount: session.videos.length, entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Complete a session with final synthesis
app.put('/api/session/:id/complete', (req, res) => {
  try {
    const { id } = req.params;
    const { synthesis, screenshot } = req.body;

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.synthesis = synthesis || '';
    session.status = 'complete';
    session.completedAt = new Date().toISOString();

    // Save final synthesis screenshot
    if (screenshot && screenshot.length > 100) {
      const screenshotsDir = join(__dirname, 'data', 'screenshots');
      if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });
      const imagePath = join(screenshotsDir, `${id}_final.png`);
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
      writeFileSync(imagePath, base64Data, 'base64');
      session.finalScreenshot = `/data/screenshots/${id}_final.png`;
    }

    writeSessions(sessions);
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Append niche bends to a session
app.put('/api/session/:id/niche-bends', (req, res) => {
  try {
    const { id } = req.params;
    const { nicheBends } = req.body;

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.nicheBends = nicheBends || '';
    writeSessions(sessions);
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Scene Analyzer: Save 5 Frames
app.post('/api/session/:id/scene-frames', express.json({ limit: '200mb' }), (req, res) => {
  try {
    const { id } = req.params;
    const { frames } = req.body; // Array of base64 strings

    if (!Array.isArray(frames) || frames.length === 0 || frames.length > 10) {
      return res.status(400).json({ error: 'frames must be an array of 1-10 base64 strings' });
    }

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionAssetsDir = join(__dirname, 'data', 'channel_assets', id);
    const scenesDir = join(sessionAssetsDir, 'scenes');
    if (!existsSync(scenesDir)) mkdirSync(scenesDir, { recursive: true });

    const savedPaths = [];
    frames.forEach((b64, idx) => {
      const imgId = `${id}_frame_${idx}`;
      const imagePath = join(scenesDir, `${imgId}.png`);
      const base64Data = b64.replace(/^data:image\/\w+;base64,/, '');
      writeFileSync(imagePath, base64Data, 'base64');
      savedPaths.push(`/data/channel_assets/${id}/scenes/${imgId}.png`);
    });

    session.sceneFrames = savedPaths;
    writeSessions(sessions);
    res.json({ success: true, frames: savedPaths });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Scene Analyzer: Save ChatGPT Output
app.put('/api/session/:id/scene-analysis', (req, res) => {
  try {
    const { id } = req.params;
    const { sceneAnalysis } = req.body;

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.sceneAnalysis = sceneAnalysis || '';
    writeSessions(sessions);
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a session and its files
app.delete('/api/session/:id', (req, res) => {
  try {
    const { id } = req.params;
    const sessions = readSessions();
    const sessionIndex = sessions.findIndex(s => s.id === id);
    if (sessionIndex === -1) return res.status(404).json({ error: 'Session not found' });

    // Delete associated assets folder
    const assetsDir = join(__dirname, 'data', 'channel_assets', id);
    if (existsSync(assetsDir)) {
      try {
        rmSync(assetsDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`Failed to delete assets folder: ${assetsDir}`, e);
      }
    }

    // Remove from sessions.json
    sessions.splice(sessionIndex, 1);
    writeSessions(sessions);

    res.json({ success: true, message: 'Session and all assets deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all sessions (for dashboard)
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = readSessions();
    // Return summary (without heavy rawResponse/screenshot data)
    const summaries = sessions.map(s => ({
      id: s.id,
      channel: s.channel,
      totalVideos: s.totalVideos,
      analyzedVideos: s.videos.length,
      status: s.status,
      promptUsed: s.promptUsed,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      finalScreenshot: s.finalScreenshot || (s.videos.length ? s.videos[0].screenshot : ''),
      hasSynthesis: !!s.synthesis
    }));
    res.json(summaries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Get a single session
app.get('/api/session/:id', (req, res) => {
  try {
    const sessions = readSessions();
    const session = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export session as CSV
app.get('/api/session/:id/csv', (req, res) => {
  try {
    const sessions = readSessions();
    const session = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const headers = [
      'Video #', 'Title', 'Views', 'Duration (sec)',
      'Hook Type', 'Hook Text', 'Hook Framework',
      'Opening Structure', 'Script Structure', 'Storytelling Framework',
      'Rehooks Used', 'Retention Pattern', 'CTA Placement',
      'Key Takeaways', 'Thumbnail Description'
    ];

    const stringify = (v) => Array.isArray(v) ? v.join('; ') : v;
    const esc = (v) => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };

    let csv = headers.map(esc).join(',') + '\n';
    session.videos.forEach(v => {
      csv += [
        v.stepNumber || v.videoNumber, v.title, v.views, v.durationSec,
        v.hookType, v.hookText, v.hookFramework,
        v.openingStructure, v.scriptStructure, v.storytellingFramework,
        v.rehooksUsed, v.retentionPattern, v.ctaPlacement,
        v.keyTakeaways, v.thumbnailDescription
      ].map(val => esc(stringify(val))).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${session.channel || 'session'}_analysis.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════


// Global Error Handler for Express (must be after all routes)
app.use((err, req, res, next) => {
  logError(err, `${req.method} ${req.url}`);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// JSON 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.url}` });
});

// Create data directories if missing
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const screenshotsDir = join(dataDir, 'screenshots');
if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });


app.listen(PORT, '127.0.0.1', () => {
  console.clear();
  console.log('🚀 Channel Lens: Ready');
  console.log('──────────────────────────────────────');
  console.log(`📡 Local Hub: http://127.0.0.1:${PORT}`);
});
