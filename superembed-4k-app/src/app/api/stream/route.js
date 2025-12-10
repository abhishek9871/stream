import { NextResponse } from 'next/server';

// These imports will be dynamic in the handler to avoid build-time issues
// outside of Node.js environment, although Next.js api routes run in Node by default.

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('id');

    if (!videoId) {
        return NextResponse.json({ error: 'Missing video ID' }, { status: 400 });
    }

    // We need to use 'require' dynamically or standard import if configured for server-only
    // For simplicity in this environment, we'll try standard imports but handle execution

    let browser = null;

    try {
        const puppeteer = (await import('puppeteer-extra')).default;
        const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;

        puppeteer.use(StealthPlugin());

        console.log('Launching browser for ID:', videoId);

        // Launch browser
        browser = await puppeteer.launch({
            headless: true, // Use headless for server-side
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Setup request interception to find the M3U8
        let m3u8Url = null;
        const m3u8Promise = new Promise((resolve) => {
            page.on('request', (req) => {
                const url = req.url();
                // Look for master playlist or m3u8
                if ((url.includes('.m3u8') || url.includes('master') || url.includes('playlist'))
                    && !url.includes('blob:')
                    && !url.includes('response.php')) {
                    console.log('Found potential stream URL:', url);
                    // Simple heuristic: if it looks like a stream, take it
                    if (url.includes('vipstream') || url.includes('m3u8')) {
                        m3u8Url = url;
                        resolve(url);
                    }
                }
            });
        });

        // Navigate to the player page
        // Using simple multiembed URL which redirects
        const targetUrl = `https://multiembed.mov/directstream.php?video_id=${videoId}&tmdb=0&region=IN`;
        console.log('Navigating to:', targetUrl);

        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait a bit for players to load and requests to fire
        // Sometimes we need to click "Play"
        try {
            await page.waitForSelector('img[style*="cursor: pointer"]', { timeout: 5000 });
            await page.click('img[style*="cursor: pointer"]'); // Click play button if exists
        } catch (e) {
            console.log('Play button not found or click failed, proceeding...');
        }

        // Race condition: wait for M3U8 or a fixed timeout
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 15000));
        const foundUrl = await Promise.race([m3u8Promise, timeoutPromise]);

        if (foundUrl) {
            return NextResponse.json({
                url: foundUrl,
                source: 'vipstream-s' // Assuming we got the default
            });
        } else {
            // Fallback: Check if we can extract it from page content?
            // For now, return error
            return NextResponse.json({ error: 'Stream URL not found in network traffic' }, { status: 404 });
        }

    } catch (error) {
        console.error('Puppeteer error:', error);
        return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
