const { chromium } = require('playwright');
const fs = require('fs');

async function findWorkerUrl() {
    const results = [];

    // The base token from the original URL
    const token = 'S0dtWlNqZUcxTUlWN0xqQVRGb0tTaXFUVStmQ3NRakRNcXVsOWtNaWljZU1nQ1JPeVdkdGhVeTN5VGl5Q21rNmRiSVcvZU9YSVo1V0pHbzZjNlhLN2F4MDNZaWhzN2hDUDhRV1dtMFRoUnl4d0YyNFJWQVRlOTAvLzBEay9ZODZwOFdFQnJYUTYvUWRGVjJNQ0ZqbndURzY5TzJNNUtjb0tzRT0=';

    // Common server IDs to try - the target workers.dev URL might be on a different server
    const serverIds = [1, 2, 3, 4, 5, 10, 20, 50, 80, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 100];

    console.log('Starting browser to capture m3u8 URLs from different servers...\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    // Block popups
    context.on('page', async (page) => {
        try { await page.close(); } catch { }
    });

    for (const serverId of serverIds) {
        console.log(`\nTrying server ID: ${serverId}`);

        const page = await context.newPage();
        const foundUrls = [];

        // Listen for m3u8 and workers.dev requests
        page.on('request', req => {
            const url = req.url();
            if (url.includes('.m3u8') || url.includes('workers.dev')) {
                console.log(`  📦 Request: ${url.substring(0, 100)}...`);
                foundUrls.push({ type: 'request', url });
            }
        });

        page.on('response', async res => {
            const url = res.url();
            if (url.includes('vipstream') || url.includes('playerjs')) {
                try {
                    const text = await res.text();
                    // Look for workers.dev URL in response
                    const workerMatch = text.match(/https?:\/\/[^"'\s]+workers\.dev[^"'\s]*/g);
                    if (workerMatch) {
                        workerMatch.forEach(m => {
                            console.log(`  🔥 WORKER URL in response: ${m}`);
                            foundUrls.push({ type: 'response-worker', url: m });
                        });
                    }
                    // Look for any m3u8 URL
                    const m3u8Match = text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
                    if (m3u8Match) {
                        m3u8Match.forEach(m => {
                            console.log(`  📺 M3U8 URL in response: ${m.substring(0, 80)}...`);
                            foundUrls.push({ type: 'response-m3u8', url: m });
                        });
                    }
                } catch { }
            }
        });

        try {
            const url = `https://streamingnow.mov/vipstream_vfx.php?s=${serverId}&token=${token}`;
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(3000);
        } catch (e) {
            console.log(`  ⚠️ Error: ${e.message.substring(0, 50)}`);
        }

        if (foundUrls.length > 0) {
            results.push({ serverId, urls: foundUrls });
        }

        await page.close();
    }

    await browser.close();

    console.log('\n\n========== RESULTS ==========\n');

    // Find workers.dev URLs specifically
    const workerUrls = [];
    results.forEach(r => {
        r.urls.forEach(u => {
            if (u.url.includes('workers.dev')) {
                workerUrls.push({ serverId: r.serverId, url: u.url });
                console.log(`Server ${r.serverId}: ${u.url}`);
            }
        });
    });

    if (workerUrls.length === 0) {
        console.log('No workers.dev URLs found in any server response.');
        console.log('\nAll M3U8 URLs found:');
        results.forEach(r => {
            r.urls.forEach(u => {
                if (u.url.includes('.m3u8')) {
                    console.log(`  Server ${r.serverId}: ${u.url.substring(0, 100)}...`);
                }
            });
        });
    }

    fs.writeFileSync('server_results.json', JSON.stringify(results, null, 2));
    console.log('\nFull results saved to server_results.json');
}

findWorkerUrl();
