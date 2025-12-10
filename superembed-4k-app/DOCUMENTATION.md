# SuperEmbed 4K Streaming Application - Complete Documentation

> **Purpose**: This document serves as the single source of truth for any AI agent continuing work on this project.
> **Last Updated**: 2025-12-11
> **Status**: Fully functional with embedded subtitle extraction

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Backend - scraper.js](#backend---scraperjs)
5. [Frontend Application](#frontend-application)
6. [Subtitle System (Critical)](#subtitle-system-critical)
7. [API Endpoints](#api-endpoints)
8. [How to Run](#how-to-run)
9. [Known Issues & Solutions](#known-issues--solutions)
10. [Future Improvements](#future-improvements)

---

## Project Overview

### What This Application Does

This is a **streaming aggregator application** that:
1. Takes a TMDB ID (movie or TV show) from the user
2. Uses a headless browser to navigate to `multiembed.mov` 
3. Extracts M3U8 video URLs from the **vipstream-S server** (best quality - HD/4K)
4. Extracts **embedded subtitles** from the source (perfectly synced with video)
5. Proxies the M3U8 stream and subtitles through the backend to handle CORS
6. Plays the video in a custom HLS.js-based player in the frontend

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Node.js, Express, `puppeteer-real-browser` |
| Video Player | HLS.js for adaptive streaming |
| Subtitle Processing | JSZip (for Subdl fallback), VTT format |
| Styling | Tailwind CSS v4, Material Symbols icons |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Next.js Frontend (localhost:3000)                          │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                   │ │
│  │  │  StreamContainer │─▶│   MoviePlayer   │                   │ │
│  │  │  (extraction)    │  │   (HLS.js)      │                   │ │
│  │  └────────┬─────────┘  └────────┬────────┘                   │ │
│  └───────────│─────────────────────│────────────────────────────┘ │
└──────────────│─────────────────────│────────────────────────────┘
               │                     │
               ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│              Backend Server (localhost:7860)                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Express API                                                 │ │
│  │  • /api/extract - Extracts M3U8 + Subtitles                 │ │
│  │  • /api/proxy/m3u8 - Proxies M3U8 playlist                  │ │
│  │  • /api/proxy/segment - Proxies video segments + VTT        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Puppeteer Real Browser (Headless Chromium)                  │ │
│  │  • Navigates to multiembed.mov                               │ │
│  │  • Handles interstitial ads, popups                          │ │
│  │  • Clicks vipstream-S server button                          │ │
│  │  • Intercepts network to capture M3U8 + Subtitles            │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
               │                     │
               ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│              External Sources                                     │
│  • multiembed.mov → Player embed page                            │
│  • streamingnow.mov → VIPStream-S player                         │
│  • vipstream_vfx.php → PlayerJS config (contains subtitles)       │
│  • cca.megafiles.store → Embedded VTT subtitle files             │
│  • subdl.com API → Fallback subtitles (may have sync issues)     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
c:\Users\VASU\Desktop\stream\superembed-4k-app\
├── backend/
│   ├── scraper.js              # Main backend server (Express + Puppeteer)
│   └── package.json            # Backend dependencies
│
├── src/
│   ├── app/
│   │   ├── page.tsx            # Main page - movie selection UI
│   │   ├── layout.js           # Root layout with fonts
│   │   └── globals.css         # Tailwind CSS v4 styles
│   │
│   ├── components/
│   │   ├── player/
│   │   │   ├── MoviePlayer.tsx  # HLS.js video player with controls
│   │   │   ├── StreamContainer.tsx  # Manages extraction & playback
│   │   │   └── NativePlayer.css
│   │   └── ui/
│   │       ├── Hero.tsx         # Hero section
│   │       ├── MovieCard.tsx    # Movie card component
│   │       └── SearchBar.tsx    # TMDB search
│   │
│   ├── services/
│   │   ├── SuperEmbedService.js # Frontend service to call backend API
│   │   └── SubtitleService.ts   # Processes subtitles (embedded + Subdl)
│   │
│   ├── types/
│   │   └── stream.ts            # TypeScript interfaces
│   │
│   └── utils/
│       └── VideoEnhancer.ts     # Video quality enhancement (WebGL)
│
├── package.json                 # Frontend dependencies
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── DOCUMENTATION.md            # THIS FILE
```

---

## Backend - scraper.js

### Location
`c:\Users\VASU\Desktop\stream\superembed-4k-app\backend\scraper.js`

### Port
Runs on **port 7860**

### Key Components

#### 1. Browser Instance Management
- Uses `puppeteer-real-browser` (anti-detection library)
- Single browser instance reused across requests
- Automatic popup blocking and ad handling

```javascript
const { connect } = require('puppeteer-real-browser');
let browserInstance = null;
```

#### 2. Extraction Flow

The extraction follows these steps:

| Step | Action | Why |
|------|--------|-----|
| 1 | Navigate to `multiembed.mov/directstream.php?video_id={tmdbId}&tmdb=1` | Entry point |
| 2 | Handle interstitial ad (click "Skip ad" button) | Ads block playback |
| 3 | Click main play button | Reveals server list |
| 4 | Wait for server buttons to load | VIPStream-S provides best quality |
| 5 | Click "SERVERS" dropdown | Must select specific server |
| 6 | Click "VIPStream-S" button | Best quality server (HD/4K) |
| 7 | Handle access content countdown | 10-15 second wait |
| 8 | Click play button in iframe | Starts video |
| 9 | Wait for M3U8 URL in network requests | Captured via response handler |
| 10 | Extract subtitle config from `vfx.php` response | Embedded subtitles |

#### 3. Network Response Handler

```javascript
// Captures M3U8 URLs
if (url.includes('.m3u8') && !url.includes('blob:')) {
    foundM3U8 = url;
}

// Extracts subtitle config from vfx.php
if (url.includes('vfx.php')) {
    const body = await response.text();
    const subtitleMatch = body.match(/"subtitle"\s*:\s*"([^"]+)"/);
    // Parse [English]url,[Dutch]url,... format
}
```

#### 4. Subtitle Priority System

The backend returns subtitles with this priority:

1. **Embedded subtitles** (from `vfx.php` PlayerJS config) - Best quality, perfectly synced
2. **Network subtitles** (direct .vtt/.srt captures) - Also synced
3. **Subdl API** (fallback) - May have sync issues

```javascript
// Priority 1: Embedded subtitles
if (embeddedSubtitles.length > 0) {
    finalSubtitles = embeddedSubtitles.map(sub => ({
        ...sub,
        file: `${proxyBase}/api/proxy/segment?url=${encodeURIComponent(sub.file)}&referer=${encodeURIComponent(referer)}`
    }));
}
// Priority 2: Network subtitles
else if (foundSubtitles.length > 0) { ... }
// Priority 3: Subdl API
else { ... }
```

#### 5. Subdl API Integration

Fallback when no embedded subtitles found:

```javascript
const SUBDL_CONFIG = {
    apiKey: '8kyy_Cl0S7OJnXPdVAAkxeKE5dFhkKXr',
    baseUrl: 'https://api.subdl.com/api/v1/subtitles',
    downloadBase: 'https://dl.subdl.com/subtitle'
};
```

**Note**: Subdl returns ZIP files that must be extracted by the frontend.

---

## Frontend Application

### Key Files

#### 1. StreamContainer.tsx
**Location**: `src/components/player/StreamContainer.tsx`

**Responsibilities**:
- Calls backend `/api/extract` endpoint
- Starts video playback IMMEDIATELY (non-blocking)
- Processes subtitles in BACKGROUND using `processSubtitles()`
- Updates player with subtitles when ready

```typescript
// Start playback immediately
setStream({
    success: true,
    m3u8Url: result.m3u8Url,
    subtitles: [], // Start empty
    referer: result.referer
});
setLoading(false);

// Process subtitles in background
processSubtitles(result.subtitles).then(processedSubtitles => {
    setStream(prev => ({ ...prev, subtitles: subtitleTracks }));
});
```

#### 2. MoviePlayer.tsx
**Location**: `src/components/player/MoviePlayer.tsx`

**Key Features**:
- HLS.js for adaptive streaming
- Quality selection (auto-detects 4K, 1080p, 720p from bitrate)
- Subtitle track management
- Mobile gesture controls (swipe for brightness/volume)
- Fullscreen support

**Critical Video Element Attribute**:
```jsx
<video
    ref={videoRef}
    crossOrigin="anonymous"  // REQUIRED for cross-origin subtitle tracks
    ...
/>
```

**Subtitle Loading**:
```typescript
const addSubtitleTracks = (video: HTMLVideoElement) => {
    extracted.subtitles.forEach((sub, index) => {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = sub.label;
        track.src = sub.file;  // Proxied URL
        track.default = index === 0;  // First = best quality
        video.appendChild(track);
    });
};
```

#### 3. SubtitleService.ts
**Location**: `src/services/SubtitleService.ts`

**Handles Two Subtitle Types**:

| Type | Source | Processing | Quality Score |
|------|--------|-----------|---------------|
| Embedded | `source: 'embedded'` | Direct VTT URL, no processing needed | **1000** (highest) |
| Subdl | `source: 'subdl'` | Download ZIP, extract, convert to VTT | 0-100 based on label |

**Embedded Subtitle Processing**:
```typescript
if (subtitle.source === 'embedded' || subtitle.source === 'network') {
    if (fileUrl.includes('.vtt')) {
        return {
            label: 'English • Synced',  // Clear label
            vttUrl: fileUrl,  // Use directly
            quality: 1000  // Always first
        };
    }
}
```

**Subdl ZIP Processing**:
```typescript
const zipBlob = await response.blob();
const zip = await JSZip.loadAsync(zipBlob);
// Find .srt/.vtt in ZIP
// Convert SRT to VTT if needed
// Create blob URL
```

---

## Subtitle System (Critical)

### The Problem We Solved

The Subdl API provides generic subtitle files that are often **out of sync** with the video because:
- They're matched by movie name, not the specific video source
- Different video releases have different timings

### The Solution

Extract **embedded subtitles** directly from the source player (vipstream-S). These are:
- The same subtitles used by the source player
- **Perfectly synced** with the video stream
- Direct VTT URLs from `cca.megafiles.store`

### Subtitle Extraction Flow

```
1. Backend intercepts vfx.php response
   ↓
2. Parses: "subtitle":"[English]https://cca.megafiles.store/...vtt,[Dutch]https://..."
   ↓
3. Extracts English URL: https://cca.megafiles.store/85/16/.../...vtt
   ↓
4. Proxies through: /api/proxy/segment?url=...&referer=...
   ↓
5. Frontend receives: { label: 'English', source: 'embedded', file: 'http://localhost:7860/api/proxy/segment?...' }
   ↓
6. SubtitleService gives quality score 1000 (highest)
   ↓
7. MoviePlayer auto-enables as default subtitle
```

### Subtitle Format in PlayerJS

The source player uses this format:
```
"subtitle":"[English]https://cca.megafiles.store/xxx/xxx.vtt,[Dutch]https://...,[French]https://..."
```

Parsed with regex:
```javascript
const regex = /\[([^\]]+)\](https?:\/\/[^\s,\[\]]+\.vtt)/g;
```

### Proxy Requirement

Direct access to `megafiles.store` causes CORS errors. The backend proxies through `/api/proxy/segment`:

```javascript
// Backend returns:
file: `${proxyBase}/api/proxy/segment?url=${encodeURIComponent(sub.file)}&referer=${encodeURIComponent(referer)}`
```

---

## API Endpoints

### GET /api/extract

**Purpose**: Extract M3U8 stream and subtitles for a movie/TV show

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| tmdbId | number | TMDB ID of the movie/show |
| imdbId | string | (optional) IMDB ID |
| type | string | `movie` or `tv` |
| season | number | Season number (for TV) |
| episode | number | Episode number (for TV) |

**Example**:
```
GET http://localhost:7860/api/extract?tmdbId=238&type=movie
GET http://localhost:7860/api/extract?tmdbId=1399&type=tv&season=1&episode=1
```

**Response**:
```json
{
    "success": true,
    "m3u8Url": "https://wispy-resonance-f4fd.ice-shut619.workers.dev/...",
    "proxiedM3U8Url": "http://localhost:7860/api/proxy/m3u8?url=...",
    "subtitles": [
        {
            "label": "English",
            "lang": "en",
            "file": "http://localhost:7860/api/proxy/segment?url=https%3A%2F%2Fcca.megafiles.store%2F...",
            "source": "embedded"
        }
    ],
    "referer": "https://streamingnow.mov/",
    "provider": "vipstream-s"
}
```

### GET /api/proxy/m3u8

**Purpose**: Proxy M3U8 playlist with proper headers

**Parameters**:
- `url`: Encoded original M3U8 URL
- `referer`: Encoded referer URL

### GET /api/proxy/segment

**Purpose**: Proxy video segments and subtitle files (VTT)

**Parameters**:
- `url`: Encoded segment/VTT URL
- `referer`: Encoded referer URL

**Sets Headers**:
```
Access-Control-Allow-Origin: *
Content-Type: text/vtt (for VTT files)
```

### GET /health

**Purpose**: Health check

**Response**:
```json
{
    "status": "ok",
    "uptime": 123.45,
    "browser": "running"
}
```

---

## How to Run

### Prerequisites
- Node.js 18+ installed
- Windows OS (tested on Windows 10/11)

### Start Backend
```powershell
cd c:\Users\VASU\Desktop\stream\superembed-4k-app\backend
node scraper.js
```
**Output**: `🎬 SuperEmbed VIP Stream Scraper on port 7860`

### Start Frontend
```powershell
cd c:\Users\VASU\Desktop\stream\superembed-4k-app
npm run dev
```
**Output**: `▲ Next.js 16.0.8` → Open http://localhost:3000

### Test Extraction
```powershell
# Movie example (The Godfather)
curl http://localhost:7860/api/extract?tmdbId=238&type=movie

# TV example (Game of Thrones S1E1)
curl http://localhost:7860/api/extract?tmdbId=1399&type=tv&season=1&episode=1
```

---

## Known Issues & Solutions

### Issue 1: "Level 0" in Quality Dropdown

**Problem**: HLS.js shows "Level 0" instead of "1080p" when M3U8 doesn't include resolution info

**Solution** (in MoviePlayer.tsx):
```typescript
// Infer resolution from bitrate
if (!height && level.bitrate) {
    if (level.bitrate >= 8000000) height = 1440; // 2K
    else if (level.bitrate >= 4000000) height = 1080;
    else if (level.bitrate >= 2500000) height = 720;
    // ...
}
```

### Issue 2: Subtitles Not Showing (CORS)

**Problem**: Cross-origin VTT files blocked by CORS

**Solution**: 
1. Proxy all subtitle URLs through backend `/api/proxy/segment`
2. Add `crossOrigin="anonymous"` to `<video>` element

### Issue 3: Out-of-Sync Subtitles

**Problem**: Subdl API subtitles don't match video timing

**Solution**: Extract embedded subtitles from source player config (see Subtitle System section)

### Issue 4: Browser Not Starting / Popups

**Problem**: Puppeteer fails or popups block extraction

**Solution**: 
- Using `puppeteer-real-browser` with stealth mode
- `popupHandler` closes all new browser targets
- Global error handlers prevent process crash

### Issue 5: Extraction Lock

**Problem**: Multiple simultaneous extractions cause issues

**Solution**: `isExtracting` flag prevents concurrent extractions
```javascript
let isExtracting = false;
if (isExtracting) {
    return res.status(429).json({ success: false, error: 'Extraction in progress' });
}
```

---

## Future Improvements

### High Priority
1. **Multiple subtitle languages**: Currently only extracts English. Could parse all languages from PlayerJS config.
2. **Caching**: Cache M3U8/subtitles for same TMDB ID to reduce extraction time.
3. **Rate limiting**: Proper rate limiting instead of simple lock.

### Medium Priority
1. **Environment variables**: Move Subdl API key to `.env` file
2. **Docker deployment**: Containerize for easier deployment
3. **TV show episode navigation**: Pre-fetch next episode

### Low Priority
1. **Subtitle sync adjustment**: Manual timing offset in player
2. **Multiple quality sources**: Try other servers if vipstream-S fails
3. **Watchlist/History**: Track watched movies

---

## Environment Variables

Currently hardcoded (should be moved to `.env`):

| Variable | Value | Location |
|----------|-------|----------|
| PORT | 7860 | scraper.js |
| NEXT_PUBLIC_SCRAPER_URL | http://localhost:7860 | SuperEmbedService.js |
| SUBDL_API_KEY | `8kyy_Cl0S7OJnXPdVAAkxeKE5dFhkKXr` | scraper.js |

---

## Quick Reference - File Locations

| File | Purpose |
|------|---------|
| `backend/scraper.js` | Backend server, extraction logic, proxies |
| `src/components/player/MoviePlayer.tsx` | Video player, HLS.js, subtitle tracks |
| `src/components/player/StreamContainer.tsx` | Extraction orchestration, background subtitle loading |
| `src/services/SubtitleService.ts` | Subtitle processing (embedded + Subdl ZIP) |
| `src/services/SuperEmbedService.js` | Frontend API client |
| `src/types/stream.ts` | TypeScript interfaces |

---

## Summary for AI Agents

If you're continuing this project, here's what you need to know:

1. **The app extracts streams from multiembed.mov → vipstream-S server**
2. **Subtitles come from two sources**:
   - **Embedded** (preferred): Parsed from `vfx.php` PlayerJS config, perfect sync
   - **Subdl** (fallback): ZIP files, may have sync issues
3. **All external URLs are proxied** through `/api/proxy/*` for CORS
4. **Frontend starts playback immediately**, subtitles load in background
5. **Embedded subtitles are labeled "English • Synced"** with quality score 1000
6. **Video element needs `crossOrigin="anonymous"`** for subtitle tracks

The subtitle system was the most complex part to solve. The key insight was that the source player's subtitle config is in the `vfx.php` response body as: `"subtitle":"[English]url,[Dutch]url,..."` - parsing this gives us perfectly synced subtitles.

---

*Document generated for AI agent continuity. Last verified working: 2025-12-11*
