# PDFBull — Production Plan & Design Doc

**Domain:** pdfbull.com
**Category:** Browser-based PDF toolkit (SaaS)
**Date:** 2026-08-16

---

## 1. Executive Summary

PDFBull is a browser-based PDF toolkit — merge, split, compress, convert, edit, sign, and redact PDFs — built to win on three things the market leaders (Smallpdf, iLovePDF, Adobe Acrobat online) are weak on:

1. **Privacy by default.** Common operations (merge, split, rotate, delete pages, basic compress, watermark, protect/unlock) run **entirely client-side via WebAssembly** — files never leave the user's device. Heavier operations (OCR, format conversion, AI) go server-side with a hard **1-hour auto-delete** guarantee, enforced at the storage layer, not just in app logic.
2. **A free tier that isn't a trap.** Competitors gate core actions behind logins, ads, or 1–2 files/day. PDFBull's free tier does unlimited client-side operations with no ads and no account required; server-side ops are capped, not blocked.
3. **Fair, transparent pricing** that undercuts Adobe (~$20+/mo) and matches or beats Smallpdf/iLovePDF (~$9–12/mo), with AI features (summarize, chat-with-PDF, data extraction) as the upsell instead of dark patterns.

The wedge is trust + speed: "processed in your browser, deleted in an hour" is a concrete, verifiable claim in a category where users are handing over passports, contracts, and tax documents to servers they don't trust.

---

## 2. Problem Statement

Real, recurring pain points this product solves:

- **No one wants to install or pay for Acrobat** for a one-off task like merging two PDFs or removing a page.
- **Existing free tools are hostile**: ad-heavy, aggressive upsells, forced logins, daily file caps, slow uploads for something that should be instant.
- **Privacy anxiety is real and justified.** Uploading a signed contract, medical record, or tax form to an unknown server is a legitimate hesitation that costs competitors conversions — and nobody has made privacy a headline feature.
- **Businesses need lightweight e-sign and form-fill** without DocuSign/Adobe Sign enterprise pricing.
- **Students and professionals need format conversion** (PDF↔Word/Excel/PPT) and compression to fit email attachment limits.
- **Mobile is underserved** — camera-to-PDF scanning and on-the-go editing are clunky on most competitors' sites.

---

## 3. Competitive Landscape

| | Smallpdf | iLovePDF | Adobe Acrobat (web) | PDF24 | Sejda | **PDFBull** |
|---|---|---|---|---|---|---|
| Free tier | 2 tasks/day | Limited/ads | Very limited | Generous, dated UX | 3 tasks/day (250 pages) | Unlimited client-side, capped server-side |
| Client-side processing | No | No | No | No | Partial | **Yes, primary path** |
| Auto-delete guarantee | Vague | Vague | Vague | Yes (desktop) | Yes | **Yes — explicit, enforced, marketed** |
| Pricing | ~$9–12/mo | ~$9/mo | ~$20–30/mo | Free/donation | ~$7.50/mo | **$6.99/mo Pro** |
| AI features | Minimal | Minimal | Adobe AI (paid add-on) | None | None | **Summarize, chat, extract (Pro+)** |
| API for developers | Yes (paid) | Yes (paid) | Yes (enterprise) | No | No | **Yes, usage-based** |
| Design/UX polish | High | High | High | Dated | Medium | High, mobile-first |

**Wedge:** privacy positioning + a genuinely usable free tier + fair pricing + AI as upsell, not ads as revenue.

---

## 4. Target Users

1. **Solo professional / freelancer** — contracts, invoices, proposals. Wants speed and no subscription for occasional use.
2. **Student** — assignment conversion, scanned-notes-to-searchable-PDF, compression for submission portals.
3. **Small business ops / HR** — offer letters, forms, lightweight e-signature workflows. Price-sensitive, avoids DocuSign.
4. **Power user / developer** — batch processing, API access, integrates PDFBull into their own workflow/product.

---

## 5. Feature Set (Phased)

### Phase 1 — MVP (client-side first)
Merge · Split · Reorder/Delete pages · Rotate · Compress · PDF→JPG / JPG→PDF · Watermark · Page numbers · Password protect/unlock · Basic redact · Crop.

### Phase 2 — Server-side tools
PDF↔Word · PDF↔Excel · PDF↔PowerPoint · OCR (scanned → searchable/editable) · eSign (self-sign + request signatures) · Fill & Sign forms · Compare two PDFs · Direct text/image editing · Camera-to-PDF scan (mobile PWA).

### Phase 3 — AI & growth
AI Summarize / "Chat with this PDF" · Auto-extract tables/invoice data to CSV/Excel · Translate PDF · PDF/A + accessibility conversion · Batch processing & folders · Team workspaces · Public API · Browser extension ("Edit with PDFBull" right-click) · Google Drive / Dropbox / Slack / Zapier integrations.

### Phase 4 — Enterprise
SSO/SAML · audit logs · admin console · white-label API · volume e-signature · SOC 2 / HIPAA-ready compliance posture.

---

## 6. System Architecture

```
Browser (client-side path)
  └─ WASM workers: pdf-lib, pdfium/pdf.js, MuPDF-wasm, qpdf-wasm
       → merge / split / rotate / compress / protect / watermark
       → no network call for file content

Browser (server-side path)
  └─ Upload (presigned URL, TLS 1.3)
       → API Gateway → Job Queue (Redis/BullMQ)
            → Worker fleet (containerized, autoscaled)
                 - OCR: Tesseract / cloud OCR
                 - Conversion: LibreOffice headless
                 - AI: Claude API (summarize, chat, extract)
            → Object storage (S3-compatible, AES-256, 1hr TTL lifecycle rule)
       → Result URL returned to browser, file purged on schedule

Supporting services
  - Auth (optional, JWT) + Stripe billing
  - Postgres: user/account/billing metadata only — never file content
  - Cloudflare: CDN, WAF, rate limiting
  - Sentry (errors) + Prometheus/Grafana (infra) + Plausible/PostHog (product analytics)
```

**Principle:** every operation that *can* run client-side, does. Server-side is reserved for what genuinely requires it (OCR models, format conversion engines, AI). This keeps infra cost low, keeps the privacy claim true, and makes the free tier sustainable.

---

## 7. Security, Privacy & Compliance

- TLS 1.3 in transit, AES-256 at rest.
- **Auto-delete enforced at the storage lifecycle layer** (not just an app-level cron job) — default 1 hour, configurable down.
- No human review of uploaded files, contractually and technically (no admin file browser in the product).
- Malware scan on upload (ClamAV); reject and purge on detection.
- GDPR/CCPA: data processing agreement, EU storage region option, self-serve right-to-erasure endpoint.
- SOC 2 Type II process targeted for Year 2, ahead of enterprise sales motion.
- Regular dependency scanning (Dependabot/Snyk), scheduled pen-testing, WAF + rate limiting against scraping/abuse.

---

## 8. Monetization & Pricing

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Unlimited client-side tools, 3 server-side ops/day, 25MB file cap, no ads |
| **Pro** | $6.99/mo ($59/yr) | Unlimited server ops, 200MB files, batch processing, AI summarize (limited), 5GB cloud history |
| **Business** | $14.99/user/mo | Team workspace, eSign requests, API access, branding, 50GB storage |
| **Enterprise** | Custom | SSO/SAML, audit logs, SLA, white-label, dedicated support |
| **Developer API** | Usage-based | Per-conversion/per-OCR-page pricing |

Revenue model is subscription-first with a usage-based API tier; no ad revenue, which is itself part of the trust pitch.

---

## 9. UX/UI Principles

- Every tool is its own fast, single-purpose page — drag-and-drop, no forced login, mobile-first.
- Trust badges on every tool page: "Processed in your browser" or "Auto-deleted in 1 hour."
- Advanced options (compression level, OCR language) collapsed by default — progressive disclosure.
- WCAG 2.1 AA accessibility, dark mode, consistent component library.
- Perceived performance: optimistic UI, real progress for WASM operations, streamed results.

---

## 10. SEO & Growth Strategy

- **Programmatic SEO** is the primary growth channel: a dedicated, indexable landing page per tool (`/merge-pdf`, `/compress-pdf`) and per use-case (`/compress-pdf-for-email`, `/merge-pdf-on-iphone`) — these terms carry millions of monthly searches and are currently dominated by ad-heavy incumbents.
- Long-tail content/guides around PDF workflows; a template library (resumes, invoices) for organic backlinks.
- PWA + browser extension for retention and repeat visits without repeat search.
- Referral program; Drive/Dropbox picker integrations to lower friction.
- Paid search only after organic base is established, targeted at high-intent long-tail terms competitors under-serve.

---

## 11. Infrastructure & DevOps

- CI/CD via GitHub Actions: preview → staging → prod, Playwright e2e per tool.
- Terraform for infra-as-code; containerized workers autoscaled by queue depth.
- Multi-region CDN (Cloudflare); primary US region, EU secondary for data residency.
- Because files are never stored long-term by design, storage cost stays low — the dominant variable cost is **compute** for OCR/conversion/AI, so per-operation cost is the key metric to watch for free-tier sustainability.

---

## 12. Roadmap

| Phase | Timeframe | Focus |
|---|---|---|
| 0 — Foundation | Weeks 1–4 | Design system, Next.js scaffold, WASM merge/split/compress/rotate live, CDN, analytics, waitlist |
| 1 — Core Launch | Weeks 5–10 | Convert (Word/JPG), protect/unlock, watermark, Stripe + Pro tier, SEO for top 20 keywords, mobile PWA |
| 2 — Server Tools & Scale | Weeks 11–18 | OCR, eSign, fill & sign, compare, direct edit; Business tier; API v1; load testing |
| 3 — AI & Growth | Weeks 19–26 | AI summarize/chat-with-PDF, data extraction, translate; browser extension; integrations; referral program |
| 4 — Enterprise | Month 7+ | SSO/SAML, audit logs, SOC 2, white-label, i18n |

---

## 13. Team & Budget (lean path)

- **Bootstrapped path:** 1 founder/full-stack + 1 contract designer + 1 backend/infra contractor (OCR/convert workers) → MVP in ~10–12 weeks.
- **Small-team path:** 2 FE, 2 BE, 1 designer, 1 PM/growth → Phases 0–2 in ~12 weeks.
- **Launch infra cost estimate:** $150–500/mo (Cloudflare, hosting, storage, AI API calls), scaling with usage.
- Key paid tools: Stripe, Sentry, Plausible/PostHog, Claude API, cloud compute (AWS/GCP).

---

## 14. Success Metrics

- Activation: >60% of visitors complete a tool action.
- Free→Paid conversion: 2–4% (industry norm for freemium PDF tools is ~1–3%).
- Organic traffic growth and keyword rank tracking for top 50 target terms.
- Client-side operation latency budget: <3s for a 10MB file.
- Pro-tier monthly churn: <5%.
- Trust perception via periodic NPS/privacy-perception survey.

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Commoditized market, low differentiation | Lead with privacy + speed positioning, AI upsell, fair pricing |
| Abuse: spam/malware uploads, scraping | Rate limiting, malware scan, WAF, CAPTCHA on abuse patterns |
| Compute cost spike from free-tier OCR/AI usage | Daily caps, file-size caps, queue prioritization for paid users |
| SEO dependency / algorithm risk | Diversify via extension, direct traffic, email list, integrations |
| Legal/compliance handling sensitive documents | Strong ToS, enforced auto-delete, no data resale, cyber insurance |
