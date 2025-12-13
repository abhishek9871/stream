import express from 'express';
import cors from 'cors';
import { connect } from 'puppeteer-real-browser';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 7860;

app.use(cors());
app.use(express.json());

// Global error handlers to prevent process crash
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[Global] Uncaught Exception:', error.message);
    // Don't exit - keep server running
});

// SuperEmbed VIP Stream Configuration
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

// Subdl API Configuration for English subtitles
const SUBDL_CONFIG = {
    apiKey: '8kyy_Cl0S7OJnXPdVAAkxeKE5dFhkKXr',
    baseUrl: 'https://api.subdl.com/api/v1/subtitles',
    downloadBase: 'https://dl.subdl.com/subtitle'
};

// Fetch English subtitles from Subdl API
async function fetchSubtitlesFromSubdl(tmdbId, type, season = null, episode = null) {
    console.log(`[Subdl] Fetching English subtitles for ${type} TMDB:${tmdbId}${season ? ` S${season}E${episode}` : ''}...`);

    try {
        const params = new URLSearchParams({
            api_key: SUBDL_CONFIG.apiKey,
            tmdb_id: tmdbId,
            type: type,
            languages: 'EN',
            subs_per_page: '30' // Get maximum subtitles
        });

        // Add season/episode for TV shows
        if (type === 'tv' && season && episode) {
            params.append('season_number', season);
            params.append('episode_number', episode);
        }

        const url = `${SUBDL_CONFIG.baseUrl}?${params.toString()}`;
        console.log(`[Subdl] API URL: ${url.replace(SUBDL_CONFIG.apiKey, '***')}`);

        const response = await axios.get(url, { timeout: 10000 });

        if (response.data && response.data.subtitles && response.data.subtitles.length > 0) {
            // Return ALL English subtitles (frontend will process and sort them)
            const subtitles = response.data.subtitles
                .filter(sub => sub.lang === 'English' || sub.language === 'EN' || sub.language === 'English')
                .map(sub => {
                    // Build download URL - ensure it's absolute
                    let downloadUrl = sub.url || '';

                    // If URL is relative, prepend the download base
                    if (downloadUrl.startsWith('/')) {
                        downloadUrl = 'https://dl.subdl.com' + downloadUrl;
                    } else if (!downloadUrl.startsWith('http')) {
                        // Build from subtitle ID
                        downloadUrl = `${SUBDL_CONFIG.downloadBase}/${sub.id || sub.subtitle_id}.zip`;
                    }

                    return {
                        label: sub.release_name || sub.name || 'English',
                        lang: 'en',
                        file: downloadUrl,
                        author: sub.author || 'Unknown',
                        downloads: sub.downloads || 0,
                        hi: sub.hi || false, // Hearing impaired
                        source: 'subdl'
                    };
                });

            console.log(`[Subdl] ✅ Found ${subtitles.length} English subtitle(s)`);
            subtitles.forEach((s, i) => console.log(`   ${i + 1}. ${s.label}`));
            return subtitles;
        } else {
            console.log('[Subdl] ⚠️ No subtitles found in response');
            return [];
        }
    } catch (error) {
        console.error('[Subdl] ❌ API Error:', error.message);
        return [];
    }
}

// Browser Session - keep alive for reuse
let browserInstance = null;
let pageInstance = null;

// Request lock to prevent concurrent extractions
let isExtracting = false;
let lastExtractionId = null;
let extractionStartTime = null;
const MAX_EXTRACTION_TIME = 60000; // 60 seconds max before auto-release

// Helper: Release lock safely
function releaseLock(reason = '') {
    if (isExtracting) {
        const duration = extractionStartTime ? Math.round((Date.now() - extractionStartTime) / 1000) : 0;
        console.log(`[Lock] 🔓 Released (${reason}) after ${duration}s`);
    }
    isExtracting = false;
    extractionStartTime = null;
}

// Helper: Check if lock is stale (held too long)
function isLockStale() {
    if (!isExtracting || !extractionStartTime) return false;
    return Date.now() - extractionStartTime > MAX_EXTRACTION_TIME;
}

// ============ CACHE SYSTEM ============
// Cache M3U8 URLs and subtitles by content ID (reduces repeat requests to instant)
const streamCache = new Map();
const CACHE_TTL = 20 * 60 * 1000; // 20 minutes TTL (workers.dev tokens expire quickly)
const failedSegmentCount = new Map(); // Track 403 errors per content

function getCachedStream(contentId) {
    const cached = streamCache.get(contentId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // Check if this cache entry has had too many 403 errors (token likely expired)
        const failures = failedSegmentCount.get(contentId) || 0;
        if (failures >= 5) {
            console.log(`[Cache] ⚠️ Invalidated ${contentId} due to ${failures} segment failures`);
            streamCache.delete(contentId);
            failedSegmentCount.delete(contentId);
            return null;
        }
        console.log(`[Cache] ✅ HIT for ${contentId} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return cached.data;
    }
    if (cached) {
        console.log(`[Cache] ⏰ EXPIRED for ${contentId}`);
        streamCache.delete(contentId);
        failedSegmentCount.delete(contentId);
    }
    return null;
}

// Track segment failures to detect expired tokens
function trackSegmentFailure(url) {
    // Find which content this segment belongs to based on URL patterns
    for (const [contentId, cached] of streamCache.entries()) {
        if (cached.data?.m3u8Url && url.includes('workers.dev')) {
            // Check if this URL likely belongs to this content (same workers.dev subdomain)
            try {
                const cachedHost = new URL(cached.data.m3u8Url).host;
                const failedHost = new URL(url).host;
                if (cachedHost === failedHost) {
                    const count = (failedSegmentCount.get(contentId) || 0) + 1;
                    failedSegmentCount.set(contentId, count);
                    if (count === 5) {
                        console.log(`[Cache] ⚠️ ${contentId} has ${count} failures - will invalidate on next access`);
                    }
                    return;
                }
            } catch (e) {}
        }
    }
}

function setCachedStream(contentId, data) {
    streamCache.set(contentId, { data, timestamp: Date.now() });
    failedSegmentCount.delete(contentId); // Clear any previous failure count
    console.log(`[Cache] 💾 Cached ${contentId} (total cached: ${streamCache.size})`);

    // Cleanup old entries if cache gets too big
    if (streamCache.size > 100) {
        const now = Date.now();
        for (const [key, value] of streamCache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
                streamCache.delete(key);
            }
        }
    }
}

async function getBrowser(forceRestart = false) {
    // If force restart or browser is corrupted, close and relaunch
    if (forceRestart && browserInstance) {
        console.log('[Browser] 🔄 Force restarting browser...');
        try {
            await browserInstance.close();
        } catch (ex) {
            console.log('[Browser] Close error (ignored):', ex.message);
        }
        browserInstance = null;
        pageInstance = null;
    }

    // If browser and page exist and are valid, reuse them
    if (browserInstance && pageInstance) {
        try {
            // Test if page is still usable by navigating to blank
            await pageInstance.goto('about:blank', { timeout: 5000 });
            console.log('[Browser] ✅ Reusing existing browser');
            return { browser: browserInstance, page: pageInstance };
        } catch (e) {
            console.log('[Browser] Page corrupted, relaunching...');
            try { await browserInstance.close(); } catch (ex) { }
            browserInstance = null;
            pageInstance = null;
        }
    }

    console.log('[Browser] 🚀 Launching Real Browser (Stealth Mode)...');
    const { browser, page } = await connect({
        headless: false,
        turnstile: true,
        fingerprint: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720']
    });

    browserInstance = browser;
    pageInstance = page;
    console.log('[Browser] ✅ Browser ready');
    return { browser, page };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// Helper: Close all popup pages except main page
async function closeAllPopups(browser, mainPage) {
    const pages = await browser.pages();
    let closed = 0;
    for (const p of pages) {
        if (p !== mainPage && !p.isClosed()) {
            await p.close().catch(() => { });
            closed++;
        }
    }
    if (closed > 0) {
        console.log(`[Popup] 🔫 Closed ${closed} popup(s)`);
        await mainPage.bringToFront().catch(() => { });
    }
    return closed;
}

// Main extraction endpoint
app.get('/api/extract', async (req, res) => {
    const { tmdbId, imdbId, season, episode, type } = req.query;

    if (!tmdbId && !imdbId) {
        return res.status(400).json({ success: false, error: 'Missing tmdbId or imdbId' });
    }
    if (!type || !['movie', 'tv'].includes(type)) {
        return res.status(400).json({ success: false, error: 'Invalid type' });
    }
    if (type === 'tv' && (!season || !episode)) {
        return res.status(400).json({ success: false, error: 'Missing season/episode for TV' });
    }

    const contentId = `${type}-${tmdbId || imdbId}${type === 'tv' ? `-s${season}e${episode}` : ''}`;
    console.log(`\n[Extract] ========== ${contentId} ==========`);

    // 🚀 CHECK CACHE FIRST - instant response if cached
    const cached = getCachedStream(contentId);
    if (cached) {
        console.log('[Extract] ⚡ Returning cached result instantly');
        return res.json(cached);
    }

    // Check if another extraction is in progress
    if (isExtracting) {
        // Auto-release stale locks (held too long = something crashed)
        if (isLockStale()) {
            console.log(`[Extract] ⚠️ STALE LOCK detected (>${MAX_EXTRACTION_TIME/1000}s) - auto-releasing!`);
            releaseLock('stale-auto-release');
            // Force browser restart since previous extraction likely corrupted it
            try {
                if (browserInstance) {
                    await browserInstance.close().catch(() => {});
                }
            } catch (e) {}
            browserInstance = null;
            pageInstance = null;
        } else {
            console.log('[Extract] ⚠️ Another extraction in progress, please wait');
            return res.status(429).json({ success: false, error: 'Extraction in progress, please wait' });
        }
    }

    isExtracting = true;
    extractionStartTime = Date.now();
    lastExtractionId = contentId;

    // No more browser restart on content switch - just navigate to new URL
    const needsRestart = false;

    let browser, page;
    let browserRetries = 0;
    const MAX_BROWSER_RETRIES = 2;

    while (browserRetries <= MAX_BROWSER_RETRIES) {
        try {
            // Force restart on retry (previous attempt corrupted the browser)
            const forceRestart = browserRetries > 0;
            ({ browser, page } = await getBrowser(forceRestart));
            break; // Success, exit loop
        } catch (e) {
            browserRetries++;
            console.error(`[Browser] Launch failed (attempt ${browserRetries}):`, e.message);

            // Force cleanup on failure
            browserInstance = null;
            pageInstance = null;

            if (browserRetries > MAX_BROWSER_RETRIES) {
                releaseLock('browser-launch-failed');
                return res.status(500).json({ success: false, error: 'Browser launch failed after retries' });
            }

            // Brief wait before retry
            await sleep(1000);
        }
    }

    const mainPage = page;

    // 🛡️ AGGRESSIVE POPUP KILLER
    const popupHandler = async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== mainPage) {
                    const url = target.url();
                    console.log('[Popup] 🔫 Auto-killed:', url.substring(0, 60));
                    await newPage.close().catch(() => { });
                    if (!mainPage.isClosed()) await mainPage.bringToFront().catch(() => { });
                }
            } catch (e) { }
        }
    };
    browser.on('targetcreated', popupHandler);

    // State tracking
    let foundM3U8 = null;
    let vipstreamM3U8 = null; // 🎯 ONLY M3U8 from vipstream-S (workers.dev)
    let foundSubtitles = [];
    let embeddedSubtitles = []; // Subtitles from PlayerJS config
    let capturedReferer = null;
    let playerIframeFound = false;
    let serverSwitched = false; // Track when we've clicked vipstream-S

    // Helper: Parse PlayerJS subtitle config format: [Lang]url,[Lang]url,...
    const parseSubtitleConfig = (subtitleStr) => {
        const results = [];
        // Match pattern: [Language]URL
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
                    source: 'embedded'
                });
                console.log(`[Sub] 🎯 Embedded English: ${url.substring(0, 60)}...`);
            }
        }
        return results;
    };

    // Network Response Handler
    const responseHandler = async (response) => {
        const url = response.url();
        const status = response.status();
        if (status >= 400) return;

        // 🎯 Capture M3U8 URLs - ONLY from vipstream-S (after server switch)
        // We do NOT want the default server's M3U8 - skip it entirely
        if (url.includes('.m3u8') && !url.includes('blob:')) {
            // Only capture AFTER we've switched to vipstream-S
            if (!serverSwitched) {
                console.log(`[M3U8] ⏭️ SKIPPED (before server switch): ${url.substring(0, 60)}...`);
                return;
            }

            // Capture vipstream-S M3U8
            if (!vipstreamM3U8) {
                vipstreamM3U8 = url;
                foundM3U8 = url;
                console.log(`[M3U8] ⭐ VIPSTREAM-S M3U8 CAPTURED!`);
                console.log(`[M3U8] URL: ${url.substring(0, 100)}...`);
                try {
                    capturedReferer = response.request().headers()['referer'] || page.url();
                } catch (e) {
                    capturedReferer = page.url();
                }
            }
        }

        // Track player iframe loading AND extract subtitle config from vfx.php
        if (url.includes('vipstream') || url.includes('vfx.php')) {
            console.log(`[Player] 🎬 Player iframe detected: ${url.substring(0, 80)}...`);
            playerIframeFound = true;

            // Try to extract subtitle config from the response body
            try {
                const contentType = response.headers()['content-type'] || '';
                if (contentType.includes('text/html') || contentType.includes('application/javascript')) {
                    const body = await response.text();

                    // Look for PlayerJS subtitle config: "subtitle":"[English]url,[Dutch]url,..."
                    const subtitleMatch = body.match(/"subtitle"\s*:\s*"([^"]+)"/);
                    if (subtitleMatch && subtitleMatch[1]) {
                        const subtitleConfig = subtitleMatch[1];
                        console.log(`[Sub] 📜 Found subtitle config in vfx.php (${subtitleConfig.length} chars)`);

                        const parsed = parseSubtitleConfig(subtitleConfig);
                        if (parsed.length > 0) {
                            embeddedSubtitles.push(...parsed);
                            console.log(`[Sub] ✅ Extracted ${parsed.length} embedded English subtitle(s)`);
                        }
                    }

                    // Also try alternative pattern: subtitle: "[English]url,..."
                    const altMatch = body.match(/subtitle\s*:\s*"([^"]+)"/);
                    if (altMatch && altMatch[1] && embeddedSubtitles.length === 0) {
                        const parsed = parseSubtitleConfig(altMatch[1]);
                        if (parsed.length > 0) {
                            embeddedSubtitles.push(...parsed);
                            console.log(`[Sub] ✅ Extracted ${parsed.length} embedded English subtitle(s) (alt pattern)`);
                        }
                    }
                }
            } catch (e) {
                console.log(`[Sub] ⚠️ Could not read vfx.php body: ${e.message}`);
            }
        }

        // 📜 Capture direct VTT/SRT URLs from network requests
        if ((url.includes('.vtt') || url.includes('.srt')) && !url.includes('blob:')) {
            if (!foundSubtitles.some(s => s.file === url)) {
                console.log(`[Sub] Found direct: ${url.substring(0, 80)}...`);
                foundSubtitles.push({ label: 'English', lang: 'en', file: url, source: 'network' });
            }
        }
    };

    const requestHandler = (req) => req.continue();

    // 🛡️ Setup page interception with error recovery
    // This is critical: if page is corrupted, we need to restart browser
    try {
        await page.setRequestInterception(true);
        page.on('request', requestHandler);
        page.on('response', responseHandler);
    } catch (setupError) {
        console.error('[Setup] ❌ Page setup failed:', setupError.message);

        // Check if this is a TargetCloseError (page context corrupted)
        const isTargetClosed = setupError.message.includes('Target closed') ||
                               setupError.message.includes('Protocol error') ||
                               setupError.message.includes('Session closed');

        if (isTargetClosed) {
            console.log('[Setup] 🔄 Target closed detected - forcing browser restart...');
            // Force browser restart
            try {
                if (browserInstance) await browserInstance.close().catch(() => {});
            } catch (e) {}
            browserInstance = null;
            pageInstance = null;

            releaseLock('target-closed-setup');
            return res.status(503).json({
                success: false,
                error: 'Browser session expired, please retry',
                retry: true
            });
        }

        releaseLock('setup-failed');
        return res.status(500).json({ success: false, error: 'Page setup failed: ' + setupError.message });
    }

    try {
        // Build target URL
        const targetUrl = type === 'movie'
            ? CONFIG.getMovieUrl(tmdbId, imdbId)
            : CONFIG.getTvUrl(tmdbId, imdbId, season, episode);

        console.log(`[Nav] Going to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); // Faster: domcontentloaded instead of networkidle2
        console.log(`[Nav] Redirected to: ${page.url()}`);

        await sleep(500); // Reduced from 1000ms

        // ========================================
        // 🚀 OPTIMIZED STEP 1: Handle Interstitial Ad FAST
        // ========================================
        console.log('[Step 1] Handling interstitial ad (fast mode)...');

        for (let i = 0; i < 5; i++) { // Reduced to 5 iterations max
            // 🚀 EARLY EXIT
            if (vipstreamM3U8) {
                console.log('[Step 1] ⚡ M3U8 captured - skipping!');
                break;
            }

            const pageState = await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';
                const hasInterstitial = bodyText.includes('Go to website') || bodyText.toLowerCase().includes('skip ad');
                const hasCountdown = bodyText.includes('Please wait');
                const hasError = bodyText.includes('Error! Contact support');

                // Find Skip ad button
                let skipPos = null;
                if (hasInterstitial) {
                    for (const el of document.querySelectorAll('*')) {
                        const text = el.textContent?.trim().toLowerCase();
                        if (text === 'skip ad' || text === 'skip') {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 10 && rect.height > 10 && rect.y < 100) {
                                skipPos = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                                break;
                            }
                        }
                    }
                }
                return { hasInterstitial, hasCountdown, hasError, skipPos };
            });

            if (pageState.hasError) {
                console.log('[Ad] ⚠️ Error - reloading...');
                await page.reload({ waitUntil: 'domcontentloaded' });
                await sleep(1500);
                continue;
            }

            if (!pageState.hasInterstitial) {
                console.log('[Ad] ✅ Clear');
                break;
            }

            if (pageState.skipPos) {
                await page.mouse.move(pageState.skipPos.x, pageState.skipPos.y, { steps: 5 }); // Faster move
                await sleep(200); // Reduced
                await page.mouse.click(pageState.skipPos.x, pageState.skipPos.y);
                console.log('[Ad] ✅ Clicked Skip Ad');
                await sleep(800); // Reduced
                await closeAllPopups(browser, mainPage);
                await sleep(500); // Reduced
                break; // Exit after clicking skip - don't wait more
            }

            await sleep(pageState.hasCountdown ? 800 : 500); // Faster polling
        }

        await closeAllPopups(browser, mainPage);

        // ========================================
        // 🚀 OPTIMIZED STEP 2: Click Play & Find SERVERS (Combined)
        // Look for SERVERS button while clicking play - saves time
        // ========================================
        console.log('[Step 2] Click play & find SERVERS button...');

        let serversFound = false;
        for (let attempt = 0; attempt < 5; attempt++) { // Reduced to 5
            await closeAllPopups(browser, mainPage);

            if (vipstreamM3U8) {
                console.log('[Step 2] ⚡ M3U8 captured!');
                break;
            }

            // Check for both play button AND SERVERS button in one evaluation
            const pageElements = await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';

                // Check for SERVERS button first (higher priority)
                let serversPos = null;
                for (const el of document.querySelectorAll('*')) {
                    const text = el.textContent?.trim();
                    if (text && text.toUpperCase() === 'SERVERS') {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 30 && rect.height > 15 && rect.y < 200) {
                            serversPos = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                            break;
                        }
                    }
                }

                // Check for play button
                let playPos = null;
                const playEl = document.querySelector('.play-button') ||
                              document.querySelector('svg#play') ||
                              document.querySelector('#play') ||
                              document.querySelector('[class*="play-button"]');
                if (playEl) {
                    const rect = playEl.getBoundingClientRect();
                    playPos = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                }

                // Check for player iframe
                const hasIframe = [...document.querySelectorAll('iframe')].some(
                    f => f.src?.includes('vipstream') || f.src?.includes('vfx.php')
                );

                return { serversPos, playPos, hasIframe, hasError: bodyText.includes('Error! Contact support') };
            });

            if (pageElements.hasError) {
                await page.reload({ waitUntil: 'domcontentloaded' });
                await sleep(1500);
                continue;
            }

            // If SERVERS button found, we can proceed to server selection!
            if (pageElements.serversPos) {
                console.log('[Step 2] ✅ SERVERS button found - skipping play click!');
                serversFound = true;
                break;
            }

            // If iframe loaded, we can proceed
            if (pageElements.hasIframe || playerIframeFound) {
                console.log('[Step 2] ✅ Player iframe detected');
                break;
            }

            // Click play button if found
            if (pageElements.playPos) {
                await page.mouse.move(pageElements.playPos.x, pageElements.playPos.y, { steps: 8 }); // Faster
                await sleep(300); // Reduced
                await page.mouse.click(pageElements.playPos.x, pageElements.playPos.y);
                console.log(`[Step 2] Clicked play (attempt ${attempt + 1})`);
            } else {
                // Click center as fallback
                await page.mouse.click(640, 400);
            }

            await sleep(1000); // Reduced from 2000
            await closeAllPopups(browser, mainPage);
        }

        // Quick iframe play click (non-blocking style)
        if (!serversFound) {
            const frames = page.frames();
            for (const frame of frames) {
                const frameUrl = frame.url();
                if (frameUrl.includes('vipstream') || frameUrl.includes('vfx.php') || frameUrl.includes('player')) {
                    try {
                        await frame.evaluate(() => {
                            const pljsPlay = document.querySelector('.pljsplay');
                            if (pljsPlay) pljsPlay.click();
                            const video = document.querySelector('video');
                            if (video) video.play().catch(() => { });
                        });
                    } catch (e) { }
                }
            }
            await sleep(500); // Brief wait
        }

        // ========================================
        // 🚀 OPTIMIZED STEP 3: Select VIPStream-S Server (FAST)
        // ========================================
        console.log('[Step 3] Selecting VIPStream-S server (fast mode)...');

        let serverSelected = false;
        for (let attempt = 0; attempt < 4; attempt++) { // Reduced to 4
            // 🚀 EARLY EXIT
            if (vipstreamM3U8) {
                console.log('[Step 3] ⚡ M3U8 captured!');
                serverSelected = true;
                break;
            }

            // Look for SERVERS button
            const serversButton = await page.evaluate(() => {
                for (const el of document.querySelectorAll('*')) {
                    const text = el.textContent?.trim();
                    if (text && text.toUpperCase() === 'SERVERS') {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 30 && rect.height > 15 && rect.y < 200) {
                            return { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                        }
                    }
                }
                return { found: false };
            });

            if (!serversButton.found) {
                console.log(`[Server] SERVERS not found (attempt ${attempt + 1})`);
                await sleep(1000); // Reduced
                continue;
            }

            // Click SERVERS to open dropdown
            await page.mouse.move(serversButton.x, serversButton.y, { steps: 5 }); // Faster
            await sleep(200); // Reduced
            await page.mouse.click(serversButton.x, serversButton.y);
            console.log('[Server] ✅ Clicked SERVERS');

            await sleep(800); // Reduced from 1500ms
            await closeAllPopups(browser, mainPage);

            // Look for vipstream-S in the dropdown (simplified)
            const vipstreamOption = await page.evaluate(() => {
                let bestMatch = null;
                let smallestArea = Infinity;

                for (const el of document.querySelectorAll('*')) {
                    const text = el.textContent?.trim().toLowerCase() || '';
                    if (text === 'vipstream-s' || (text.includes('vipstream-s') && text.length < 20)) {
                        const rect = el.getBoundingClientRect();
                        const area = rect.width * rect.height;
                        if (rect.width > 30 && rect.height > 10 && rect.y > 30 && area < smallestArea) {
                            smallestArea = area;
                            bestMatch = { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                        }
                    }
                }
                return bestMatch || { found: false };
            });

            if (vipstreamOption.found) {
                await page.mouse.move(vipstreamOption.x, vipstreamOption.y, { steps: 5 }); // Faster
                await sleep(200); // Reduced from 600ms
                await page.mouse.click(vipstreamOption.x, vipstreamOption.y);
                console.log('[Server] ✅ Clicked vipstream-S');

                serverSwitched = true; // Mark IMMEDIATELY after clicking
                serverSelected = true;

                await sleep(500); // Brief wait for server switch to start
                await closeAllPopups(browser, mainPage);

                // 🚀 Don't wait for verification - M3U8 will be captured by network handler
                console.log('[Server] ✅ Server switch initiated');
                break;
            } else {
                console.log('[Server] vipstream-S not found, retrying...');
                await page.mouse.click(100, 100); // Close dropdown
                await sleep(500);
            }
        }

        // ========================================
        // 🚀 OPTIMIZED STEP 4: Wait for M3U8 (minimal waiting)
        // Network handler captures M3U8 automatically after serverSwitched=true
        // ========================================
        console.log('[Step 4] Waiting for vipstream-S M3U8...');

        // Give network handler time to capture M3U8
        for (let i = 0; i < 8; i++) { // Max 4 seconds wait
            if (vipstreamM3U8) {
                foundM3U8 = vipstreamM3U8;
                console.log(`[Step 4] ⚡ M3U8 captured in ${(i + 1) * 0.5}s!`);
                break;
            }

            await sleep(500);

            // After 2 seconds, try clicking play in iframe to trigger M3U8 load
            if (i === 4 && !vipstreamM3U8) {
                console.log('[Step 4] Clicking in iframe to trigger playback...');
                for (const frame of page.frames()) {
                    const frameUrl = frame.url();
                    if (frameUrl.includes('vipstream') || frameUrl.includes('vfx.php')) {
                        try {
                            await frame.evaluate(() => {
                                const pljsPlay = document.querySelector('.pljsplay');
                                if (pljsPlay) pljsPlay.click();
                                const video = document.querySelector('video');
                                if (video) video.play().catch(() => { });
                            });
                        } catch (e) { }
                    }
                }
                await closeAllPopups(browser, mainPage);
            }
        }

        // Final check
        if (vipstreamM3U8) {
            foundM3U8 = vipstreamM3U8;
        }

        // ========================================
        // STEP 5: REMOVED - Subtitles are now captured from vfx.php network response
        // This was redundant and added 20-30 seconds of unnecessary waiting
        // Embedded subtitles are extracted automatically in the responseHandler
        // ========================================

    } catch (e) {
        console.error('[Extract] Error:', e.message);

        // Check if this is a TargetCloseError (page context corrupted)
        const isTargetClosed = e.message.includes('Target closed') ||
                               e.message.includes('Protocol error') ||
                               e.message.includes('Session closed') ||
                               e.message.includes('Execution context');

        // Try cleanup even on error
        try {
            page.off('response', responseHandler);
            page.off('request', requestHandler);
            browser.off('targetcreated', popupHandler);
            await page.setRequestInterception(false);
        } catch (cleanupErr) { }

        // Handle TargetCloseError - force browser restart
        if (isTargetClosed) {
            console.log('[Extract] 🔄 Target closed during extraction - forcing browser restart...');
            try {
                if (browserInstance) await browserInstance.close().catch(() => {});
            } catch (closeErr) {}
            browserInstance = null;
            pageInstance = null;

            releaseLock('target-closed-extraction');
            return res.status(503).json({
                success: false,
                error: 'Browser session expired, please retry',
                retry: true
            });
        }

        releaseLock('extraction-error');
        return res.status(500).json({ success: false, error: 'Extraction error: ' + e.message });
    }

    // Cleanup - IMPORTANT: remove all handlers and disable interception
    try {
        page.off('response', responseHandler);
        page.off('request', requestHandler);
        browser.off('targetcreated', popupHandler);
        await page.setRequestInterception(false);
    } catch (e) { }

    // Return results
    if (foundM3U8) {
        const referer = capturedReferer || 'https://streamingnow.mov/';
        console.log(`[Result] ✅ VIPSTREAM-S M3U8 CAPTURED!`);
        console.log(`[Result] M3U8: ${foundM3U8.substring(0, 80)}...`);

        const proxyBase = `http://${req.get('host')}`;
        const proxiedM3U8 = `${proxyBase}/api/proxy/m3u8?url=${encodeURIComponent(foundM3U8)}&referer=${encodeURIComponent(referer)}`;

        // PRIORITY: Use embedded subtitles from source (perfectly synced)
        // Fall back to Subdl API only if no embedded found
        let finalSubtitles = [];

        // 1. Check embedded subtitles (from PlayerJS config - best quality, synced)
        if (embeddedSubtitles.length > 0) {
            console.log(`[Result] 🎯 Using ${embeddedSubtitles.length} EMBEDDED subtitle(s) from source (perfectly synced)`);
            // Proxy embedded subtitle URLs to avoid CORS issues
            finalSubtitles = embeddedSubtitles.map(sub => ({
                ...sub,
                file: `${proxyBase}/api/proxy/segment?url=${encodeURIComponent(sub.file)}&referer=${encodeURIComponent(referer)}`
            }));
        }
        // 2. Check direct network subtitles
        else if (foundSubtitles.length > 0) {
            console.log(`[Result] 📡 Using ${foundSubtitles.length} subtitle(s) from network requests`);
            // Proxy network subtitle URLs to avoid CORS issues
            finalSubtitles = foundSubtitles.map(sub => ({
                ...sub,
                file: `${proxyBase}/api/proxy/segment?url=${encodeURIComponent(sub.file)}&referer=${encodeURIComponent(referer)}`
            }));
        }
        // 3. Fall back to Subdl API
        else {
            console.log('[Result] 📥 No embedded subtitles found, fetching from Subdl API...');
            const subdlSubtitles = await fetchSubtitlesFromSubdl(
                tmdbId,
                type,
                type === 'tv' ? season : null,
                type === 'tv' ? episode : null
            );
            finalSubtitles = subdlSubtitles;
        }

        // Release extraction lock
        releaseLock('success');

        // Build response
        const responseData = {
            success: true,
            m3u8Url: foundM3U8,
            proxiedM3U8Url: proxiedM3U8,
            subtitles: finalSubtitles,
            referer: referer,
            provider: 'vipstream-s'
        };

        // 💾 CACHE the successful result for instant future requests
        setCachedStream(contentId, responseData);

        res.json(responseData);
    } else {
        console.log('[Result] ❌ FAILED - No M3U8 found');
        // Release extraction lock
        releaseLock('no-m3u8-found');
        res.status(500).json({ success: false, error: 'Failed to extract M3U8 stream' });
    }
});

// ============ PROXY ENDPOINTS ============

app.get('/api/proxy/m3u8', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('Missing url');

    const decodedUrl = decodeURIComponent(url);
    const decodedReferer = referer ? decodeURIComponent(referer) : 'https://streamingnow.mov/';

    console.log(`[Proxy M3U8] ${decodedUrl.substring(0, 60)}...`);

    try {
        const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
        const isWorkersUrl = decodedUrl.includes('workers.dev');

        // Build headers for M3U8 request
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': decodedReferer
        };

        // For workers.dev, don't send Origin (causes issues)
        if (!isWorkersUrl) {
            headers['Origin'] = new URL(decodedReferer).origin;
        }

        const response = await axios({
            method: 'get',
            url: decodedUrl,
            responseType: 'text',
            headers: headers,
            timeout: 15000
        });

        let content = response.data;
        const proxyBase = `http://${req.get('host')}`;

        // For segments from workers.dev, use the M3U8 URL as referer (what real players do)
        const segmentReferer = isWorkersUrl ? decodedUrl : decodedReferer;
        const refererParam = `&referer=${encodeURIComponent(segmentReferer)}`;

        const lines = content.split('\n');
        const rewritten = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                if (trimmed.includes('URI="')) {
                    return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
                        const abs = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href;
                        return `URI="${proxyBase}/api/proxy/segment?url=${encodeURIComponent(abs)}${refererParam}"`;
                    });
                }
                return line;
            }

            const abs = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
            if (abs.includes('.m3u8')) {
                return `${proxyBase}/api/proxy/m3u8?url=${encodeURIComponent(abs)}${refererParam}`;
            } else {
                return `${proxyBase}/api/proxy/segment?url=${encodeURIComponent(abs)}${refererParam}`;
            }
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache'); // M3U8 playlists shouldn't be cached
        res.send(rewritten.join('\n'));

    } catch (e) {
        console.error('[Proxy M3U8] Error:', e.message);
        res.status(500).send('M3U8 Proxy Error');
    }
});

app.get('/api/proxy/segment', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('Missing url');

    const decodedUrl = decodeURIComponent(url);
    const decodedReferer = referer ? decodeURIComponent(referer) : 'https://streamingnow.mov/';

    // Determine the correct origin based on the URL
    // For workers.dev CDN, we need to use a different approach
    let segmentOrigin;
    try {
        const urlObj = new URL(decodedUrl);
        segmentOrigin = urlObj.origin;
    } catch {
        segmentOrigin = new URL(decodedReferer).origin;
    }

    // Build headers that match what a browser would send
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // Don't compress video segments
        'Referer': decodedReferer,
        'Origin': segmentOrigin,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
    };

    // For workers.dev URLs, minimal headers work best
    if (decodedUrl.includes('workers.dev')) {
        delete headers['Origin'];
        delete headers['Sec-Fetch-Site'];
        delete headers['Sec-Fetch-Dest'];
        delete headers['Sec-Fetch-Mode'];
        // Workers.dev CDN sometimes rejects requests with Referer
        // Try without it for segments
        if (!decodedUrl.includes('.m3u8')) {
            delete headers['Referer'];
        }
    }

    // Retry logic for transient failures
    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await axios({
                method: 'get',
                url: decodedUrl,
                responseType: 'arraybuffer',
                headers: headers,
                timeout: 15000, // Reduced timeout for faster retry
                maxRedirects: 5
            });

            if (decodedUrl.includes('.vtt')) res.setHeader('Content-Type', 'text/vtt');
            else if (decodedUrl.includes('.srt')) res.setHeader('Content-Type', 'text/plain');
            else if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache segments for 1 hour
            return res.send(response.data);

        } catch (e) {
            lastError = e;
            const status = e.response?.status;

            // For 403, try different header configurations
            if (status === 403) {
                if (attempt === 0) {
                    // First retry: remove all extra headers
                    delete headers['Origin'];
                    delete headers['Referer'];
                    delete headers['Sec-Fetch-Dest'];
                    delete headers['Sec-Fetch-Mode'];
                    delete headers['Sec-Fetch-Site'];
                    continue;
                } else if (attempt === 1) {
                    // Second retry: try with just User-Agent
                    Object.keys(headers).forEach(key => {
                        if (key !== 'User-Agent' && key !== 'Accept') {
                            delete headers[key];
                        }
                    });
                    continue;
                }
                break;
            }

            // Don't retry on 404
            if (status === 404) {
                break;
            }

            // Retry on network errors or 5xx
            if (attempt < MAX_RETRIES) {
                await sleep(300);
            }
        }
    }

    // Track 403 failures to detect expired tokens
    if (lastError?.response?.status === 403) {
        trackSegmentFailure(decodedUrl);
    } else {
        // Only log non-403 errors to reduce log spam during seeking
        console.error('[Proxy Seg] Error:', lastError?.message || 'Unknown error');
    }
    res.status(lastError?.response?.status || 500).send('Segment Error');
});

app.get('/health', (req, res) => {
    const lockAge = extractionStartTime ? Math.round((Date.now() - extractionStartTime) / 1000) : 0;
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        browser: browserInstance ? 'running' : 'not started',
        cache: {
            size: streamCache.size,
            entries: Array.from(streamCache.keys())
        },
        extraction: {
            inProgress: isExtracting,
            contentId: lastExtractionId,
            lockAge: lockAge,
            isStale: isLockStale(),
            maxTime: MAX_EXTRACTION_TIME / 1000
        }
    });
});

// Emergency lock release endpoint (for debugging)
app.get('/api/lock/release', async (req, res) => {
    if (!isExtracting) {
        return res.json({ success: true, message: 'Lock was not held' });
    }
    console.log('[Lock] ⚠️ Manual lock release requested via API');
    releaseLock('manual-api-release');

    // Also restart browser to ensure clean state
    try {
        if (browserInstance) await browserInstance.close().catch(() => {});
    } catch (e) {}
    browserInstance = null;
    pageInstance = null;

    res.json({ success: true, message: 'Lock released and browser reset' });
});

// Report playback error - frontend can call this when video fails to play
app.post('/api/playback/error', express.json(), (req, res) => {
    const { contentId, errorType } = req.body;
    if (!contentId) {
        return res.status(400).json({ success: false, error: 'Missing contentId' });
    }

    console.log(`[Playback] ⚠️ Error reported for ${contentId}: ${errorType || 'unknown'}`);

    // Invalidate cache for this content
    const deleted = streamCache.delete(contentId);
    failedSegmentCount.delete(contentId);

    res.json({
        success: true,
        cacheCleared: deleted,
        message: deleted ? 'Cache cleared, please retry' : 'No cache entry found'
    });
});

// Cache management endpoint
app.get('/api/cache/clear', (req, res) => {
    const { id } = req.query;
    if (id) {
        const deleted = streamCache.delete(id);
        console.log(`[Cache] ${deleted ? '🗑️ Cleared' : '⚠️ Not found'}: ${id}`);
        res.json({ success: deleted, message: deleted ? `Cleared cache for ${id}` : `No cache found for ${id}` });
    } else {
        const count = streamCache.size;
        streamCache.clear();
        console.log(`[Cache] 🗑️ Cleared ALL ${count} entries`);
        res.json({ success: true, message: `Cleared ${count} cached entries` });
    }
});

process.on('SIGINT', async () => {
    console.log('\n[Shutdown] Closing browser...');
    if (browserInstance) await browserInstance.close();
    process.exit(0);
});

// 🚀 PRE-WARM BROWSER on startup for faster first request
async function prewarmBrowser() {
    console.log('[Prewarm] 🔥 Starting browser pre-warm...');
    try {
        const { browser, page } = await getBrowser(false);
        console.log('[Prewarm] ✅ Browser ready! First request will be faster.');
    } catch (e) {
        console.log('[Prewarm] ⚠️ Browser pre-warm failed:', e.message);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎬 SuperEmbed VIP Stream Scraper on port ${PORT}`);
    console.log(`📡 http://localhost:${PORT}/api/extract?tmdbId=238&type=movie`);
    console.log(`📡 http://localhost:${PORT}/api/extract?tmdbId=1399&type=tv&season=1&episode=1\n`);

    // Pre-warm browser after server starts (non-blocking)
    prewarmBrowser();
});
