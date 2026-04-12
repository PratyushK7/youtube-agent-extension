# Feature Roadmap (Impact-Tier Backlog)

This backlog is organized by impact tier so implementation follows a connected sequence (Now → Next → Later) rather than one-off feature shipping.

## Sequencing Principles

1. **Now**: unblock core onboarding and daily-use loop, instrument everything.
2. **Next**: improve quality and speed once baseline adoption is proven.
3. **Later**: scale collaboration and advanced automation after stable retention.

---

## Now (High Impact / Foundation)

### 1) Guided First-Run Setup & Source Connection
- **User problem**: New users do not know how to connect required services (YouTube context + AI provider) and abandon before first successful run.
- **Entry point in UI**: Extension popup first-launch state (`Get Started`), plus inline banner in YouTube page overlay.
- **Dependencies**:
  - Secure settings storage for API key/provider selection.
  - Permission checks for supported domains/pages.
  - Event pipeline for onboarding analytics.
- **Analytics events to track**:
  - `onboarding_started`
  - `provider_connected`
  - `permissions_granted`
  - `onboarding_completed`
  - `onboarding_abandoned`
- **Success metrics**:
  - **Adoption rate**: `% of new installs completing setup within 24h` (target: 65%+).
  - **Task completion time**: `median time install → first successful analysis` (target: < 4 min).
  - **Retention**: `D7 retention for users who complete onboarding` (target: 35%+).
  - **Error rate**: `% onboarding sessions with blocking error` (target: < 3%).
- **Rollout phase**: **Alpha** (internal + small cohort), then **Beta** at ≥95% setup success.

### 2) One-Click “Analyze Current Video” Workflow
- **User problem**: Users currently need too many manual steps to run analysis, which lowers repeat usage.
- **Entry point in UI**: Primary action button in popup and floating action in YouTube content panel.
- **Dependencies**:
  - Active tab/video metadata capture.
  - Prompt selection defaults.
  - Request/response state handling in popup + content script.
- **Analytics events to track**:
  - `analysis_clicked`
  - `analysis_started`
  - `analysis_completed`
  - `analysis_failed`
  - `analysis_result_copied`
- **Success metrics**:
  - **Adoption rate**: `% weekly active users running ≥1 analysis/week` (target: 55%+).
  - **Task completion time**: `median click → result rendered` (target: < 20 sec).
  - **Retention**: `W4 repeat analysis rate` (target: 45%+).
  - **Error rate**: `% analysis attempts ending in failure/timeout` (target: < 5%).
- **Rollout phase**: **Beta** (existing users first), then **General** when failure rate target is met 2 consecutive weeks.

### 3) Analysis History & Quick Reuse
- **User problem**: Users lose prior outputs and must re-run similar tasks, causing frustration and churn.
- **Entry point in UI**: New `History` tab in popup and `Recent analyses` section in dashboard page.
- **Dependencies**:
  - Persisted result store keyed by video ID and prompt type.
  - Lightweight list/filter UI.
  - Data retention policy and local cache limits.
- **Analytics events to track**:
  - `history_opened`
  - `history_item_viewed`
  - `history_item_reused`
  - `history_item_deleted`
- **Success metrics**:
  - **Adoption rate**: `% active users opening History weekly` (target: 40%+).
  - **Task completion time**: `median time to retrieve prior result` (target: < 10 sec).
  - **Retention**: `D30 retention lift for users with ≥2 history interactions` (target: +8 pts).
  - **Error rate**: `% history loads failing or returning corrupt entries` (target: < 1%).
- **Rollout phase**: **Alpha** (storage validation), then **Beta** once data integrity checks pass.

---

## Next (Medium Impact / Optimization)

### 4) Prompt Presets & Goal-Based Templates
- **User problem**: Users are unsure which prompt to choose for different objectives (script writing, niche bending, scene analysis).
- **Entry point in UI**: Preset selector in popup before running analysis.
- **Dependencies**:
  - Prompt catalog metadata (title, use case, expected output).
  - Template management UI and default recommendations.
  - Versioning for preset changes.
- **Analytics events to track**:
  - `preset_selector_opened`
  - `preset_selected`
  - `preset_analysis_completed`
  - `preset_switched_after_failure`
- **Success metrics**:
  - **Adoption rate**: `% analyses using presets vs custom` (target: 70%+ preset usage).
  - **Task completion time**: `median time from popup open → analysis start` (target: -25% vs baseline).
  - **Retention**: `W4 retention of preset users` (target: +6 pts vs non-preset users).
  - **Error rate**: `% runs producing unusable/empty output by preset` (target: < 4%).
- **Rollout phase**: **Beta** (power users), then **General** with top-performing presets only.

### 5) In-Context Error Recovery & Retry Suggestions
- **User problem**: When failures occur (rate limits, missing context, provider errors), users do not know what to do next.
- **Entry point in UI**: Inline error card in popup/content panel with one-click recovery actions.
- **Dependencies**:
  - Error taxonomy normalization across scripts/background/server.
  - Actionable remediation mapping (retry, switch provider, refresh tab).
  - User-visible status copy and telemetry.
- **Analytics events to track**:
  - `error_shown`
  - `retry_clicked`
  - `recovery_action_selected`
  - `error_recovered`
  - `error_unresolved`
- **Success metrics**:
  - **Adoption rate**: `% failed sessions where a recovery action is attempted` (target: 60%+).
  - **Task completion time**: `median time from error shown → successful completion` (target: < 45 sec).
  - **Retention**: `next-week return rate after users encounter errors` (target: 30%+).
  - **Error rate**: `repeat identical error within same session` (target: < 15%).
- **Rollout phase**: **Alpha** for top 5 error types, then **Beta** for full taxonomy.

### 6) Performance Budget + Progressive Rendering
- **User problem**: Long waits or frozen UI during analysis make the extension feel unreliable.
- **Entry point in UI**: Analysis result panel (loading states, partial output streaming).
- **Dependencies**:
  - Background/content messaging optimization.
  - Request timeout + cancellation controls.
  - Optional token streaming or chunked rendering.
- **Analytics events to track**:
  - `analysis_render_started`
  - `analysis_first_chunk_rendered`
  - `analysis_render_completed`
  - `analysis_cancelled`
- **Success metrics**:
  - **Adoption rate**: `% users who run another analysis in same session after first result` (target: 50%+).
  - **Task completion time**: `p50/p95 time to first visible output` (target: p50 < 8 sec, p95 < 20 sec).
  - **Retention**: `W4 retention among users seeing first chunk <10 sec` (target: +7 pts).
  - **Error rate**: `% client-side render failures/hangs` (target: < 2%).
- **Rollout phase**: **Beta** with feature flag, then **General** after perf SLO stability.

---

## Later (Strategic / Scale)

### 7) Workspace Dashboard with Cross-Video Projects
- **User problem**: Advanced users need a way to organize outputs across multiple videos into project workflows.
- **Entry point in UI**: `Dashboard` web page with project creation from extension outputs.
- **Dependencies**:
  - Project data model and sync strategy.
  - Dashboard IA/navigation updates.
  - Auth/session hardening for web surface.
- **Analytics events to track**:
  - `project_created`
  - `analysis_added_to_project`
  - `project_opened`
  - `project_exported`
- **Success metrics**:
  - **Adoption rate**: `% retained users creating at least one project/month` (target: 25%+).
  - **Task completion time**: `median time to aggregate 3 analyses into one project` (target: < 3 min).
  - **Retention**: `M2 retention for project users` (target: 40%+).
  - **Error rate**: `% failed project save/sync operations` (target: < 2%).
- **Rollout phase**: **Alpha** (internal creators), **Beta** (invited teams), then **General**.

### 8) Team Sharing, Comments, and Review States
- **User problem**: Solo-only workflow blocks team collaboration on analysis outputs.
- **Entry point in UI**: Share action in history/dashboard result views.
- **Dependencies**:
  - Identity and access controls.
  - Comment threads and notification primitives.
  - Audit trail for shared artifacts.
- **Analytics events to track**:
  - `share_link_created`
  - `share_opened`
  - `comment_added`
  - `review_status_changed`
- **Success metrics**:
  - **Adoption rate**: `% project users sharing at least one artifact/week` (target: 30%+).
  - **Task completion time**: `median time to request and receive first review` (target: < 24 h).
  - **Retention**: `M3 retention for collaborative workspaces` (target: +10 pts vs solo).
  - **Error rate**: `% permission/share failures` (target: < 1%).
- **Rollout phase**: **Alpha** (single workspace), **Beta** (multi-user orgs), then **General**.

### 9) Smart Recommendations (Next Best Action)
- **User problem**: Users do not know what to do after receiving an analysis result, reducing downstream value.
- **Entry point in UI**: Recommendation panel beneath analysis output and dashboard insights cards.
- **Dependencies**:
  - Rules/ML recommendation engine with confidence scores.
  - Feedback capture (`helpful/not helpful`).
  - Guardrails to prevent low-quality suggestions.
- **Analytics events to track**:
  - `recommendation_shown`
  - `recommendation_clicked`
  - `recommendation_dismissed`
  - `recommendation_feedback_submitted`
- **Success metrics**:
  - **Adoption rate**: `% sessions with at least one recommendation interaction` (target: 35%+).
  - **Task completion time**: `median time from result view → next action trigger` (target: -30% vs no recommendations).
  - **Retention**: `W8 retention for users with ≥3 recommendation clicks` (target: +9 pts).
  - **Error rate**: `% recommendations marked unhelpful or ignored after click` (target: < 20%).
- **Rollout phase**: **Alpha** (rules-based only), **Beta** (hybrid ranking), **General** after quality threshold is sustained.

---

## Operating Cadence for Roadmap Execution

- Run a **biweekly backlog review** using the above metrics; features move tiers only when current-tier metric targets are stable for two review cycles.
- Use **feature flags** for every item and keep rollout phase explicit in release notes.
- Do not start a Later-tier item until at least 2 of 3 Now-tier features reach retention + error-rate targets.
