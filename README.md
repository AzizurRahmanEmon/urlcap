# URLCAP

Turn any webpage into a screenshot, GIF, or short video — entirely in your browser. No backend, no uploads, no hosting bill.

## Why no backend?

A browser can't screenshot a different website directly (CORS / X-Frame-Options block that on purpose). So instead of pretending to auto-scrape a URL, this app uses the **Screen Capture API** — the same permission-based API behind "Share screen" in Zoom/Meet:

1. You paste a URL and click **Open tab** — it opens in a new browser tab.
2. Click **Start capture** — your browser asks you to pick that tab.
3. It records live, all in-memory in your tab. Stop it whenever, and it exports a **PNG screenshot**, an **animated GIF**, or a **WebM video** — encoded client-side, downloaded straight to your machine.

Nothing is ever sent to a server. This app has none.

## Running it

```bash
npm install
npm run dev       # http://localhost:3000
```

## Building for production (static export)

```bash
npm run build      # outputs a fully static site to ./out
```

The `out/` folder is plain HTML/CSS/JS. Drop it on any static host (GitHub Pages, Netlify, Vercel static, Cloudflare Pages, or just open `out/index.html` locally) — there's no server runtime required.

## Browser support

Requires the Screen Capture API (`getDisplayMedia`): recent desktop Chrome, Edge, or Firefox. Safari's support is limited and mobile browsers generally don't support tab capture at all — use a desktop browser for capturing.

## Notes on output quality

- **GIF** samples frames at ~8fps and scales to a max width of 640px to keep file sizes social-media-friendly. Tune `GIF_FRAME_MS` and `MAX_GIF_WIDTH` in `app/Capture.tsx` if you want higher fidelity (bigger files).
- **Video** exports as WebM (VP9/VP8) since that's what `MediaRecorder` can encode natively in-browser without extra libraries. Most social platforms accept WebM, but if you specifically need MP4, run the downloaded file through a converter (e.g. `ffmpeg -i in.webm out.mp4`) afterward.
