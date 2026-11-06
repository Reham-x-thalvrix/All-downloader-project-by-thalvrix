# All Downloader

A mobile-friendly web interface with a Node.js + yt-dlp backend.

## Features
- Video information preview
- Best available, 1080p, 720p, 480p and 360p options
- MP3 audio extraction
- No API key required
- Docker deployment configuration for Render

## Run locally
Requirements: Node.js 20+, Python 3, yt-dlp and FFmpeg.

```bash
pip install -U yt-dlp
# Install FFmpeg using your operating system's package manager
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy on Render
1. Upload this project to a GitHub repository.
2. In Render, choose **New > Blueprint** and connect the repository.
3. Render reads `render.yaml` and builds the Docker image.
4. Open the generated service URL.

The Docker image installs yt-dlp and FFmpeg automatically. No API key is needed.

## API
- `POST /api/info` JSON: `{"url":"https://..."}`
- `POST /api/download` JSON: `{"url":"https://...","format":"best"}`

Supported format values: `best`, `1080`, `720`, `480`, `360`, `audio`.

## Important
Use only for content you own, public-domain content, or content you are authorized to download. Respect platform terms and copyright law. This project does not provide DRM circumvention, private-content access, login-cookie support, or playlist downloads.

For public hosting, add stronger abuse prevention, authentication, monitoring and storage limits before production use. The included rate limit and concurrent-download cap are basic safeguards, not a complete public-service security solution.
