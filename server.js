import express from 'express';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'fs';
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
    if (!existsSync(join(__dirname, 'data'))) readdirSync(join(__dirname, 'data')); // Ensure dir exists
    appendFileSync(ERROR_LOG, message);
  } catch (e) {
    console.error('Failed to write to error log:', e);
  }
};

process.on('uncaughtException', (err) => logError(err, 'Uncaught Exception'));
process.on('unhandledRejection', (reason) => logError(reason, 'Unhandled Rejection'));

const app = express();

app.use(express.static(join(__dirname, 'public')));
app.use('/data', express.static(join(__dirname, 'data'))); // Serve data/screenshots
app.use(express.json({ limit: '50mb' })); 

// Global Error Handler for Express
app.use((err, req, res, next) => {
  logError(err, `${req.method} ${req.url}`);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

const PORT = process.env.PORT || 3005;

// ─── YouTube Data API Setup ────────────────────────────────
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// ═══════════════════════════════════════════════════════════════
// MULTI-PROVIDER AI LAYER
// ═══════════════════════════════════════════════════════════════

const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

/**
 * Unified AI completion function — supports Gemini, Groq, and Ollama
 */
async function aiComplete(prompt) {
  switch (AI_PROVIDER) {
    case 'gemini':
      return geminiComplete(prompt);
    case 'groq':
      return groqComplete(prompt);
    case 'ollama':
      return ollamaComplete(prompt);
    default:
      throw new Error(`Unknown AI provider: ${AI_PROVIDER}. Use 'gemini', 'groq', or 'ollama'.`);
  }
}

// ─── Gemini ────────────────────────────────────────────────
async function geminiComplete(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ─── Groq (free, fast — llama, mixtral, gemma) ─────────────
async function groqComplete(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set in .env');

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API error (${res.status}): ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ─── Ollama (local, free — llama3, mistral, etc.) ──────────
async function ollamaComplete(prompt) {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error (${res.status}): ${res.statusText}. Is Ollama running? → brew install ollama && ollama serve`);
  }

  const data = await res.json();
  return data.response;
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE HELPERS
// ═══════════════════════════════════════════════════════════════

async function resolveChannelId(input) {
  const trimmed = input.trim();
  if (/^UC[\w-]{22}$/.test(trimmed)) return trimmed;

  let handle = null;
  let channelId = null;
  let username = null;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] === 'channel' && parts[1]) channelId = parts[1];
    else if (parts[0]?.startsWith('@')) handle = parts[0];
    else if (parts[0] === 'c' && parts[1]) username = parts[1];
    else if (parts[0] === 'user' && parts[1]) username = parts[1];
  } catch {
    handle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  }

  if (channelId) return channelId;

  if (handle) {
    const res = await youtube.channels.list({ part: 'id', forHandle: handle.replace('@', ''), maxResults: 1 });
    if (res.data.items?.length) return res.data.items[0].id;
    const search = await youtube.search.list({ part: 'snippet', q: handle, type: 'channel', maxResults: 1 });
    if (search.data.items?.length) return search.data.items[0].snippet.channelId;
  }

  if (username) {
    const res = await youtube.channels.list({ part: 'id', forUsername: username, maxResults: 1 });
    if (res.data.items?.length) return res.data.items[0].id;
  }

  const search = await youtube.search.list({ part: 'snippet', q: trimmed, type: 'channel', maxResults: 1 });
  if (search.data.items?.length) return search.data.items[0].snippet.channelId;

  throw new Error('Channel not found. Try pasting the full channel URL.');
}

async function getChannelInfo(channelId) {
  const res = await youtube.channels.list({ part: 'snippet,statistics,brandingSettings,contentDetails', id: channelId });
  if (!res.data.items?.length) throw new Error('Channel details not found.');
  return res.data.items[0];
}

async function getChannelVideos(channelId, uploadsPlaylistId, maxVideos = 50) {
  const videoIds = [];
  let nextPageToken = undefined;

  while (videoIds.length < maxVideos) {
    const res = await youtube.playlistItems.list({
      part: 'contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(50, maxVideos - videoIds.length),
      pageToken: nextPageToken,
    });
    for (const item of res.data.items || []) videoIds.push(item.contentDetails.videoId);
    nextPageToken = res.data.nextPageToken;
    if (!nextPageToken) break;
  }

  if (!videoIds.length) return [];

  const videos = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await youtube.videos.list({ part: 'snippet,statistics,contentDetails', id: batch.join(',') });
    videos.push(...(res.data.items || []));
  }
  return videos;
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

function analyzeVideoData(videos) {
  if (!videos.length) return null;

  const parsed = videos.map(v => ({
    title: v.snippet.title,
    description: v.snippet.description?.substring(0, 200) || '',
    publishedAt: new Date(v.snippet.publishedAt),
    views: parseInt(v.statistics.viewCount || 0),
    likes: parseInt(v.statistics.likeCount || 0),
    comments: parseInt(v.statistics.commentCount || 0),
    durationSec: parseDuration(v.contentDetails.duration),
    thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || '',
    tags: v.snippet.tags || [],
  }));

  const byViews = [...parsed].sort((a, b) => b.views - a.views);
  const topVideos = byViews.slice(0, 10);
  const bottomVideos = byViews.slice(-5);

  const dates = parsed.map(v => v.publishedAt).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
  const avgGapDays = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  const durations = parsed.map(v => v.durationSec);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const shortCount = durations.filter(d => d < 60).length;
  const mediumCount = durations.filter(d => d >= 60 && d <= 600).length;
  const longCount = durations.filter(d => d > 600).length;

  const totalViews = parsed.reduce((a, v) => a + v.views, 0);
  const totalLikes = parsed.reduce((a, v) => a + v.likes, 0);
  const totalComments = parsed.reduce((a, v) => a + v.comments, 0);
  const avgViews = totalViews / parsed.length;
  const avgLikes = totalLikes / parsed.length;
  const avgComments = totalComments / parsed.length;
  const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews * 100) : 0;

  const allTitles = parsed.map(v => v.title);
  const avgTitleLength = allTitles.reduce((a, t) => a + t.length, 0) / allTitles.length;
  const titleWordsAvg = allTitles.reduce((a, t) => a + t.split(/\s+/).length, 0) / allTitles.length;

  const wordCount = {};
  for (const title of allTitles) {
    for (const w of title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)) {
      if (w.length > 2) wordCount[w] = (wordCount[w] || 0) + 1;
    }
  }
  const topWords = Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));

  const tagCount = {};
  for (const v of parsed) for (const tag of v.tags) { const t = tag.toLowerCase(); tagCount[t] = (tagCount[t] || 0) + 1; }
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));

  const monthlyUploads = {};
  for (const v of parsed) {
    const key = `${v.publishedAt.getFullYear()}-${String(v.publishedAt.getMonth() + 1).padStart(2, '0')}`;
    monthlyUploads[key] = (monthlyUploads[key] || 0) + 1;
  }

  const viewsTrend = parsed.sort((a, b) => a.publishedAt - b.publishedAt)
    .map(v => ({ date: v.publishedAt.toISOString().split('T')[0], title: v.title, views: v.views }));

  return {
    totalVideosAnalyzed: parsed.length, topVideos, bottomVideos,
    posting: { avgGapDays: Math.round(avgGapDays * 10) / 10, totalDaysSpan: dates.length >= 2 ? Math.round((dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)) : 0, monthlyUploads },
    duration: { avgSeconds: Math.round(avgDuration), avgMinutes: Math.round(avgDuration / 60 * 10) / 10, shorts: shortCount, medium: mediumCount, long: longCount },
    engagement: { avgViews: Math.round(avgViews), avgLikes: Math.round(avgLikes), avgComments: Math.round(avgComments), engagementRate: Math.round(engagementRate * 100) / 100 },
    titles: { avgLength: Math.round(avgTitleLength), avgWordCount: Math.round(titleWordsAvg * 10) / 10, topWords, allTitles },
    tags: topTags, viewsTrend,
  };
}

// ═══════════════════════════════════════════════════════════════
// AI ANALYSIS — Channel Report
// ═══════════════════════════════════════════════════════════════

async function generateAIReport(channelInfo, analysis) {
  const s = channelInfo.snippet;
  const st = channelInfo.statistics;

  const prompt = `You are an elite YouTube channel analyst. Analyze this channel data and produce a comprehensive, strategic report.

## CHANNEL OVERVIEW
- Name: ${s.title}
- Description: ${s.description?.substring(0, 500) || 'N/A'}
- Created: ${s.publishedAt}
- Subscribers: ${parseInt(st.subscriberCount).toLocaleString()}
- Total Views: ${parseInt(st.viewCount).toLocaleString()}
- Total Videos: ${st.videoCount}
- Country: ${s.country || 'Unknown'}

## VIDEO ANALYSIS (Last ${analysis.totalVideosAnalyzed} videos)
### Posting: avg ${analysis.posting.avgGapDays} days gap, ${analysis.posting.totalDaysSpan} day span
### Duration: avg ${analysis.duration.avgMinutes} min | Shorts: ${analysis.duration.shorts} | Medium: ${analysis.duration.medium} | Long: ${analysis.duration.long}
### Engagement: avg ${analysis.engagement.avgViews} views, ${analysis.engagement.avgLikes} likes, ${analysis.engagement.avgComments} comments, ${analysis.engagement.engagementRate}% rate

### Top 10 Videos
${analysis.topVideos.map((v, i) => `${i + 1}. "${v.title}" — ${v.views.toLocaleString()} views, ${v.likes.toLocaleString()} likes`).join('\n')}

### Bottom 5 Videos
${analysis.bottomVideos.map((v, i) => `${i + 1}. "${v.title}" — ${v.views.toLocaleString()} views`).join('\n')}

### Title Analysis: avg ${analysis.titles.avgLength} chars, ${analysis.titles.avgWordCount} words
Top words: ${analysis.titles.topWords.map(w => `${w.word}(${w.count})`).join(', ')}

Generate a report with EXACTLY these sections (use markdown):

## 1. Channel Identity & Positioning
## 2. Content Strategy Breakdown
## 3. Performance Analysis
## 4. Title & Thumbnail Strategy
## 5. Audience Engagement Profile
## 6. Growth Trajectory & Momentum
## 7. Strengths
## 8. Weaknesses & Blind Spots
## 9. Strategic Recommendations
## 10. Niche Bending Opportunities

Be direct. Use numbers. No fluff.`;

  return await aiComplete(prompt);
}

// ═══════════════════════════════════════════════════════════════
// AI ANALYSIS — Per-Video Deep Breakdown
// ═══════════════════════════════════════════════════════════════

async function analyzeVideosBatch(videos, batchIndex, batchSize) {
  const batch = videos.slice(batchIndex, batchIndex + batchSize);

  const videoList = batch.map((v, i) => {
    const desc = v.snippet.description || '';
    return `
VIDEO ${batchIndex + i + 1}:
- Title: ${v.snippet.title}
- Description (first 500 chars): ${desc.substring(0, 500)}
- Duration: ${parseDuration(v.contentDetails.duration)} seconds
- Views: ${v.statistics.viewCount || 0}
- Likes: ${v.statistics.likeCount || 0}
- Comments: ${v.statistics.commentCount || 0}
- Tags: ${(v.snippet.tags || []).slice(0, 10).join(', ')}
- Published: ${v.snippet.publishedAt}`;
  }).join('\n---\n');

  const prompt = `You are analyzing YouTube videos for a deep channel research sheet. For EACH video below, provide a structured analysis.

${videoList}

For EACH video, return a JSON object with these EXACT fields. Return a JSON array with one object per video, in the same order.

Fields for each video:
- "videoIndex": (number, the VIDEO number from above)
- "thumbnailDescription": (string, describe what the thumbnail likely shows based on title/topic — be specific about visual elements, text overlays, expressions, colors)
- "hookType": (string, one of: "Direct Question", "Bold Statement", "Story Opening", "Challenge", "Assumption Challenge", "Identity Revelation", "Curiosity Gap", "Contrarian Take", "Listicle Tease", "Problem Agitation", "Shock/Surprising Fact", "Tutorial Opening")
- "hookText": (string, the likely first 1-2 sentences of the video based on the title and description — write what the creator would say in the first 5 seconds)
- "hookFramework": (string, describe the hook framework used in 10 words or less, e.g. "Direct Question + Pain Point")
- "openingStructure": (string, describe the opening structure: what happens in the first 30-60 seconds. e.g. "Hook → Context → Stakes → Promise")
- "scriptStructure": (string, a NUMBERED LIST of beats in the video, e.g. "Beat 1 — HOOK\\nBeat 2 — STAKES\\nBeat 3 — ITEM 1\\n..." etc. Include at least 6-10 beats based on video duration and content.)
- "storytellingFramework": (string, identify the storytelling framework: "Listicle", "Transformation Arc", "Problem-Solution", "Chronological Journey", "Comparison", "Tutorial Steps", "Investigation/Discovery", "Debate/Analysis")
- "rehooksUsed": (string, describe 2-3 rehook phrases the creator likely uses mid-video to keep retention, e.g. "And by the way...", "But here's where it gets interesting...", "Now this next one is crucial...")
- "retentionPattern": (string, describe the retention curve pattern: "ESCALATION + payoff", "Front-loaded + fade", "Steady reveal", "Cliff-and-climb", "Story arc peaks")
- "ctaPlacement": (string, describe where CTAs likely appear: "Beat 1 (0-5s): Subscribe prompt", "Mid-video mention", "End screen CTA", etc.)
- "keyTakeaways": (string, 2-3 key insights a viewer/creator can learn from how this video is structured)

IMPORTANT: Return ONLY a valid JSON array. No markdown, no code fences, no explanation. Just the raw JSON array.`;

  const text = (await aiComplete(prompt)).trim();

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse batch analysis JSON:', e.message);
    console.error('Raw text (first 300):', cleaned.substring(0, 300));
    return batch.map((_, i) => ({
      videoIndex: batchIndex + i + 1,
      thumbnailDescription: 'Analysis unavailable',
      hookType: 'Unknown', hookText: '', hookFramework: '',
      openingStructure: '', scriptStructure: '', storytellingFramework: '',
      rehooksUsed: '', retentionPattern: '', ctaPlacement: '', keyTakeaways: '',
    }));
  }
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/api/config', (req, res) => {
  res.json({ aiProvider: AI_PROVIDER });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { channelInput } = req.body;
    if (!channelInput?.trim()) return res.status(400).json({ error: 'Please provide a channel URL, handle, or name.' });

    // Step 1: Resolve
    res.write(JSON.stringify({ step: 'resolving', message: 'Resolving channel...' }) + '\n');
    const channelId = await resolveChannelId(channelInput);

    // Step 2: Channel info
    res.write(JSON.stringify({ step: 'fetching_channel', message: 'Fetching channel details...' }) + '\n');
    const channelInfo = await getChannelInfo(channelId);
    const uploadsPlaylistId = channelInfo.contentDetails.relatedPlaylists.uploads;

    res.write(JSON.stringify({
      step: 'channel_found',
      message: `Found: ${channelInfo.snippet.title}`,
      channel: {
        id: channelId, title: channelInfo.snippet.title,
        thumbnail: channelInfo.snippet.thumbnails?.high?.url || channelInfo.snippet.thumbnails?.default?.url,
        subscribers: parseInt(channelInfo.statistics.subscriberCount || 0),
        totalViews: parseInt(channelInfo.statistics.viewCount || 0),
        videoCount: parseInt(channelInfo.statistics.videoCount || 0),
        description: channelInfo.snippet.description?.substring(0, 300),
        createdAt: channelInfo.snippet.publishedAt,
        country: channelInfo.snippet.country || 'Unknown',
      }
    }) + '\n');

    // Step 3: Fetch videos
    res.write(JSON.stringify({ step: 'fetching_videos', message: 'Fetching recent videos...' }) + '\n');
    const videos = await getChannelVideos(channelId, uploadsPlaylistId, 50);
    res.write(JSON.stringify({ step: 'videos_fetched', message: `Fetched ${videos.length} videos` }) + '\n');

    // Step 4: Analyze aggregate
    res.write(JSON.stringify({ step: 'analyzing', message: 'Analyzing video data...' }) + '\n');
    const analysis = analyzeVideoData(videos);

    res.write(JSON.stringify({
      step: 'data_analysis', message: 'Data analysis complete',
      stats: {
        avgViews: analysis.engagement.avgViews, avgLikes: analysis.engagement.avgLikes,
        avgComments: analysis.engagement.avgComments, engagementRate: analysis.engagement.engagementRate,
        avgDuration: analysis.duration.avgMinutes, postingGap: analysis.posting.avgGapDays,
        topVideos: analysis.topVideos.slice(0, 5).map(v => ({ title: v.title, views: v.views, likes: v.likes, thumbnail: v.thumbnail })),
        viewsTrend: analysis.viewsTrend, monthlyUploads: analysis.posting.monthlyUploads,
        duration: analysis.duration, topWords: analysis.titles.topWords, topTags: analysis.tags,
      }
    }) + '\n');

    // Step 5: Per-video deep analysis
    res.write(JSON.stringify({ step: 'deep_analysis', message: `Deep-analyzing ${videos.length} videos with ${AI_PROVIDER.toUpperCase()} AI...` }) + '\n');

    const batchSize = 10;
    const allVideoAnalysis = [];
    const rawVideoData = videos.map((v, i) => ({
      videoNumber: i + 1, title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      views: parseInt(v.statistics.viewCount || 0),
      likes: parseInt(v.statistics.likeCount || 0),
      comments: parseInt(v.statistics.commentCount || 0),
      durationSec: parseDuration(v.contentDetails.duration),
      thumbnailUrl: v.snippet.thumbnails?.maxres?.url || v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || '',
      publishedAt: v.snippet.publishedAt,
      description: v.snippet.description?.substring(0, 300) || '',
      tags: (v.snippet.tags || []).slice(0, 10),
    }));

    for (let i = 0; i < videos.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(videos.length / batchSize);
      res.write(JSON.stringify({ step: 'deep_analysis_batch', message: `Analyzing batch ${batchNum}/${totalBatches}...` }) + '\n');

      try {
        const batchResults = await analyzeVideosBatch(videos, i, batchSize);
        allVideoAnalysis.push(...batchResults);
      } catch (e) {
        console.error(`Batch ${batchNum} failed:`, e.message);
        for (let j = i; j < Math.min(i + batchSize, videos.length); j++) {
          allVideoAnalysis.push({
            videoIndex: j + 1, thumbnailDescription: 'Analysis failed',
            hookType: '-', hookText: '-', hookFramework: '-',
            openingStructure: '-', scriptStructure: '-', storytellingFramework: '-',
            rehooksUsed: '-', retentionPattern: '-', ctaPlacement: '-', keyTakeaways: '-',
          });
        }
      }
    }

    const detailedVideos = rawVideoData.map((raw, i) => {
      const ai = allVideoAnalysis[i] || {};
      return { ...raw,
        thumbnailDescription: ai.thumbnailDescription || '', hookType: ai.hookType || '', hookText: ai.hookText || '',
        hookFramework: ai.hookFramework || '', openingStructure: ai.openingStructure || '',
        scriptStructure: ai.scriptStructure || '', storytellingFramework: ai.storytellingFramework || '',
        rehooksUsed: ai.rehooksUsed || '', retentionPattern: ai.retentionPattern || '',
        ctaPlacement: ai.ctaPlacement || '', keyTakeaways: ai.keyTakeaways || '',
      };
    });

    res.write(JSON.stringify({ step: 'deep_analysis_complete', message: `Detailed analysis complete for ${detailedVideos.length} videos`, detailedVideos }) + '\n');

    // Step 6: AI Report
    res.write(JSON.stringify({ step: 'generating_report', message: 'Generating AI channel report...' }) + '\n');
    const aiReport = await generateAIReport(channelInfo, analysis);

    res.write(JSON.stringify({ step: 'complete', message: 'Analysis complete!', report: aiReport }) + '\n');
    res.end();

  } catch (err) {
    console.error('Analysis error:', err);
    try {
      res.write(JSON.stringify({ step: 'error', message: err.message || 'Analysis failed' }) + '\n');
      res.end();
    } catch { res.status(500).json({ error: err.message || 'Analysis failed' }); }
  }
});

// ─── CSV Export ────────────────────────────────────────────
app.post('/api/export-csv', (req, res) => {
  try {
    const { channelName, videos } = req.body;
    if (!videos?.length) return res.status(400).json({ error: 'No video data' });

    const headers = [
      'Video #', 'Title', 'URL', 'Views', 'Likes', 'Comments',
      'Duration (sec)', 'Thumbnail URL', 'Thumbnail Description',
      'Hook Type', 'Hook Text', 'Hook Framework',
      'Opening Structure', 'Script Structure', 'Storytelling Framework',
      'Rehooks Used', 'Retention Pattern', 'CTA Placement', 'Key Takeaways'
    ];

    const esc = (v) => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };

    let csv = headers.map(esc).join(',') + '\n';
    videos.forEach(v => {
      csv += [v.videoNumber, v.title, v.url, v.views, v.likes, v.comments, v.durationSec, v.thumbnailUrl,
        v.thumbnailDescription, v.hookType, v.hookText, v.hookFramework, v.openingStructure,
        v.scriptStructure, v.storytellingFramework, v.rehooksUsed, v.retentionPattern,
        v.ctaPlacement, v.keyTakeaways].map(esc).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${channelName || 'channel'}_analysis.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ANALYSIS HISTORY / PROMPTS ───────────────────────────────

app.get('/api/prompts', (req, res) => {
  try {
    const promptsDir = join(__dirname, 'prompts');
    const files = readdirSync(promptsDir).filter(f => f.endsWith('.txt'));
    const prompts = files.map(f => ({
      name: f.replace('.txt', '').replace(/-/g, ' '),
      id: f,
      content: readFileSync(join(promptsDir, f), 'utf-8')
    }));
    res.json(prompts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/save-analysis', (req, res) => {
  try {
    const { channel, screenshot, report, promptUsed, videos } = req.body;
    const historyFile = join(__dirname, 'data', 'history.json');
    const id = Date.now().toString();
    
    // Save screenshot
    const imagePath = join(__dirname, 'data', 'screenshots', `cap_${id}.png`);
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    writeFileSync(imagePath, base64Data, 'base64');

    // Update history
    let history = [];
    if (existsSync(historyFile)) {
      history = JSON.parse(readFileSync(historyFile, 'utf-8'));
    }
    
    const entry = {
      id,
      channel,
      screenshot: `/data/screenshots/cap_${id}.png`,
      report: report || '',
      videos: videos || [], // Support for the 18+ metrics array
      promptUsed,
      timestamp: new Date().toISOString()
    };
    
    history.unshift(entry);
    writeFileSync(historyFile, JSON.stringify(history, null, 2));
    
    res.json({ success: true, entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history', (req, res) => {
  try {
    const historyFile = join(__dirname, 'data', 'history.json');
    if (existsSync(historyFile)) {
      res.json(JSON.parse(readFileSync(historyFile, 'utf-8')));
    } else {
      res.json([]);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/update-analysis/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const historyFile = join(__dirname, 'data', 'history.json');
    
    if (!existsSync(historyFile)) return res.status(404).json({ error: 'History not found' });
    
    let history = JSON.parse(readFileSync(historyFile, 'utf-8'));
    const index = history.findIndex(h => h.id === id);
    
    if (index === -1) return res.status(404).json({ error: 'Entry not found' });
    
    // Merge updates (e.g., adding a report while keeping videos, or vice versa)
    history[index] = { ...history[index], ...updateData };
    
    writeFileSync(historyFile, JSON.stringify(history, null, 2));
    res.json({ success: true, entry: history[index] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Transcript Harvester ────────────────────────────────
app.post('/api/get-transcripts', async (req, res) => {
  const { videoIds } = req.body;
  if (!videoIds || !Array.isArray(videoIds)) {
    return res.status(400).json({ error: 'Array of videoIds required' });
  }

  console.log(`YT-to-AI: Fetching transcripts for ${videoIds.length} videos...`);
  
  const results = [];
  for (const id of videoIds) {
    try {
      console.log(`📡 YT-to-AI: Pulling Transcript for ${id}...`);
      
      // Robust Fetch with automated retry logic could be added here
      const transcript = await YoutubeTranscript.fetchTranscript(id);
      
      if (!transcript || transcript.length === 0) {
        throw new Error('Transcript is empty');
      }
      
      // Formatting with timestamps [mm:ss]
      const formatted = transcript.map(part => {
        const totalSeconds = Math.floor(part.offset);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const time = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
        return `${time} ${part.text}`;
      }).join(' ');

      results.push({ id, transcript: formatted });
    } catch (err) {
      console.error(`Failed to fetch transcript for ${id}:`, err.message);
      results.push({ id, transcript: 'No transcript available or disabled.' });
    }
  }
  
  res.json({ success: true, transcripts: results });
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
// Fetch latest analysis for the dashboard
app.get('/api/latest-analysis', (req, res) => {
  const historyPath = path.join(__dirname, 'data', 'analysis_history.json');
  if (!fs.existsSync(historyPath)) return res.json({ success: false, message: 'No history' });
  
  try {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    res.json({ success: true, analysis: history[history.length - 1] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create analysis directory if missing
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const historyPath = path.join(dataDir, 'analysis_history.json');
if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify([]));

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
