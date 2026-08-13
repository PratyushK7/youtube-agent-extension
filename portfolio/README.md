# Pratyush Kumar — Portfolio

A static, dependency-free personal portfolio site (plain HTML/CSS/JS — no build step).

## Local preview

```bash
cd portfolio
npx serve .
# or just open index.html in a browser
```

## Deploy to Vercel

### Option A — Vercel CLI

```bash
cd portfolio
npx vercel --prod
```

### Option B — Import via Vercel dashboard

1. Go to https://vercel.com/new
2. Import the `pratyushk7/youtube-agent-extension` GitHub repo
3. Set **Root Directory** to `portfolio`
4. Framework preset: **Other** (no build command needed)
5. Deploy

## Structure

```
portfolio/
├── index.html      # all sections/content
├── styles.css       # design system + responsive layout
├── script.js        # scroll reveal, nav, animated stats
├── assets/
│   └── Pratyush_Kumar_Resume.pdf
└── vercel.json       # security headers, clean URLs
```
