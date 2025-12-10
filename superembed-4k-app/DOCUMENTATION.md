# SuperEmbed 4K Streaming Application - Complete Documentation

> **Purpose**: This document serves as the **single source of truth** for any AI agent continuing work on this project.  
> **Last Updated**: 2025-12-11  
> **Status**: Fully functional with embedded subtitle extraction working  
> **Critical**: Read the [Subtitle System](#subtitle-system-critical) section carefully - it was the most complex part to implement.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Backend - scraper.js](#backend---scraperjs)
5. [Frontend Application](#frontend-application)
6. [Subtitle System (Critical)](#subtitle-system-critical)
7. [API Endpoints](#api-endpoints)
8. [TypeScript Interfaces](#typescript-interfaces)
9. [How to Run](#how-to-run)
10. [Debugging & Logging](#debugging--logging)
11. [Known Issues & Solutions](#known-issues--solutions)
12. [Configuration](#configuration)
13. [Dependencies](#dependencies)
14. [Future Improvements](#future-improvements)
15. [Quick Reference](#quick-reference)

---

## Project Overview

### What This Application Does

This is a **streaming aggregator application** that:
1. Takes a TMDB ID (movie or TV show) from the user
2. Uses a headless browser (`puppeteer-real-browser`) to navigate to `multiembed.mov`
3. Handles interstitial ads, popups, and countdowns automatically
4. Selects the **vipstream-S server** (provides HD/4K quality)
5. Extracts M3U8 video URLs from network requests
6. Extracts **embedded subtitles** from the source PlayerJS config (perfectly synced)
7. Proxies the M3U8 stream and subtitles through the backend to handle CORS
8. Plays the video in a custom HLS.js-based player with full controls

### Why Embedded Subtitles Matter

**The core problem we solved**: The Subdl API provides generic subtitle files that are often **out of sync** with the video because they're matched by movie name, not the specific video source.

**Our solution**: Extract embedded subtitles directly from the vipstream-S player config. These are the same subtitles the source player uses, so they're **perfectly synced**.

### Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Frontend Framework | Next.js | 16.0.8 |
| React | React | 19.2.1 |
| Styling | Tailwind CSS | 4.1.17 (v4 syntax) |
| Video Player | HLS.js | 1.6.15 |
| Subtitle Processing | JSZip | 3.10.1 |
| Backend | Express | 4.19.2 |
| Browser Automation | puppeteer-real-browser | 1.4.4 |
| HTTP Client | Axios | 1.6.7 |
| Icons | Material Symbols | (via Google Fonts) |

---

## Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                 │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js Frontend (http://localhost:3000)                          │  │
│  │                                                                     │  │
│  │  ┌───────────────────┐      ┌─────────────────────────────────┐   │  │
│  │  │  StreamContainer  │─────▶│         MoviePlayer             │   │  │
│  │  │  - Calls API      │      │  - HLS.js playback              │   │  │
│  │  │  - Manages state  │      │  - Quality selection            │   │  │
│  │  │  - Background     │      │  - Subtitle tracks              │   │  │
│  │  │    subtitle load  │      │  - Mobile gestures              │   │  │
│  │  └─────────┬─────────┘      │  - Brightness/Volume controls   │   │  │
│  │            │                 └─────────────────────────────────┘   │  │
│  │            │                                                        │  │
│  │  ┌─────────▼─────────┐      ┌─────────────────────────────────┐   │  │
│  │  │ SuperEmbedService │      │      SubtitleService            │   │  │
│  │  │ - HTTP client     │      │  - Embedded VTT handling        │   │  │
│  │  │ - Retry logic     │      │  - Subdl ZIP extraction         │   │  │
│  │  │ - 429 handling    │      │  - SRT → VTT conversion         │   │  │
│  │  └───────────────────┘      │  - Quality scoring              │   │  │
│  │                              └─────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP API calls
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                 Backend Server (http://localhost:7860)                    │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Express API Server                                                 │  │
│  │                                                                     │  │
│  │  Endpoints:                                                         │  │
│  │  • GET /api/extract      - Main extraction (M3U8 + Subtitles)      │  │
│  │  • GET /api/proxy/m3u8   - Proxies HLS playlist (rewrites URLs)    │  │
│  │  • GET /api/proxy/segment- Proxies video segments + VTT files      │  │
│  │  • GET /health           - Health check                             │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Puppeteer Real Browser (Stealth Mode Chromium)                     │  │
│  │                                                                     │  │
│  │  Automation Flow:                                                   │  │
│  │  1. Navigate to multiembed.mov/directstream.php                    │  │
│  │  2. Handle Skip Ad overlay (if present)                            │  │
│  │  3. Click Play button to reveal servers                            │  │
│  │  4. Click SERVERS dropdown                                          │  │
│  │  5. Select vipstream-S server                                       │  │
│  │  6. Handle Access Content countdown (10-15s)                        │  │
│  │  7. Handle any additional Skip Ad overlays                          │  │
│  │  8. Click play in PlayerJS iframe                                   │  │
│  │  9. Capture M3U8 from network requests                             │  │
│  │  10. Parse subtitle config from vfx.php response                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  State Management                                                   │  │
│  │                                                                     │  │
│  │  • browserInstance  - Reused Chromium instance                     │  │
│  │  • pageInstance     - Reused page (navigates to about:blank)       │  │
│  │  • isExtracting     - Lock to prevent concurrent extractions       │  │
│  │  • lastExtractionId - Track content changes for browser restart    │  │
│  │  • foundM3U8        - Captured M3U8 URL                            │  │
│  │  • embeddedSubtitles- Subtitles from PlayerJS config               │  │
│  │  • foundSubtitles   - Subtitles from network requests              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Network requests
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          External Sources                                 │
│                                                                           │
│  Source Domains:                                                          │
│  • multiembed.mov          - Entry point, embed player                   │
│  • streamingnow.mov        - VIPStream player host                       │
│  • vipstream_vfx.php       - PlayerJS config (contains subtitles!)       │
│  • cca.megafiles.store     - Embedded VTT subtitle files                 │
│  • *.workers.dev           - CDN for M3U8 streams                        │
│  • *.kalis393fev.com       - CDN for video segments                      │
│                                                                           │
│  Fallback Subtitle Source:                                                │
│  • api.subdl.com           - External API (may have sync issues)         │
│  • dl.subdl.com            - ZIP download (requires extraction)          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
c:\Users\VASU\Desktop\stream\superembed-4k-app\
│
├── backend/                          # Backend Express server
│   ├── scraper.js                    # Main server (1358 lines) - extraction logic
│   ├── package.json                  # Backend dependencies (ES modules)
│   ├── package-lock.json
│   ├── node_modules/
│   └── chrome_data/                  # Chromium user data (cookies, etc.)
│
├── src/                              # Frontend source
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Main page - movie grid and search
│   │   ├── layout.js                 # Root layout with fonts
│   │   └── globals.css               # Tailwind CSS v4 styles
│   │
│   ├── components/
│   │   ├── player/
│   │   │   ├── MoviePlayer.tsx       # HLS.js video player (1167 lines)
│   │   │   ├── StreamContainer.tsx   # Extraction orchestration (198 lines)
│   │   │   └── NativePlayer.css      # Player-specific styles
│   │   └── ui/
│   │       ├── Hero.tsx              # Hero section with featured content
│   │       ├── MovieCard.tsx         # Individual movie card
│   │       ├── SearchBar.tsx         # TMDB search functionality
│   │       └── [other UI components]
│   │
│   ├── services/
│   │   ├── SuperEmbedService.js      # Frontend API client (136 lines)
│   │   └── SubtitleService.ts        # Subtitle processing (323 lines)
│   │
│   ├── types/
│   │   └── stream.ts                 # TypeScript interfaces (42 lines)
│   │
│   └── utils/
│       └── VideoEnhancer.ts          # WebGL video enhancement (optional)
│
├── public/                           # Static assets
├── package.json                      # Frontend dependencies
├── tsconfig.json                     # TypeScript config
├── tailwind.config.ts                # Tailwind v4 config
├── postcss.config.js                 # PostCSS for Tailwind
├── next.config.ts                    # Next.js config
└── DOCUMENTATION.md                  # THIS FILE
```

---

## Backend - scraper.js

### Location
`c:\Users\VASU\Desktop\stream\superembed-4k-app\backend\scraper.js`

### Module Type
ES Modules (`"type": "module"` in package.json)

### Port
**7860** (configurable via `PORT` environment variable)

### Key Configuration

```javascript
// URLs for movie/TV
const CONFIG = {
    getMovieUrl: (tmdbId, imdbId) => {
        const videoId = tmdbId || imdbId;
        return `https://multiembed.mov/directstream.php?video_id=${videoId}&tmdb=${tmdbId ? 1 : 0}`;
    },
    getTvUrl: (tmdbId, imdbId, season, episode) => {
        const videoId = tmdbId || imdbId;
        return `https://multiembed.mov/directstream.php?video_id=${videoId}&tmdb=${tmdbId ? 1 : 0}&s=${season}&e=${episode}`;
    }
};

// Subdl API (fallback subtitle source)
const SUBDL_CONFIG = {
    apiKey: '8kyy_Cl0S7OJnXPdVAAkxeKE5dFhkKXr',
    baseUrl: 'https://api.subdl.com/api/v1/subtitles',
    downloadBase: 'https://dl.subdl.com/subtitle'
};
```

### Browser Configuration

```javascript
const { browser, page } = await connect({
    headless: false,           // Visible for anti-detection
    turnstile: true,           // Cloudflare bypass
    fingerprint: true,         // Browser fingerprint spoofing
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,720'
    ]
});
```

### Extraction Flow (Detailed Steps)

| Step | Code Location | Action | Details |
|------|---------------|--------|---------|
| 1 | Lines 347-425 | Handle Interstitial Ad | Looks for "Skip ad" button, waits for countdown if present |
| 2 | Lines 431-445 | Verify Ad Cleared | Double-checks interstitial is gone |
| 3 | Lines 451-529 | Click Play Button | Uses mouse movement + click to mimic human |
| 4 | Lines 534-583 | Handle Player Iframe | Clicks PlayerJS play button inside iframe |
| 5 | Lines 589-728 | Select VIPStream-S | Opens SERVERS dropdown, finds and clicks vipstream-S |
| 6 | Lines 734-785 | Handle Access Content | Waits for 10-15 second countdown |
| 7 | Lines 789-865 | Handle Skip Ad (again) | May appear after server switch |
| 8 | Lines 870-988 | Click Play in Frame | Final play button in vipstream iframe |
| 9 | Lines 993-1040 | Wait for M3U8 | Monitors network for .m3u8 URL |
| 10 | Lines 1043-1161 | Extract Subtitles | Clicks settings → subtitles in player menu |

### Network Response Handler (Lines 262-327)

This is where the magic happens for capturing M3U8 and embedded subtitles:

```javascript
const responseHandler = async (response) => {
    const url = response.url();
    
    // Capture M3U8 URLs
    if (url.includes('.m3u8') && !url.includes('blob:')) {
        foundM3U8 = url;
        capturedReferer = response.request().headers()['referer'] || page.url();
    }
    
    // Extract subtitle config from vfx.php
    if (url.includes('vfx.php')) {
        const body = await response.text();
        
        // Pattern: "subtitle":"[English]url,[Dutch]url,..."
        const subtitleMatch = body.match(/"subtitle"\s*:\s*"([^"]+)"/);
        if (subtitleMatch && subtitleMatch[1]) {
            const parsed = parseSubtitleConfig(subtitleMatch[1]);
            embeddedSubtitles.push(...parsed);
        }
    }
    
    // Also capture direct VTT/SRT from network
    if (url.includes('.vtt') || url.includes('.srt')) {
        foundSubtitles.push({ label: 'English', file: url, source: 'network' });
    }
};
```

### Subtitle Config Parser

```javascript
const parseSubtitleConfig = (subtitleStr) => {
    const results = [];
    // Match: [Language]https://...vtt
    const regex = /\[([^\]]+)\](https?:\/\/[^\s,\[\]]+\.vtt)/g;
    let match;
    while ((match = regex.exec(subtitleStr)) !== null) {
        const lang = match[1].trim();
        const url = match[2].trim();
        // Only keep English subtitles
        if (lang.toLowerCase().includes('english') || lang.toLowerCase() === 'en') {
            results.push({
                label: lang,
                lang: 'en',
                file: url,
                source: 'embedded'  // Important: marks as synced
            });
        }
    }
    return results;
};
```

### Subtitle Priority System (Lines 1196-1228)

```javascript
// PRIORITY 1: Embedded subtitles (from PlayerJS config - perfectly synced)
if (embeddedSubtitles.length > 0) {
    finalSubtitles = embeddedSubtitles.map(sub => ({
        ...sub,
        // Proxy to avoid CORS
        file: `${proxyBase}/api/proxy/segment?url=${encodeURIComponent(sub.file)}&referer=...`
    }));
}
// PRIORITY 2: Direct network subtitles
else if (foundSubtitles.length > 0) {
    finalSubtitles = foundSubtitles.map(sub => ({...sub, file: proxied}));
}
// PRIORITY 3: Subdl API (may have sync issues)
else {
    finalSubtitles = await fetchSubtitlesFromSubdl(tmdbId, type, season, episode);
}
```

### Popup Handler

```javascript
// Automatically closes any popup windows
const popupHandler = async (target) => {
    if (target.type() === 'page') {
        const newPage = await target.page();
        if (newPage && newPage !== mainPage) {
            await newPage.close();
            await mainPage.bringToFront();
        }
    }
};
browser.on('targetcreated', popupHandler);
```

---

## Frontend Application

### StreamContainer.tsx

**Path**: `src/components/player/StreamContainer.tsx`

**Purpose**: Orchestrates the extraction and manages player state

**Key Implementation Details**:

```typescript
// 1. Start playback IMMEDIATELY (don't wait for subtitles)
setStream({
    success: true,
    m3u8Url: result.m3u8Url,
    subtitles: [],  // Empty initially
    referer: result.referer
});
setLoading(false);  // User sees video immediately

// 2. Process subtitles in BACKGROUND
processSubtitles(result.subtitles)
    .then(processedSubtitles => {
        // Update stream with subtitles when ready
        setStream(prev => ({
            ...prev,
            subtitles: processedSubtitles.map((sub, i) => ({
                label: sub.label,
                file: sub.vttUrl,
                default: i === 0  // First = best quality = default
            }))
        }));
    });
```

### MoviePlayer.tsx

**Path**: `src/components/player/MoviePlayer.tsx`

**Purpose**: Full-featured video player with HLS.js

**Critical Video Element**:
```jsx
<video
    ref={videoRef}
    crossOrigin="anonymous"  // REQUIRED for cross-origin subtitle tracks
    className="w-full h-full"
    style={{ filter: `brightness(${brightness})` }}
/>
```

**Quality Level Detection (Lines 383-450)**:

```typescript
// If manifest doesn't include resolution, infer from bitrate
if (!height && level.bitrate) {
    if (level.bitrate >= 12000000) height = 2160; // 4K
    else if (level.bitrate >= 8000000) height = 1440; // 2K
    else if (level.bitrate >= 4000000) height = 1080;
    else if (level.bitrate >= 2500000) height = 720;
    // ...
}

// Force highest quality by default
const highestQuality = qualityList[0];
hls.currentLevel = highestQuality.index;
hls.startLevel = highestQuality.index;
hls.loadLevel = highestQuality.index;
```

**Subtitle Loading (Lines 521-582)**:

```typescript
const addSubtitleTracks = (video: HTMLVideoElement) => {
    extracted.subtitles.forEach((sub, index) => {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = sub.label;
        track.srclang = 'en';
        track.src = sub.file;  // Proxied URL
        track.default = index === 0;
        
        // Event listeners for debugging
        track.addEventListener('load', () => {
            if (index === 0) {
                video.textTracks[0].mode = 'showing';
            }
        });
        track.addEventListener('error', (e) => {
            console.error(`Track load error: ${sub.label}`, e);
        });
        
        video.appendChild(track);
    });
};
```

**Dynamic Subtitle Updates (Lines 584-594)**:

```typescript
// Watch for subtitle changes (background loading)
useEffect(() => {
    const video = videoRef.current;
    if (!video || !extracted.subtitles || extracted.subtitles.length === 0) return;
    
    // Skip if tracks already added
    if (video.textTracks.length === extracted.subtitles.length) return;
    
    addSubtitleTracks(video);
}, [extracted.subtitles]);
```

**Mobile Gesture Controls**:
- Swipe left side of screen: Brightness adjustment
- Swipe right side of screen: Volume adjustment
- Works in fullscreen mode

### SubtitleService.ts

**Path**: `src/services/SubtitleService.ts`

**Purpose**: Process subtitles from different sources

**Key Functions**:

| Function | Purpose |
|----------|---------|
| `processSubtitle()` | Process single subtitle (embedded or Subdl) |
| `processSubtitles()` | Process all subtitles in parallel |
| `convertSrtToVtt()` | Convert SRT format to WebVTT |
| `convertAssToVtt()` | Convert ASS/SSA format to WebVTT |
| `calculateQualityScore()` | Score subtitle based on label keywords |
| `cleanupSubtitleUrls()` | Revoke blob URLs to prevent memory leaks |

**Quality Scoring System**:

```typescript
function calculateQualityScore(label: string): number {
    let score = 0;
    const lower = label.toLowerCase();
    
    // Resolution keywords
    if (lower.includes('4k') || lower.includes('2160')) score += 100;
    if (lower.includes('1080')) score += 80;
    if (lower.includes('720')) score += 60;
    
    // Quality keywords
    if (lower.includes('bluray') || lower.includes('blu-ray')) score += 50;
    if (lower.includes('remux')) score += 40;
    if (lower.includes('web-dl') || lower.includes('webdl')) score += 30;
    if (lower.includes('hdr') || lower.includes('dv')) score += 20;
    
    // Hearing impaired penalty
    if (lower.includes('.hi.') || lower.includes('sdh')) score -= 10;
    
    return score;
}
```

**Embedded vs Subdl Handling**:

```typescript
export async function processSubtitle(subtitle: SubdlSubtitle) {
    // EMBEDDED: Direct VTT URL (quality score 1000 - always first!)
    if (subtitle.source === 'embedded' || subtitle.source === 'network') {
        if (subtitle.file.includes('.vtt')) {
            return {
                label: subtitle.label === 'English' ? 'English • Synced' : subtitle.label,
                vttUrl: subtitle.file,  // Use directly
                quality: 1000  // Highest priority
            };
        }
    }
    
    // SUBDL: ZIP file that needs extraction
    const response = await fetch(subtitle.file);
    const zip = await JSZip.loadAsync(await response.blob());
    // Find and extract SRT/VTT file...
    // Convert to VTT if needed...
    // Return blob URL
}
```

### SuperEmbedService.js

**Path**: `src/services/SuperEmbedService.js`

**Key Features**:
- Retry logic for 429 (extraction in progress)
- Max 12 retries with 5-second delay
- Health check method
- Quality detection from URL

```javascript
// Handle "extraction in progress" - wait and retry
if (response.status === 429) {
    retryCount++;
    console.log(`Extraction in progress, waiting... (attempt ${retryCount}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    continue;
}
```

---

## Subtitle System (Critical)

### Why This Was Complex

1. **Subdl API subtitles are often out of sync** - they're generic files not matched to the specific video
2. **The source player has perfectly synced subtitles** - but they're embedded in JavaScript config
3. **CORS prevents direct access** - must proxy through backend
4. **Format is unusual** - `"subtitle":"[English]url,[Dutch]url,..."`

### The Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBTITLE EXTRACTION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Backend intercepts vfx.php response                         │
│     └── Response body contains PlayerJS config                  │
│                                                                  │
│  2. Parse subtitle config with regex                            │
│     └── /"subtitle"\s*:\s*"([^"]+)"/                            │
│                                                                  │
│  3. Extract the subtitle string                                 │
│     └── "[English]https://cca.megafiles.store/.../....vtt,      │
│          [Dutch]https://cca.megafiles.store/.../....vtt,..."    │
│                                                                  │
│  4. Parse individual language URLs                              │
│     └── /\[([^\]]+)\](https?:\/\/[^\s,\[\]]+\.vtt)/g            │
│     └── Extract only English                                    │
│                                                                  │
│  5. Proxy the URL for CORS                                      │
│     └── /api/proxy/segment?url=...&referer=...                  │
│                                                                  │
│  6. Return to frontend with source: 'embedded'                  │
│     └── Frontend gives quality score 1000                       │
│     └── Always sorted first                                     │
│     └── Label: "English • Synced"                               │
│                                                                  │
│  7. Frontend adds as first <track> element                      │
│     └── default=true                                            │
│     └── Auto-enabled on load                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Example Subtitle Config

**Raw config from vfx.php**:
```
"subtitle":"[English]https://cca.megafiles.store/85/16/85168d5c1786301b84a59292902635df/85168d5c1786301b84a59292902635df.vtt,[Dutch]https://cca.megafiles.store/44/0a/440ad59b9caa4409bc664c598d2896cf/440ad59b9caa4409bc664c598d2896cf.vtt,[French]https://..."
```

**Parsed result**:
```json
{
    "label": "English",
    "lang": "en",
    "file": "http://localhost:7860/api/proxy/segment?url=https%3A%2F%2Fcca.megafiles.store%2F85%2F16%2F...&referer=https%3A%2F%2Fstreamingnow.mov%2F",
    "source": "embedded"
}
```

### CORS Handling

Direct access to `megafiles.store` URLs would fail with CORS error. The backend proxies the request:

```javascript
// Backend: /api/proxy/segment
app.get('/api/proxy/segment', async (req, res) => {
    const response = await axios({
        url: decodedUrl,
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0...',
            'Referer': decodedReferer,
            'Origin': new URL(decodedReferer).origin
        }
    });
    
    if (decodedUrl.includes('.vtt')) {
        res.setHeader('Content-Type', 'text/vtt');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(response.data);
});
```

---

## API Endpoints

### GET /api/extract

**Purpose**: Extract M3U8 stream and subtitles

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tmdbId | number | Yes* | TMDB ID of movie/show |
| imdbId | string | Yes* | IMDB ID (alternative to tmdbId) |
| type | string | Yes | `movie` or `tv` |
| season | number | For TV | Season number |
| episode | number | For TV | Episode number |

*Either tmdbId or imdbId required

**Examples**:
```
# Movie (The Godfather)
GET http://localhost:7860/api/extract?tmdbId=238&type=movie

# TV Show (Game of Thrones S1E1)
GET http://localhost:7860/api/extract?tmdbId=1399&type=tv&season=1&episode=1
```

**Success Response**:
```json
{
    "success": true,
    "m3u8Url": "https://wispy-resonance-f4fd.ice-shut619.workers.dev/...",
    "proxiedM3U8Url": "http://localhost:7860/api/proxy/m3u8?url=...&referer=...",
    "subtitles": [
        {
            "label": "English",
            "lang": "en",
            "file": "http://localhost:7860/api/proxy/segment?url=...&referer=...",
            "source": "embedded"
        }
    ],
    "referer": "https://streamingnow.mov/",
    "provider": "vipstream-s"
}
```

**Error Responses**:
```json
// 400 Bad Request
{"success": false, "error": "Missing tmdbId or imdbId"}
{"success": false, "error": "Invalid type"}
{"success": false, "error": "Missing season/episode for TV"}

// 429 Too Many Requests (extraction in progress)
{"success": false, "error": "Extraction in progress, please wait"}

// 500 Internal Server Error
{"success": false, "error": "Failed to extract M3U8 stream"}
{"success": false, "error": "Browser launch failed"}
```

### GET /api/proxy/m3u8

**Purpose**: Proxy and rewrite M3U8 playlist URLs

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | Yes | Encoded original M3U8 URL |
| referer | string | Yes | Encoded referer URL |

**Response Headers**:
```
Access-Control-Allow-Origin: *
Content-Type: application/vnd.apple.mpegurl
```

**URL Rewriting**: 
- All segment URLs are rewritten to go through `/api/proxy/segment`
- All nested M3U8 URLs are rewritten to go through `/api/proxy/m3u8`

### GET /api/proxy/segment

**Purpose**: Proxy video segments and subtitle files

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | Yes | Encoded segment/VTT URL |
| referer | string | Yes | Encoded referer URL |

**Response Headers**:
```
Access-Control-Allow-Origin: *
Content-Type: text/vtt (for .vtt files)
Content-Type: text/plain (for .srt files)
Content-Type: [from source] (for video segments)
```

### GET /health

**Purpose**: Health check

**Response**:
```json
{
    "status": "ok",
    "uptime": 123.456,
    "browser": "running"  // or "not started"
}
```

---

## TypeScript Interfaces

### stream.ts

```typescript
export interface SubtitleTrack {
    file: string;
    label: string;
    kind?: string;
    default?: boolean;
}

export interface ExtractedStream {
    success: boolean;
    m3u8Url: string;
    proxiedM3U8Url?: string;
    subtitles?: SubtitleTrack[];
    referer?: string;
    provider?: string;
    error?: string;
}

export interface MovieDetails {
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    runtime?: number;
    genres?: { id: number; name: string }[];
}

export interface TMDBMovie {
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    backdrop_path: string | null;
    media_type?: 'movie' | 'tv' | 'person';
    overview: string;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
}
```

### SubtitleService Types

```typescript
export interface SubdlSubtitle {
    label: string;
    lang: string;
    file: string;          // ZIP URL (Subdl) or VTT URL (embedded)
    author?: string;
    downloads?: number;
    hi?: boolean;           // Hearing impaired
    source?: string;        // 'embedded' | 'network' | 'subdl'
}

export interface ProcessedSubtitle {
    label: string;
    lang: string;
    vttUrl: string;         // Blob URL or direct URL
    originalFile: string;
    quality: number;        // For sorting (1000 for embedded, 0-100 for Subdl)
}
```

---

## How to Run

### Prerequisites
- Node.js 18+ installed
- Windows OS (tested on Windows 10/11)
- Chrome/Chromium (puppeteer-real-browser will use it)

### Install Dependencies

```powershell
# Backend
cd c:\Users\VASU\Desktop\stream\superembed-4k-app\backend
npm install

# Frontend
cd c:\Users\VASU\Desktop\stream\superembed-4k-app
npm install
```

### Start Backend

```powershell
cd c:\Users\VASU\Desktop\stream\superembed-4k-app\backend
node scraper.js
```

**Expected Output**:
```
🎬 SuperEmbed VIP Stream Scraper on port 7860
📡 http://localhost:7860/api/extract?tmdbId=238&type=movie
📡 http://localhost:7860/api/extract?tmdbId=1399&type=tv&season=1&episode=1
```

### Start Frontend

```powershell
cd c:\Users\VASU\Desktop\stream\superembed-4k-app
npm run dev
```

**Expected Output**:
```
▲ Next.js 16.0.8
- Local: http://localhost:3000
```

### Test Extraction

```powershell
# Test health
curl http://localhost:7860/health

# Test movie extraction (takes 30-90 seconds)
curl "http://localhost:7860/api/extract?tmdbId=238&type=movie"

# Test TV extraction
curl "http://localhost:7860/api/extract?tmdbId=1399&type=tv&season=1&episode=1"
```

---

## Debugging & Logging

### Backend Console Output

```
[Extract] ========== movie-238 ==========
[Browser] ✅ Reusing existing browser
[Nav] Going to: https://multiembed.mov/directstream.php?video_id=238&tmdb=1
[Step 1] Checking for interstitial ad...
[Ad] ✅ No interstitial - ready for play button
[Step 3] Clicking Play button...
[Click] Attempt 1: Play button at (640, 360)
[Step 2] ✅ Player iframe detected!
[Step 3.5] Selecting VIPStream-S server...
[Server] Found SERVERS button at (120, 45)
[Server] ✅ Clicked SERVERS button
[Server] Found vipstream-S at (59, 173)
[Server] ✅ Clicked vipstream-S
[Step 3.6] Handling Access Content interstitial...
[Access] ⏳ Waiting for countdown (1s)...
...
[Access] ✅ No interstitial
[M3U8] 🎯 FOUND: https://wispy-resonance-f4fd.ice-shut619.workers.dev/...
[Sub] 📜 Found subtitle config in vfx.php (450 chars)
[Sub] 🎯 Embedded English: https://cca.megafiles.store/...
[Sub] ✅ Extracted 1 embedded English subtitle(s)
[Result] ✅ M3U8 FOUND
[Result] 🎯 Using 1 EMBEDDED subtitle(s) from source (perfectly synced)
```

### Frontend Console Output

```
[SuperEmbedService] Fetching: http://localhost:7860/api/extract?tmdbId=238&type=movie
[SuperEmbedService] ✅ Stream extracted successfully
[StreamContainer] ✅ Starting playback immediately
[StreamContainer] 📥 Processing 1 subtitles in background... (embedded: true)
[SubtitleService] Fetching: English... (source: embedded)
[SubtitleService] 🎯 EMBEDDED subtitle (synced with source): http://localhost:7860/api/proxy/segment...
[SubtitleService] ✅ Successfully processed 1/1 subtitle(s)
[StreamContainer] ✅ 1 subtitles ready - best: "English • Synced" (default: true)
[Player] Adding 1 subtitle track(s)
[Player] ✅ Track loaded: English • Synced
[Player] 🎬 Subtitle enabled: English • Synced
```

---

## Known Issues & Solutions

### Issue 1: "Level 0" in Quality Dropdown

**Problem**: HLS.js shows "Level 0" when M3U8 doesn't include resolution

**Solution**: Infer from bitrate in MoviePlayer.tsx (lines 393-412)

### Issue 2: Subtitles Not Showing

**Problem**: Cross-origin VTT blocked by CORS

**Solutions**:
1. All subtitle URLs proxied through `/api/proxy/segment`
2. `crossOrigin="anonymous"` on `<video>` element
3. Proper Content-Type headers from proxy

### Issue 3: Out-of-Sync Subtitles

**Problem**: Subdl API subtitles don't match video timing

**Solution**: Extract embedded subtitles from source player config

### Issue 4: Concurrent Extraction Errors

**Problem**: Multiple extractions corrupt browser state

**Solution**: `isExtracting` lock prevents concurrent requests

### Issue 5: Browser Corruption on Content Switch

**Problem**: Switching movies sometimes causes errors

**Solution**: `needsRestart` flag forces browser restart on different content

---

## Configuration

### Environment Variables (Should Be Set)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 7860 | Backend server port |
| NEXT_PUBLIC_SCRAPER_URL | http://localhost:7860 | Scraper API URL |

### Hardcoded Values (Should Move to .env)

| Value | Location | Description |
|-------|----------|-------------|
| Subdl API Key | scraper.js:36 | `8kyy_Cl0S7OJnXPdVAAkxeKE5dFhkKXr` |

---

## Dependencies

### Backend (package.json)

```json
{
    "type": "module",
    "dependencies": {
        "axios": "^1.6.7",
        "cors": "^2.8.5",
        "express": "^4.19.2",
        "puppeteer": "^24.32.1",
        "puppeteer-extra": "^3.3.6",
        "puppeteer-extra-plugin-stealth": "^2.11.2",
        "puppeteer-real-browser": "^1.4.4"
    },
    "engines": {
        "node": ">=18.0.0"
    }
}
```

### Frontend (package.json)

```json
{
    "dependencies": {
        "next": "16.0.8",
        "react": "19.2.1",
        "react-dom": "19.2.1",
        "hls.js": "^1.6.15",
        "jszip": "^3.10.1",
        "axios": "^1.13.2",
        "framer-motion": "^12.23.26",
        "lucide-react": "^0.559.0",
        "tailwindcss": "^4.1.17",
        "clsx": "^2.1.1",
        "tailwind-merge": "^3.4.0"
    }
}
```

---

## Future Improvements

### High Priority
1. **Multiple Languages**: Currently only extracts English. Parse all languages from PlayerJS config.
2. **Caching**: Cache M3U8/subtitles for same TMDB ID.
3. **Environment Variables**: Move all secrets to `.env`.

### Medium Priority
1. **Docker Deployment**: Containerize for easier deployment.
2. **Rate Limiting**: Proper rate limiting instead of simple lock.
3. **Error Recovery**: Better handling of source errors.

### Low Priority
1. **Subtitle Sync Adjustment**: Manual timing offset in player.
2. **Multiple Servers**: Fallback if vipstream-S unavailable.
3. **Watch History**: Track watched content.

---

## Quick Reference

### Critical Files

| File | Lines | Purpose |
|------|-------|---------|
| `backend/scraper.js` | 1358 | Main extraction logic |
| `src/components/player/MoviePlayer.tsx` | 1167 | Video player |
| `src/services/SubtitleService.ts` | 323 | Subtitle processing |
| `src/components/player/StreamContainer.tsx` | 198 | Extraction orchestration |
| `src/services/SuperEmbedService.js` | 136 | API client |

### Key URLs

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Frontend |
| `http://localhost:7860` | Backend API |
| `multiembed.mov` | Source embed page |
| `streamingnow.mov` | VIPStream player |
| `cca.megafiles.store` | Embedded subtitle files |

### Key Regex Patterns

| Pattern | Purpose |
|---------|---------|
| `/"subtitle"\s*:\s*"([^"]+)"/` | Extract subtitle config from PlayerJS |
| `/\[([^\]]+)\](https?:\/\/[^\s,\[\]]+\.vtt)/g` | Parse [Lang]URL format |
| `/.m3u8/` | Detect M3U8 URLs |
| `/.vtt\|.srt/` | Detect subtitle files |

---

## Summary for AI Agents

**If you're continuing this project, here's what you MUST know:**

1. **The app extracts streams from `multiembed.mov` → vipstream-S server**

2. **Two subtitle sources**:
   - **Embedded** (preferred): Parsed from `vfx.php` PlayerJS config, labeled `source: 'embedded'`, quality score **1000**, always sorted first
   - **Subdl** (fallback): ZIP files, may have sync issues, quality score 0-100

3. **All external URLs must be proxied** through `/api/proxy/*` for CORS

4. **Frontend starts playback immediately**, subtitles load in background

5. **Embedded subtitles labeled "English • Synced"** in player menu

6. **Video element requires `crossOrigin="anonymous"`**

7. **Browser reuses single instance** but restarts on content change

8. **Extraction takes 30-90 seconds** due to ads and countdowns

**The subtitle extraction from `vfx.php` was the most complex part. The key insight was that the source player's subtitle config is in the response body as `"subtitle":"[English]url,[Dutch]url,..."` - parsing this gives perfectly synced subtitles.**

---

*Document generated for AI agent continuity. Last verified working: 2025-12-11*
