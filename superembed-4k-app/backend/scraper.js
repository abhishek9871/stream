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

// ============ CACHE SYSTEM ============
// Cache M3U8 URLs and subtitles by content ID (reduces repeat requests to instant)
const streamCache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours TTL

function getCachedStream(contentId) {
    const cached = streamCache.get(contentId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Cache] ✅ HIT for ${contentId} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return cached.data;
    }
    if (cached) {
        console.log(`[Cache] ⏰ EXPIRED for ${contentId}`);
        streamCache.delete(contentId);
    }
    return null;
}

function setCachedStream(contentId, data) {
    streamCache.set(contentId, { data, timestamp: Date.now() });
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
        console.log('[Extract] ⚠️ Another extraction in progress, please wait');
        return res.status(429).json({ success: false, error: 'Extraction in progress, please wait' });
    }

    isExtracting = true;
    lastExtractionId = contentId;

    // No more browser restart on content switch - just navigate to new URL
    const needsRestart = false;

    let browser, page;
    try {
        ({ browser, page } = await getBrowser(needsRestart));
    } catch (e) {
        console.error('[Browser] Launch failed:', e.message);
        isExtracting = false;
        return res.status(500).json({ success: false, error: 'Browser launch failed' });
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
    let foundSubtitles = [];
    let embeddedSubtitles = []; // Subtitles from PlayerJS config
    let capturedReferer = null;
    let playerIframeFound = false;

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

        // 🎯 Capture M3U8 URLs
        if (url.includes('.m3u8') && !url.includes('blob:')) {
            console.log(`[M3U8] 🎯 FOUND: ${url.substring(0, 100)}...`);
            if (!foundM3U8) {
                foundM3U8 = url;
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

    await page.setRequestInterception(true);
    page.on('request', requestHandler);
    page.on('response', responseHandler);

    try {
        // Build target URL
        const targetUrl = type === 'movie'
            ? CONFIG.getMovieUrl(tmdbId, imdbId)
            : CONFIG.getTvUrl(tmdbId, imdbId, season, episode);

        console.log(`[Nav] Going to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log(`[Nav] Redirected to: ${page.url()}`);

        await sleep(1000); // Reduced from 2000ms

        // ========================================
        // STEP 1: Handle Interstitial Ad
        // Interstitial has "Go to website" (left) and "Skip ad" (right)
        // MUST click Skip ad BEFORE trying to click play button
        // ========================================
        console.log('[Step 1] Checking for interstitial ad...');

        for (let i = 0; i < 15; i++) {
            // Check page state
            const pageState = await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';

                // Check for interstitial ad presence
                const hasInterstitial = bodyText.includes('Go to website') ||
                    bodyText.toLowerCase().includes('skip ad');

                // Check for countdown
                const hasCountdown = bodyText.includes('Please wait');

                // Check for error
                const hasError = bodyText.includes('Error! Contact support');

                // Find Skip ad button position (usually top-right)
                let skipPos = null;
                const allElements = [...document.querySelectorAll('*')];
                for (const el of allElements) {
                    const text = el.textContent?.trim().toLowerCase();
                    if (text === 'skip ad' || text === 'skip') {
                        const rect = el.getBoundingClientRect();
                        // Skip ad should be in top area and right side
                        if (rect.width > 10 && rect.height > 10 && rect.y < 100) {
                            skipPos = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                            break;
                        }
                    }
                }

                return { hasInterstitial, hasCountdown, hasError, skipPos };
            });

            if (pageState.hasError) {
                console.log('[Ad] ⚠️ Error detected - reloading...');
                await page.reload({ waitUntil: 'networkidle2' });
                await sleep(3000);
                continue;
            }

            if (!pageState.hasInterstitial) {
                console.log('[Ad] ✅ No interstitial - ready for play button');
                break;
            }

            if (pageState.hasCountdown) {
                console.log(`[Ad] ⏳ Countdown in progress (${i + 1}s)...`);
                await sleep(1000);
                continue;
            }

            if (pageState.skipPos) {
                console.log(`[Ad] Found Skip Ad at (${Math.round(pageState.skipPos.x)}, ${Math.round(pageState.skipPos.y)})`);

                // Move to Skip Ad slowly, pause, then click
                await page.mouse.move(pageState.skipPos.x, pageState.skipPos.y, { steps: 10 });
                await sleep(400);
                await page.mouse.click(pageState.skipPos.x, pageState.skipPos.y);
                console.log('[Ad] ✅ Clicked Skip Ad');

                // IMPORTANT: Wait for popup and close it
                await sleep(1500);
                await closeAllPopups(browser, mainPage);

                // Wait a bit more for the interstitial to fully disappear
                await sleep(2000);
            } else {
                console.log(`[Ad] Interstitial present but no Skip button yet (${i + 1}s)`);
            }

            await sleep(1000);
        }

        // Extra cleanup
        await closeAllPopups(browser, mainPage);
        await sleep(500); // Reduced from 1000ms

        // ========================================
        // STEP 2: Verify interstitial is gone before clicking play
        // ========================================
        console.log('[Step 2] Verifying ad cleared before clicking play...');

        const stillHasAd = await page.evaluate(() => {
            const bodyText = document.body?.innerText || '';
            return bodyText.includes('Go to website') || bodyText.toLowerCase().includes('skip ad');
        });

        if (stillHasAd) {
            console.log('[Warning] Interstitial still present - waiting more...');
            await sleep(3000);
            await closeAllPopups(browser, mainPage);
        }

        // ========================================
        // STEP 3: Click Play Button
        // Only do this AFTER interstitial is confirmed gone
        // ========================================
        console.log('[Step 3] Clicking Play button...');

        for (let attempt = 0; attempt < 15; attempt++) {
            // Close any popups first
            await closeAllPopups(browser, mainPage);

            if (foundM3U8) {
                console.log('[Step 2] ✅ M3U8 already captured!');
                break;
            }

            // Check if player iframe has appeared
            const hasPlayerIframe = await page.evaluate(() => {
                const iframes = document.querySelectorAll('iframe');
                for (const iframe of iframes) {
                    const src = iframe.src || '';
                    if (src.includes('vipstream') || src.includes('vfx.php') || src.includes('player')) {
                        return true;
                    }
                }
                return false;
            });

            if (hasPlayerIframe || playerIframeFound) {
                console.log('[Step 2] ✅ Player iframe detected!');
                break;
            }

            // Get the play button position and use real mouse hover + click
            const playButtonPos = await page.evaluate(() => {
                // Try .play-button container first
                let el = document.querySelector('.play-button');
                if (!el) el = document.querySelector('svg#play');
                if (!el) el = document.querySelector('#play');
                if (!el) el = document.querySelector('[class*="play-button"]');
                if (!el) el = document.querySelector('[class*="play"]');

                if (el) {
                    const rect = el.getBoundingClientRect();
                    return {
                        found: true,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                        selector: el.className || el.id || el.tagName
                    };
                }
                return { found: false };
            });

            // Check for error message and reload if needed
            const hasError = await page.evaluate(() => {
                return document.body?.innerText?.includes('Error! Contact support') || false;
            });

            if (hasError) {
                console.log('[Error] ⚠️ "Error! Contact support" detected - reloading...');
                await page.reload({ waitUntil: 'networkidle2' });
                await sleep(3000);
                continue;
            }

            if (playButtonPos.found) {
                console.log(`[Click] Attempt ${attempt + 1}: Play button at (${Math.round(playButtonPos.x)}, ${Math.round(playButtonPos.y)})`);

                // Mimic real user: SLOW move, longer hover, then click
                await page.mouse.move(playButtonPos.x, playButtonPos.y, { steps: 15 });
                await sleep(500); // Longer hover
                await page.mouse.click(playButtonPos.x, playButtonPos.y);
            } else {
                console.log(`[Click] Attempt ${attempt + 1}: No play button, clicking center`);
                await page.mouse.move(640, 400, { steps: 10 });
                await sleep(400);
                await page.mouse.click(640, 400);
            }

            // Wait for popup and close it
            await sleep(2000);
            await closeAllPopups(browser, mainPage);
        }

        // ========================================
        // STEP 3: Handle Player Iframe - Click Second Play Button
        // ========================================
        console.log('[Step 3] Looking for player iframe and second play button...');

        await sleep(2000);

        // Find and interact with player iframe
        const frames = page.frames();
        for (const frame of frames) {
            const frameUrl = frame.url();
            if (frameUrl.includes('vipstream') || frameUrl.includes('vfx.php') || frameUrl.includes('player')) {
                console.log(`[Frame] Found player frame: ${frameUrl.substring(0, 80)}`);

                try {
                    // Click play button inside iframe (PlayerJS uses .pljsplay)
                    await frame.evaluate(() => {
                        // Try PlayerJS play button
                        const pljsPlay = document.querySelector('.pljsplay');
                        if (pljsPlay) {
                            pljsPlay.click();
                            return 'pljsplay';
                        }

                        // Try video element
                        const video = document.querySelector('video');
                        if (video) {
                            video.play().catch(() => { });
                            video.click();
                            return 'video';
                        }

                        // Try generic play
                        const playEl = document.querySelector('[class*="play"]');
                        if (playEl) {
                            playEl.click();
                            return 'play-class';
                        }

                        // Click center
                        const center = document.elementFromPoint(
                            window.innerWidth / 2,
                            window.innerHeight / 2
                        );
                        if (center) center.click();
                        return 'center';
                    });
                    console.log('[Frame] Clicked play inside iframe');
                } catch (e) {
                    console.log('[Frame] Could not interact with iframe:', e.message);
                }
            }
        }

        // ========================================
        // STEP 3.5: Select VIPStream-S Server
        // Now that player is visible, click SERVERS and select vipstream-S
        // ========================================
        console.log('[Step 3.5] Selecting VIPStream-S server...');

        // Reset M3U8 capture - we want the one from vipstream-S, not the default server
        foundM3U8 = null;
        capturedReferer = null;
        playerIframeFound = false;

        let serverSelected = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            // Look for SERVERS button
            const serversButton = await page.evaluate(() => {
                const allElements = [...document.querySelectorAll('*')];
                for (const el of allElements) {
                    const text = el.textContent?.trim();
                    if (text && (text.toUpperCase() === 'SERVERS' || text.toUpperCase().includes('SERVERS'))) {
                        const rect = el.getBoundingClientRect();
                        // SERVERS button should be visible and in upper portion
                        if (rect.width > 30 && rect.height > 15 && rect.y < 200 && rect.x > 0) {
                            return { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                        }
                    }
                }
                return { found: false };
            });

            if (!serversButton.found) {
                console.log(`[Server] SERVERS button not found yet (attempt ${attempt + 1})`);
                await sleep(2000);
                continue;
            }

            console.log(`[Server] Found SERVERS button at (${Math.round(serversButton.x)}, ${Math.round(serversButton.y)})`);

            // Click SERVERS to open dropdown
            await page.mouse.move(serversButton.x, serversButton.y, { steps: 8 });
            await sleep(400);
            await page.mouse.click(serversButton.x, serversButton.y);
            console.log('[Server] ✅ Clicked SERVERS button');

            await sleep(1500); // Wait for dropdown to appear (reduced from 2000ms)
            await closeAllPopups(browser, mainPage);

            // Look for vipstream-S in the dropdown
            // Be VERY precise - find the smallest element with exact text "vipstream-S"
            const vipstreamOption = await page.evaluate(() => {
                const allElements = [...document.querySelectorAll('*')];
                let bestMatch = null;
                let smallestArea = Infinity;

                for (const el of allElements) {
                    // Get direct text content (not including children)
                    const directText = Array.from(el.childNodes)
                        .filter(node => node.nodeType === Node.TEXT_NODE)
                        .map(node => node.textContent.trim())
                        .join('');

                    const fullText = el.textContent?.trim().toLowerCase() || '';
                    const directLower = directText.toLowerCase();

                    // Match "vipstream-s" exactly or as direct text
                    if (directLower === 'vipstream-s' ||
                        fullText === 'vipstream-s' ||
                        (directLower.includes('vipstream-s') && directLower.length < 30)) {

                        const rect = el.getBoundingClientRect();
                        const area = rect.width * rect.height;

                        // Must be visible and reasonably sized
                        if (rect.width > 30 && rect.height > 10 && rect.y > 30 && area > 0) {
                            // Prefer smaller elements (the actual clickable link, not container)
                            if (area < smallestArea) {
                                smallestArea = area;
                                bestMatch = {
                                    found: true,
                                    x: rect.x + rect.width / 2,
                                    y: rect.y + rect.height / 2,
                                    text: fullText,
                                    width: rect.width,
                                    height: rect.height
                                };
                            }
                        }
                    }
                }

                return bestMatch || { found: false };
            });

            if (vipstreamOption.found) {
                console.log(`[Server] Found vipstream-S at (${Math.round(vipstreamOption.x)}, ${Math.round(vipstreamOption.y)}) size: ${Math.round(vipstreamOption.width)}x${Math.round(vipstreamOption.height)}`);

                // Move SLOWLY to the element
                await page.mouse.move(vipstreamOption.x, vipstreamOption.y, { steps: 15 });
                await sleep(600); // Hover for a moment

                // Click it
                await page.mouse.click(vipstreamOption.x, vipstreamOption.y);
                console.log('[Server] ✅ Clicked vipstream-S');

                // Wait for page to start loading new server
                await sleep(2500); // Reduced from 4000ms
                await closeAllPopups(browser, mainPage);

                // Verify we're now loading vipstream and NOT another server
                const verification = await page.evaluate(() => {
                    const bodyText = document.body?.innerText?.toLowerCase() || '';
                    const iframes = document.querySelectorAll('iframe');
                    let hasVipstream = false;

                    for (const iframe of iframes) {
                        if (iframe.src?.toLowerCase().includes('vipstream')) {
                            hasVipstream = true;
                        }
                    }

                    // Check for loading indicators
                    const hasStreamtape = bodyText.includes('streamtape');
                    const hasError = bodyText.includes('error') || bodyText.includes('failed');

                    return { hasVipstream, hasStreamtape, hasError };
                });

                if (verification.hasStreamtape) {
                    console.log('[Server] ⚠️ Streamtape loaded instead - will retry server selection');
                    // Close dropdown and try again
                    await page.mouse.click(100, 100);
                    await sleep(1000);
                    continue;
                }

                serverSelected = true;
                console.log('[Server] ✅ VIPStream-S server selected successfully');
                break;
            } else {
                console.log('[Server] vipstream-S not found in dropdown, retrying...');
                // Click somewhere else to close dropdown
                await page.mouse.click(100, 100);
                await sleep(1000);
            }
        }

        if (serverSelected) {
            // ========================================
            // STEP 3.6: Handle Access Content / Play Now after server switch
            // ========================================
            console.log('[Step 3.6] Handling Access Content interstitial...');

            for (let i = 0; i < 15; i++) {
                const accessContent = await page.evaluate(() => {
                    const bodyText = document.body?.innerText || '';

                    // Check for waiting countdown
                    if (bodyText.includes('Please wait')) {
                        return { waiting: true };
                    }

                    // Check for Access Content / Play Now
                    if (bodyText.includes('Access Content') || bodyText.includes('Play Now')) {
                        const allElements = [...document.querySelectorAll('*')];
                        for (const el of allElements) {
                            const text = el.textContent?.trim();
                            if (text === 'Play Now') {
                                const rect = el.getBoundingClientRect();
                                if (rect.width > 50 && rect.height > 20) {
                                    return { hasPlayNow: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                                }
                            }
                        }
                        return { hasAccessContent: true };
                    }

                    return { clear: true };
                });

                if (accessContent.clear) {
                    console.log('[Access] ✅ No interstitial');
                    break;
                }

                if (accessContent.waiting) {
                    console.log(`[Access] ⏳ Waiting for countdown (${i + 1}s)...`);
                    await sleep(1000);
                    continue;
                }

                if (accessContent.hasPlayNow) {
                    console.log(`[Access] Found Play Now at (${Math.round(accessContent.x)}, ${Math.round(accessContent.y)})`);
                    await page.mouse.move(accessContent.x, accessContent.y, { steps: 5 });
                    await sleep(300);
                    await page.mouse.click(accessContent.x, accessContent.y);
                    console.log('[Access] ✅ Clicked Play Now');
                    await sleep(2000);
                    await closeAllPopups(browser, mainPage);
                }

                await sleep(1000);
            }
            // ========================================
            // STEP 3.7: Handle Skip Ad again after server switch
            // ========================================
            console.log('[Step 3.7] Checking for Skip Ad after server switch...');

            // Wait a bit for ad to potentially appear
            await sleep(2000);

            for (let i = 0; i < 20; i++) { // Increased attempts
                const adState = await page.evaluate(() => {
                    const bodyText = document.body?.innerText || '';
                    const bodyLower = bodyText.toLowerCase();

                    const hasInterstitial = bodyText.includes('Go to website') ||
                        bodyLower.includes('skip ad');

                    const hasCountdown = bodyText.includes('Please wait');

                    if (hasInterstitial) {
                        // Look for Skip Ad button
                        const allElements = [...document.querySelectorAll('*')];
                        for (const el of allElements) {
                            const text = el.textContent?.trim().toLowerCase();
                            if (text === 'skip ad' || text === 'skip') {
                                const rect = el.getBoundingClientRect();
                                // Ensure it's visible and clickable
                                if (rect.width > 10 && rect.height > 10 && rect.y < 200 && rect.x > 0) {
                                    return {
                                        hasAd: true,
                                        skipPos: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
                                    };
                                }
                            }
                        }
                        return { hasAd: true, skipPos: null, hasCountdown };
                    }

                    return { clear: true };
                });

                if (adState.clear) {
                    console.log('[Ad] ✅ No Skip Ad detected');
                    break;
                }

                if (adState.hasCountdown) {
                    console.log(`[Ad] ⏳ Ad countdown in progress (${i + 1}s)...`);
                    await sleep(1000);
                    continue;
                }

                if (adState.skipPos) {
                    console.log(`[Ad] Found Skip Ad at (${Math.round(adState.skipPos.x)}, ${Math.round(adState.skipPos.y)})`);

                    // Move slowly to it
                    await page.mouse.move(adState.skipPos.x, adState.skipPos.y, { steps: 10 });
                    await sleep(500); // Wait on hover
                    await page.mouse.click(adState.skipPos.x, adState.skipPos.y);
                    console.log('[Ad] ✅ Clicked Skip Ad');

                    // IMPORTANT: Wait for popup and close it
                    await sleep(2000);
                    await closeAllPopups(browser, mainPage);

                    // Wait for ad to clear
                    await sleep(2000);
                } else {
                    console.log(`[Ad] Interstitial present, waiting for Skip button (${i + 1}s)...`);
                }

                await sleep(1000);
            }

            await closeAllPopups(browser, mainPage);

            // ========================================
            // STEP 3.8: Click Play button again after server switch
            // ========================================
            console.log('[Step 3.8] Clicking play button for vipstream-S...');

            for (let attempt = 0; attempt < 10; attempt++) {
                await closeAllPopups(browser, mainPage);

                if (foundM3U8) {
                    console.log('[Play] ✅ M3U8 captured from vipstream-S!');
                    break;
                }

                // Find play button
                const playButton = await page.evaluate(() => {
                    let el = document.querySelector('.play-button');
                    if (!el) el = document.querySelector('svg#play');
                    if (!el) el = document.querySelector('#play');
                    if (!el) el = document.querySelector('[class*="play-button"]');
                    if (!el) el = document.querySelector('[class*="play"]');

                    if (el) {
                        const rect = el.getBoundingClientRect();
                        return { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                    }
                    return { found: false };
                });

                if (playButton.found) {
                    console.log(`[Play] Attempt ${attempt + 1}: Clicking play at (${Math.round(playButton.x)}, ${Math.round(playButton.y)})`);
                    await page.mouse.move(playButton.x, playButton.y, { steps: 10 });
                    await sleep(400);
                    await page.mouse.click(playButton.x, playButton.y);
                } else {
                    console.log(`[Play] Attempt ${attempt + 1}: No play button, clicking center`);
                    await page.mouse.move(640, 400, { steps: 8 });
                    await sleep(300);
                    await page.mouse.click(640, 400);
                }

                await sleep(2000);
                await closeAllPopups(browser, mainPage);
            }

            // Click inside player iframe for vipstream-S
            await sleep(2000);
            for (const frame of page.frames()) {
                const frameUrl = frame.url();
                if (frameUrl.includes('vipstream') || frameUrl.includes('vfx.php')) {
                    console.log(`[Frame] Clicking play in vipstream-S iframe`);
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
        }

        // ========================================
        // STEP 4: Wait for M3U8 (optimized - reduced from 30 to 20 max)
        // ========================================
        console.log('[Step 4] Waiting for M3U8...');

        for (let i = 0; i < 20; i++) {
            await sleep(800); // Reduced from 1000ms

            if (foundM3U8) {
                console.log(`[M3U8] ✅ Captured after ${Math.round((i + 1) * 0.8)} seconds`);
                break;
            }

            // Every 4 iterations (~3 seconds), retry some actions
            if (i % 4 === 0 && i > 0) {
                console.log(`[Wait] ${Math.round(i * 0.8)}s - Retrying...`);
                await closeAllPopups(browser, mainPage);

                // Try clicking in player frames
                for (const frame of page.frames()) {
                    try {
                        await frame.evaluate(() => {
                            const v = document.querySelector('video');
                            if (v) v.play().catch(() => { });
                            const p = document.querySelector('.pljsplay, [class*="play"]');
                            if (p) p.click();
                        });
                    } catch (e) { }
                }
            }
        }

        // ========================================
        // STEP 5: REMOVED - Subtitles are now captured from vfx.php network response
        // This was redundant and added 20-30 seconds of unnecessary waiting
        // Embedded subtitles are extracted automatically in the responseHandler
        // ========================================

    } catch (e) {
        console.error('[Extract] Error:', e.message);
        // Release extraction lock on error
        isExtracting = false;

        // Try cleanup even on error
        try {
            page.off('response', responseHandler);
            page.off('request', requestHandler);
            browser.off('targetcreated', popupHandler);
            await page.setRequestInterception(false);
        } catch (cleanupErr) { }

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
        console.log('[Result] ✅ M3U8 FOUND');
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
        isExtracting = false;

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
        isExtracting = false;
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

        const response = await axios({
            method: 'get',
            url: decodedUrl,
            responseType: 'text',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': decodedReferer,
                'Origin': new URL(decodedReferer).origin
            },
            timeout: 15000
        });

        let content = response.data;
        const proxyBase = `http://${req.get('host')}`;
        const refererParam = `&referer=${encodeURIComponent(decodedReferer)}`;

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

    try {
        const response = await axios({
            method: 'get',
            url: decodedUrl,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': decodedReferer,
                'Origin': new URL(decodedReferer).origin
            },
            timeout: 30000
        });

        if (decodedUrl.includes('.vtt')) res.setHeader('Content-Type', 'text/vtt');
        else if (decodedUrl.includes('.srt')) res.setHeader('Content-Type', 'text/plain');
        else if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(response.data);

    } catch (e) {
        console.error('[Proxy Seg] Error:', e.message);
        res.status(500).send('Segment Error');
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        browser: browserInstance ? 'running' : 'not started',
        cache: {
            size: streamCache.size,
            entries: Array.from(streamCache.keys())
        },
        extracting: isExtracting
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
