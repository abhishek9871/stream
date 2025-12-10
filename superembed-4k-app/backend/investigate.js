import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

const log = [];
function logWrite(msg) {
    console.log(msg);
    log.push(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function investigate() {
    logWrite('[Start] Launching browser...');

    let browser, page;
    try {
        const result = await connect({
            headless: false,
            turnstile: true,
            fingerprint: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720']
        });
        browser = result.browser;
        page = result.page;
        logWrite('[Start] ✅ Browser launched');
    } catch (e) {
        logWrite('[Start] ❌ Failed: ' + e.message);
        fs.writeFileSync('investigate_log.txt', log.join('\n'));
        return;
    }

    const mainPage = page;
    let popupCount = 0;

    // Popup killer
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== mainPage) {
                    popupCount++;
                    logWrite(`[Popup #${popupCount}] 🔫 Killed`);
                    await newPage.close().catch(() => { });
                    await mainPage.bringToFront().catch(() => { });
                }
            } catch (e) { }
        }
    });

    // Track M3U8
    let m3u8Urls = [];
    await page.setRequestInterception(true);
    page.on('request', req => req.continue());
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.m3u8')) {
            logWrite('[M3U8] 🎯 ' + url.substring(0, 120));
            m3u8Urls.push(url);
        }
    });

    try {
        // Navigate
        const targetUrl = 'https://multiembed.mov/directstream.php?video_id=238&tmdb=1';
        logWrite('[Nav] Going to: ' + targetUrl);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        logWrite('[Nav] Current URL: ' + page.url());

        await sleep(3000);

        // --- PHASE 1: Click the main PLAY BUTTON (circular play icon in center) ---
        // Based on screenshot: There's a circular play button in the middle of the page
        // The play button is positioned around center of the poster image
        logWrite('[Phase 1] Looking for main play button (circular icon)...');

        // First, let's identify the play button
        const playButtonInfo = await page.evaluate(() => {
            const results = [];

            // Look for SVG play icons, image play buttons, or div play buttons
            const allElements = document.querySelectorAll('svg, img, div, button, a, span');

            for (const el of allElements) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
                const id = el.id?.toLowerCase() || '';

                // Check if it looks like a play button
                const isPlayButton =
                    className.includes('play') ||
                    id.includes('play') ||
                    el.tagName === 'SVG' ||
                    (el.tagName === 'IMG' && el.src?.includes('play'));

                // Check if it's in a reasonable position (center of screen) and visible
                if (rect.width > 30 && rect.height > 30 &&
                    rect.x > 100 && rect.y > 100 &&
                    style.display !== 'none' && style.visibility !== 'hidden') {

                    // Check for circular elements (play button is usually circular)
                    const isCircular = style.borderRadius === '50%' ||
                        rect.width === rect.height ||
                        className.includes('circle');

                    if (isPlayButton || isCircular) {
                        results.push({
                            tag: el.tagName,
                            class: className.substring(0, 50),
                            id: id,
                            x: Math.round(rect.x + rect.width / 2),
                            y: Math.round(rect.y + rect.height / 2),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            circular: isCircular,
                            cursor: style.cursor
                        });
                    }
                }
            }

            return results;
        });

        logWrite('[Play] Found potential play buttons: ' + playButtonInfo.length);
        playButtonInfo.slice(0, 10).forEach(btn => {
            logWrite(`  ${btn.tag} .${btn.class} @ (${btn.x},${btn.y}) ${btn.width}x${btn.height} cursor:${btn.cursor}`);
        });

        // Click the large circular play button - it should be in the center area
        // Based on the screenshot, the window is 1280x720 and the play button is roughly at center
        // The play button appears to be around y=500-550 (below the title text)

        logWrite('[Click] Attempting to click play button in center area...');

        // Strategy: Click at multiple positions where the play button could be
        const playPositions = [
            [640, 530],  // Center-ish, where play button appears in screenshot
            [640, 500],
            [640, 480],
            [640, 450],
            [640, 400]   // Higher up just in case
        ];

        for (const [x, y] of playPositions) {
            logWrite(`[Click] Clicking at (${x}, ${y})...`);
            await page.mouse.click(x, y);
            await sleep(1000);

            // Check if a popup opened and close it
            const pages = await browser.pages();
            for (const p of pages) {
                if (p !== mainPage && !p.isClosed()) {
                    logWrite('[Popup] Closing popup...');
                    await p.close().catch(() => { });
                    await mainPage.bringToFront().catch(() => { });
                }
            }

            // Check if we got an M3U8 yet
            if (m3u8Urls.length > 0) {
                logWrite('[Click] ✅ M3U8 captured after click!');
                break;
            }
        }

        // --- PHASE 2: Handle any secondary play button that appears after first click ---
        logWrite('[Phase 2] Looking for secondary play button (if any)...');
        await sleep(2000);

        // After clicking the main poster play button, there might be another play button in the actual player
        // Check frames for play buttons
        const frames = page.frames();
        for (const frame of frames) {
            const url = frame.url();
            if (!url || url === 'about:blank') continue;

            try {
                const framePlayButtons = await frame.evaluate(() => {
                    const buttons = [];

                    // PlayerJS play button class
                    const pljsPlay = document.querySelector('.pljsplay');
                    if (pljsPlay) {
                        const rect = pljsPlay.getBoundingClientRect();
                        buttons.push({ type: 'pljsplay', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
                    }

                    // Generic play buttons
                    document.querySelectorAll('[class*="play"], .play-btn, #play, svg').forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 20 && rect.height > 20) {
                            buttons.push({
                                type: el.className?.toString().substring(0, 30) || el.tagName,
                                x: rect.x + rect.width / 2,
                                y: rect.y + rect.height / 2
                            });
                        }
                    });

                    return buttons;
                });

                if (framePlayButtons.length > 0) {
                    logWrite(`[Frame] ${url.substring(0, 60)} has ${framePlayButtons.length} play buttons`);

                    // Click the first play button in the frame
                    await frame.evaluate(() => {
                        const pljsPlay = document.querySelector('.pljsplay');
                        if (pljsPlay) {
                            pljsPlay.click();
                            return 'pljsplay';
                        }

                        const playBtn = document.querySelector('[class*="play"]');
                        if (playBtn) {
                            playBtn.click();
                            return 'play class';
                        }

                        // Try clicking center
                        const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
                        if (center) center.click();
                        return 'center';
                    });

                    logWrite('[Frame] Clicked play button in frame');
                }
            } catch (e) {
                // Cross-origin frame
            }
        }

        // --- PHASE 3: Additional clicks and wait for M3U8 ---
        logWrite('[Phase 3] Waiting for M3U8 with periodic clicks...');

        for (let i = 0; i < 30; i++) {
            await sleep(1000);

            if (m3u8Urls.length > 0) {
                logWrite('[M3U8] ✅ Got M3U8 after ' + (i + 1) + ' seconds!');
                break;
            }

            // Every 5 seconds, try clicking again
            if (i % 5 === 0 && i > 0) {
                logWrite('[Wait] ' + i + 's - Clicking again...');

                // Click center of page
                await page.mouse.click(640, 400);
                await sleep(500);

                // Close any popups
                const pages = await browser.pages();
                for (const p of pages) {
                    if (p !== mainPage && !p.isClosed()) {
                        await p.close().catch(() => { });
                        await mainPage.bringToFront().catch(() => { });
                    }
                }
            }
        }

        // --- RESULTS ---
        logWrite('\n========== RESULTS ==========');
        logWrite('Popups killed: ' + popupCount);
        logWrite('M3U8 URLs: ' + m3u8Urls.length);
        m3u8Urls.forEach(u => logWrite('  🎯 ' + u));

        if (m3u8Urls.length === 0) {
            logWrite('\n[Debug] Final frame list:');
            page.frames().forEach(f => logWrite('  - ' + f.url().substring(0, 100)));
        }

    } catch (e) {
        logWrite('[Error] ' + e.message);
        logWrite(e.stack);
    } finally {
        fs.writeFileSync('investigate_log.txt', log.join('\n'));
        await browser.close();
        logWrite('[End] Done');
    }
}

investigate();
