const { chromium } = require('playwright');
const fs = require('fs');

async function findM3u8Url() {
    const targetUrl = 'https://streamingnow.mov/?play=S0dtWlNqZUcxTUlWN0xqQVRGb0tTaXFUVStmQ3NRakRNcXVsOWtNaWljZU1nQ1JPeVdkdGhVeTN5VGl5Q21rNmRiSVcvZU9YSVo1V0pHbzZjNlhLN2F4MDNZaWhzN2hDUDhRV1dtMFRoUnl4d0YyNFJWQVRlOTAvLzBEay9ZODZwOFdFQnJYUTYvUWRGVjJNQ0ZqbndURzY5QT09';

    const allRequests = [];
    const allResponses = [];
    let foundWorkersUrl = null;

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();

    // Block new pages (popups)
    context.on('page', async (newPage) => {
        console.log('Blocking popup');
        await newPage.close().catch(() => { });
    });

    const page = await context.newPage();

    // Log ALL requests
    page.on('request', request => {
        const url = request.url();
        allRequests.push(url);
        if (url.includes('workers.dev')) {
            console.log('🎯 WORKERS.DEV REQUEST:', url);
            foundWorkersUrl = url;
        }
    });

    // Log ALL responses and try to get body for text responses
    page.on('response', async response => {
        const url = response.url();
        try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('text') || contentType.includes('json') || contentType.includes('javascript')) {
                const body = await response.text();
                allResponses.push({ url, contentType, body });

                if (body.includes('workers.dev') || body.includes('wispy-resonance')) {
                    console.log('🔥 FOUND workers.dev in response body from:', url);
                    // Extract URL
                    const match = body.match(/https?:\/\/[^\s"'<>\\]+workers\.dev[^\s"'<>\\]*/);
                    if (match) {
                        foundWorkersUrl = match[0].replace(/\\/g, '');
                        console.log('🎯 EXTRACTED URL:', foundWorkersUrl);
                    }
                }
            }
        } catch (e) { }
    });

    console.log('Navigating...');
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 }).catch(e => console.log('Nav:', e.message));

    console.log('Waiting 10s for initial load...');
    await page.waitForTimeout(10000);

    // Take screenshot
    await page.screenshot({ path: 'page_screenshot.png', fullPage: true });
    console.log('Screenshot saved');

    // Look for frames
    for (const frame of page.frames()) {
        try {
            const content = await frame.content();
            if (content.includes('workers.dev')) {
                console.log('Found in frame:', frame.url());
            }
        } catch (e) { }
    }

    // Try clicking server button
    console.log('Looking for vipstream button...');
    try {
        // Look for any clickable element with vip text
        const elements = await page.$$eval('*', els =>
            els.filter(el => el.textContent?.toLowerCase().includes('vip') && el.offsetParent !== null)
                .map(el => ({ tag: el.tagName, text: el.textContent?.trim().substring(0, 50), class: el.className }))
        );
        console.log('VIP elements:', JSON.stringify(elements.slice(0, 5)));
    } catch (e) { }

    await page.waitForTimeout(5000);

    // Save everything
    fs.writeFileSync('all_network.json', JSON.stringify({ requests: allRequests, responses: allResponses.map(r => ({ url: r.url, body: r.body?.substring(0, 2000) })) }, null, 2));

    console.log('\n=== RESULTS ===');
    console.log('Total requests:', allRequests.length);
    console.log('Total responses captured:', allResponses.length);
    console.log('Workers.dev URL:', foundWorkersUrl || 'NOT FOUND');
    console.log('Data saved to all_network.json');

    await browser.close();
}

findM3u8Url().catch(console.error);
