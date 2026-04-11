# YouTube Strategic Research Agent: Requirements & Architecture

## 1. Project Objective
Deliver a high-precision, automated strategic research tool that transforms a YouTube channel's content into a comprehensive strategic dossier. The agent must orchestrate a sequential analysis of the top 5+ videos, harvesting high-fidelity thumbnails and full transcripts, and synthesizing them into a master strategic SOP within ChatGPT.

---

## 2. Core Functional Requirements

### 🤖 2.1 Sequential Analysis Engine (SAE)
- **Multi-Video Scoping**: Capability to analyze between 1 and 10 videos sequentially (default: 5).
- **Auto-Navigation**: Automates sorting (Popular/Latest) and navigating to individual video pages.
- **Queue Management**: Persistent cross-tab state machine to track research progress across YouTube and ChatGPT.

### 📸 2.2 High-Fidelity Harvester
- **Multi-Stage Thumbnail Harvest**: Cycles through `maxresdefault` -> `hqdefault` -> `0.jpg`.
- **Integrity Validation**: Real-time file-size check (>2.5KB) to reject gray "broken" placeholders.
- **Pulse-Paste Injection**: Programmatic clipboard simulation (ClipboardEvent) for reliable high-res image injection into ChatGPT.

### 📜 2.3 strategic Transcript Relay
- **Uncut Delivery**: Zero-truncation transcript capture for maximum strategic context.
- **Visual Fallback Logic**: If transcripts are blocked/unavailable, the agent must automatically pivot to "Visual-First" analysis based on Title and Screen Captures.
- **Timestamp Recalibration**: High-precision `[mm:ss]` formatting aligned with YouTube's second-based delivery.

### 🔇 2.4 Silent Operation (Cinematic Pass)
- **Mute-Lock**: Automatic tab muting (`muted = true`) immediately upon detection.
- **Auto-Pause**: Force-pause video playback to ensure a silent, focused environment.
- **Anti-Play Shield**: Persistent event listeners to prevent YouTube from auto-resuming during data harvest.

### 🖥️ 2.5 Heads-Up-Display (HUD)
- **Scan Depth Selector**: Direct UI injection on YouTube channel pages to select research intensity.
- **Research Progress Bar**: Real-time progress tracking (1-10) injected at the top of the ChatGPT window.
- **Status Toasts**: Non-intrusive "Strategic Data Captured" notifications for 100% sync confidence.

---

## 3. Technical Requirements

### 🛠️ 3.1 Architecture (MV3 Stack)
- **Chrome Extension (Manifest V3)**:
  - **Background Orchestrator**: Async/Await state machine for flow control.
  - **Injected Content Scripts**: YouTube Harvester, Player Silencer, and ChatGPT Analyst.
- **Node.js Local Server**:
  - **Port**: `3005` (Binding to `127.0.0.1`).
  - **Transcript Engine**: `youtube-transcript` with stealth-header reinforcement.
  - **Storage**: JSON-based local history (`data/analysis_history.json`).

### 📊 3.2 Strategic Dashboard
- **Glassmorphic UI**: Premium visualization of research history.
- **Auto-Load Logic**: Dynamic loading of the most recent Strategic Dossier on startup.
- **Data Schema**: Support for full strategic JSON arrays and markdown-based synthesis reports.

---

## 4. User Experience (UX) Goals
- **Wow Factor**: Cinematic UI injection and smooth transitions between YouTube and ChatGPT.
- **Zero Friction**: One-click "Analyze Channel" command triggers the entire multi-video loop.
- **Reliability**: Self-healing data capture that handles platform restrictions (ad-blockers, missing captions) gracefully.

---

## 5. Security & Authentication
- **Local-First**: Data remains on the user's local machine via the `3005` hub.
- **Credential Storage**: Git `.gitignore` management to protect private logs and environment keys.
- **Origin Protection**: Restricted CORS policies to prevent unauthorized data access.
