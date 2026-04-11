import express from 'express';
import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Persistent Error Logging ──────────────────────────────
const ERROR_LOG = join(__dirname, 'data', 'error.log');

const logError = (err, context = 'Server') => {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${context}] ${err.stack || err}\n`;
  console.error(message);
  try {
    const dataDir = join(__dirname, 'data');
    if (!existsSync(dataDir)) { try { mkdirSync(dataDir, { recursive: true }); } catch {} }
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

const PORT = process.env.PORT || 3005;

// ═══════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════

app.get('/api/prompts', (req, res) => {
  try {
    const promptsDir = join(__dirname, 'prompts');
    const files = readdirSync(promptsDir).filter(f => f.endsWith('.txt'));
    const prompts = {};
    files.forEach(f => {
      prompts[f.replace('.txt', '').replace(/-/g, '_')] = readFileSync(join(promptsDir, f), 'utf-8');
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
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(id).catch(() => null);
        let formatted = '[TRANSCRIPT UNAVAILABLE]';
        if (transcript && transcript.length > 0) {
          formatted = transcript.map(part => {
            const totalSec = Math.floor((part.offset || 0) / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}] ${part.text}`;
          }).join(' ');
        }
        results.push({ id, transcript: formatted });
      } catch (e) {
        results.push({ id, transcript: '[TRANSCRIPT ERROR]' });
      }
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
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// Create a new analysis session
app.post('/api/session/create', (req, res) => {
  try {
    const { channel, totalVideos, promptUsed } = req.body;
    if (!channel) return res.status(400).json({ error: 'Channel name required' });

    const sessions = readSessions();
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

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Save screenshot if provided
    let screenshotPath = '';
    if (screenshot && screenshot.length > 100) {
      const screenshotsDir = join(__dirname, 'data', 'screenshots');
      if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });
      const imgId = `${id}_v${session.videos.length + 1}`;
      const imagePath = join(screenshotsDir, `${imgId}.png`);
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
      writeFileSync(imagePath, base64Data, 'base64');
      screenshotPath = `/data/screenshots/${imgId}.png`;
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
app.post('/api/session/:id/scene-frames', express.json({limit: '200mb'}), (req, res) => {
  try {
    const { id } = req.params;
    const { frames } = req.body; // Array of base64 strings

    const sessions = readSessions();
    const session = sessions.find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const scenesDir = join(__dirname, 'data', 'scenes');
    if (!existsSync(scenesDir)) mkdirSync(scenesDir, { recursive: true });

    const savedPaths = [];
    frames.forEach((b64, idx) => {
      const imgId = `${id}_frame_${idx}`;
      const imagePath = join(scenesDir, `${imgId}.png`);
      const base64Data = b64.replace(/^data:image\/\w+;base64,/, '');
      writeFileSync(imagePath, base64Data, 'base64');
      savedPaths.push(`/data/scenes/${imgId}.png`);
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

    const session = sessions[sessionIndex];

    // 1. Delete associated screenshots
    const screenshotsDir = join(__dirname, 'data', 'screenshots');
    if (session.videos) {
      session.videos.forEach(v => {
        if (v.screenshot) {
          const filePath = join(__dirname, v.screenshot.startsWith('/') ? v.screenshot.substring(1) : v.screenshot);
          if (existsSync(filePath)) try { unlinkSync(filePath); } catch (e) { console.error(`Failed to delete ${filePath}`, e); }
        }
      });
    }

    if (session.finalScreenshot) {
      const finalPath = join(__dirname, session.finalScreenshot.startsWith('/') ? session.finalScreenshot.substring(1) : session.finalScreenshot);
      if (existsSync(finalPath)) try { unlinkSync(finalPath); } catch (e) { console.error(`Failed to delete ${finalPath}`, e); }
    }

    // 2. Delete scene frames
    if (session.sceneFrames && Array.isArray(session.sceneFrames)) {
      session.sceneFrames.forEach(framePath => {
        const fullPath = join(__dirname, framePath.startsWith('/') ? framePath.substring(1) : framePath);
        if (existsSync(fullPath)) try { unlinkSync(fullPath); } catch (e) { console.error(`Failed to delete ${fullPath}`, e); }
      });
    }

    // 3. Remove from sessions.json
    sessions.splice(sessionIndex, 1);
    writeSessions(sessions);

    res.json({ success: true, message: 'Session deleted successfully' });
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

    const esc = (v) => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };

    let csv = headers.map(esc).join(',') + '\n';
    session.videos.forEach(v => {
      csv += [
        v.stepNumber || v.videoNumber, v.title, v.views, v.durationSec,
        v.hookType, v.hookText, v.hookFramework,
        v.openingStructure, v.scriptStructure, v.storytellingFramework,
        v.rehooksUsed, v.retentionPattern, v.ctaPlacement,
        Array.isArray(v.keyTakeaways) ? v.keyTakeaways.join('; ') : v.keyTakeaways,
        v.thumbnailDescription
      ].map(esc).join(',') + '\n';
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
  console.log('🚀 YT-to-AI STRATEGIST: Ready');
  console.log('──────────────────────────────────────');
  console.log(`📡 Local Hub: http://127.0.0.1:${PORT}`);
  console.log('📑 ChatGPT Loop: ACTIVE');
  console.log('📊 Strategic Engine: READY');
  console.log('──────────────────────────────────────');
  console.log('Note: API Keys are OPTIONAL for current flow.');
});
