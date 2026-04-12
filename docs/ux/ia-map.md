# Information Architecture Map: YouTube Strategic Research Agent

## Objectives and Design Principles

This IA redesign prioritizes the highest-frequency user outcomes and reduces click depth for the top workflows.

### Top user goals
1. **Setup**: Connect environment, confirm readiness, and launch first analysis run quickly.
2. **Monitor**: Track active analysis progress and intervene when needed.
3. **Optimize**: Improve analysis quality, speed, and output depth over repeated runs.
4. **Export/Share**: Package and distribute results to collaborators or external tools.

### Click-minimization principles
- Make the top 3 tasks (**Setup**, **Monitor**, **Export/Share**) reachable in **1 click from any screen**.
- Keep all workflow-critical actions visible at page level through persistent action rails.
- Reduce context switching using section-level tabs instead of deep nested pages.
- Provide universal command/search access to jump directly to entities, runs, and actions.

---

## Primary Navigation (Global)

Use a persistent left rail (desktop) or bottom bar (compact) with clear, task-oriented sections:

1. **Home**
2. **Setup**
3. **Runs**
4. **Library**
5. **Optimize**
6. **Exports**
7. **Settings**

### Why this structure
- **Setup** is explicit to help first-time users complete onboarding without hunting through settings.
- **Runs** is the operational center for live monitoring and run control.
- **Exports** is promoted to top-level to avoid burying share outcomes under history/details.
- **Library** separates historical outputs from active operations, lowering cognitive load.

---

## Contextual Secondary Navigation (Section Tabs)

Each primary section includes concise tabs for local navigation.

### 1) Home
- **Overview** (status, recent runs, shortcuts)
- **Quick Start**
- **Recent Activity**

### 2) Setup
- **Connection Check** (YouTube, ChatGPT, local server)
- **Workspace Defaults** (scan depth, analysis mode, prompt packs)
- **Automation Rules** (auto-sort, fallback transcript behavior)

### 3) Runs
- **Active**
- **Queue**
- **Completed**
- **Failures**

### 4) Library
- **Channels**
- **Reports**
- **Assets** (thumbnails, transcript captures)

### 5) Optimize
- **Prompt Strategy**
- **Quality Insights**
- **Performance Tuning**

### 6) Exports
- **One-Click Share**
- **Formats** (Markdown, JSON)
- **Destinations** (local file, copy, external integrations)

### 7) Settings
- **Profile**
- **Privacy & Data**
- **Advanced**

---

## Global Search / Command Access

Add a universal command bar (`⌘/Ctrl + K`) accessible from every screen.

### Search scope
- Channels
- Runs (active + historical)
- Reports/dossiers
- Actions (Start run, Retry failed, Export latest)
- Settings and feature toggles

### Recommended command examples
- `Start analysis: <channel>`
- `Open active run`
- `Retry last failed transcript fetch`
- `Export latest dossier as markdown`
- `Go to Optimization > Prompt Strategy`

### Interaction rules
- Command bar opens as modal overlay without losing current screen state.
- Top results prioritize actionable commands before static navigation links.
- Recent commands are pinned for repeated operator workflows.

---

## Persistent Page-Level Actions

Every section page should reserve a consistent action area (top-right desktop / sticky footer mobile):

- **Primary CTA**: context-specific main action (single dominant button)
- **Secondary actions**: 2–4 nearby utility actions

### CTA model by section
- Home: **Start New Analysis**
- Setup: **Run Connection Check**
- Runs: **Pause/Resume Run** (depends on active state)
- Library: **Open Latest Dossier**
- Optimize: **Apply Optimization Preset**
- Exports: **Export Latest Report**
- Settings: **Save Changes**

### Secondary action examples
- Duplicate run configuration
- Retry failed step
- Open logs
- Copy share link
- Download JSON

---

## Sitemap

```text
/
├── home
│   ├── overview
│   ├── quick-start
│   └── recent-activity
├── setup
│   ├── connection-check
│   ├── workspace-defaults
│   └── automation-rules
├── runs
│   ├── active
│   ├── queue
│   ├── completed
│   └── failures
├── library
│   ├── channels
│   ├── reports
│   └── assets
├── optimize
│   ├── prompt-strategy
│   ├── quality-insights
│   └── performance-tuning
├── exports
│   ├── one-click-share
│   ├── formats
│   └── destinations
└── settings
    ├── profile
    ├── privacy-data
    └── advanced
```

---

## Key User Journeys

## Journey 1: First-time setup to first successful run (Top task #1)
**Goal**: user completes environment readiness and launches analysis with minimum friction.

1. Open app → lands on **Home > Quick Start**.
2. Click primary CTA: **Start New Analysis**.
3. System detects missing prerequisites and routes to **Setup > Connection Check**.
4. User clicks **Run Connection Check**.
5. On pass, inline success state presents next action: **Start Analysis Now**.
6. User enters channel URL + scan depth, confirms.
7. Auto-redirect to **Runs > Active** with live monitor card visible.

**Expected completion path**: `Home → Setup/Connection Check → Runs/Active`

---

## Journey 2: Monitor and manage active analysis (Top task #2)
**Goal**: user quickly sees run health, progress, and can resolve blockers.

1. From any screen, user opens command bar (`Ctrl+K`) and runs `Open active run`.
2. Lands on **Runs > Active**.
3. Sees progress timeline, current video index, and capture statuses.
4. If issue occurs, uses persistent secondary action **Retry failed step**.
5. On completion, toast + inline link to **Exports > One-Click Share**.

**Expected completion path**: `Global Command → Runs/Active → (optional) Runs/Failures action → Exports`

---

## Journey 3: Export and share latest dossier (Top task #3)
**Goal**: produce collaborator-ready output in one guided flow.

1. User clicks **Exports** from primary nav (single click from anywhere).
2. Defaults to **One-Click Share** tab preloaded with latest completed run.
3. Primary CTA **Export Latest Report** is active by default.
4. User picks format (Markdown/JSON) and destination (download/copy/integration).
5. Success confirmation offers **Copy Link** and **Open in Library** as follow-up actions.

**Expected completion path**: `Primary Nav Exports → One-Click Share → Format/Destination → Success`

---

## Expected Completion Paths for Core Workflows

| Core workflow | Target clicks | Completion path |
|---|---:|---|
| Setup and launch first analysis | 3–5 | Home CTA → Setup Check → Start Analysis → Runs Active |
| Monitor and intervene on active run | 1–3 | Command/Search or Runs nav → Active tab → Retry/Pause/Resume |
| Export/share latest dossier | 1–4 | Exports nav → One-Click Share → Export CTA → Share actions |
| Optimize recurring quality | 2–5 | Optimize nav → Prompt Strategy/Insights → Apply preset |

---

## Navigation Redesign Summary (What changes)

- Promote **Runs** and **Exports** to top-level primary nav to reduce click depth for monitoring and sharing.
- Add section tabs to avoid hidden flows behind deeply nested settings/history pages.
- Introduce global command/search palette for direct task execution, not just page search.
- Standardize persistent page-level CTAs with section-specific primary action and predictable secondary actions.
- Ensure top 3 tasks (setup, monitor, export/share) are always reachable within one nav decision and one action.
