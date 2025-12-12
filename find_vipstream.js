const { chromium } = require('playwright');
const fs = require('fs');

async function findVipStream() {
    // The main URL provided by the user
    const targetUrl = 'https://streamingnow.mov/playvideo.php?video_id=SzJDWlNUZVl5TjBkK2J2VlRFTUtUU0E9&server_id=89&token=S0dtWlNqZUcxTUlWN0xqQVRGb0tTaXFUVStmQ3NRakRNcXVsOWtNaWljZU1nQ1JPeVdkdGhVeTN5VGl5Q21rNmRiSVcvZU9YSVo1V0pHbzZjNlhLN2F4MDNZaWhzN2hDUDhRV1dtMFRoUnl4d0YyNFJWQVRlOTAvLzBEay9ZODZwOFdFQnJYUTYvUWRGVjJNQ0ZqbndURzY5TzJNNUtjb0tzRT0=&init=1';

    const workerRequests = [];

    console.log('Launching browser...');
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process', // Helps with cross-origin iframes
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Handle popups
    context.on('page', async (popup) => {
        try {
            console.log('🚫 Popup detected. Closing...');
            await popup.close();
        } catch (e) {
            console.log('⚠️ Could not close popup (already closed?):', e.message);
        }
    });

    const page = await context.newPage();

    // 1. Listen for the specific m3u8 or workers.dev requests
    page.on('request', request => {
        const url = request.url();
        if (url.includes('wispy-resonance') || url.includes('workers.dev')) {
            console.log('\n🔥 MATCH FOUND (Request):', url);
            workerRequests.push(url);
        }
    });

    page.on('response', async response => {
        const url = response.url();
        // Check response body for the URL
        if (url.includes('playvideo.php') || url.includes('vipstream')) {
            try {
                const text = await response.text();
                if (text.includes('workers.dev')) {
                    console.log('\n🔥 TEXT MATCH in response from:', url);
                    const match = text.match(/https?:\/\/[^\s"']+\.workers\.dev[^\s"']*/g);
                    if (match) match.forEach(m => console.log('  -> Extracted:', m));
                }
            } catch (e) { }
        }
    });

    try {
        console.log('Navigating to main page...');
        await page.goto(targetUrl, { waitUntil: 'commit', timeout: 30000 });
        await page.waitForTimeout(5000); // Wait a bit for initial load
    } catch (msg) {
        console.log('⚠️ Navigation warning (continuing):', msg.message);
    }

    try {

        console.log('Waiting for vipstream iframe...');
        // The player is usually inside an iframe
        const iframeElement = await page.waitForSelector('iframe[src*="vipstream"]', { timeout: 10000 });
        const frame = await iframeElement.contentFrame();

        if (!frame) {
            console.log('❌ Could not get content frame of playvideo.php');
            return;
        }
        console.log('✅ Found playvideo.php iframe');

        await frame.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        // 2. Find Server List
        // Based on CSS seen: .sources-list, .sources-toggle

        console.log('Scanning frame for server buttons...');
        // Try to open the server list if it's a dropdown
        const toggle = await frame.$('.sources-toggle');
        if (toggle) {
            console.log('Clicking sources toggle...');
            await toggle.click();
            await page.waitForTimeout(1000);
        }

        // Look for buttons text
        const buttons = await frame.$$('li, button, div.server-row, a');
        let worked = false;

        for (const btn of buttons) {
            const text = await btn.textContent();
            const lowerText = text.toLowerCase();

            if (lowerText.includes('vipstream') && lowerText.includes('s')) {
                console.log(`\nFound target button: "${text.trim()}"`);
                console.log('Clicking...');
                await btn.click();
                worked = true;
                break; // Found it
            }
        }

        if (!worked) {
            console.log('\nCould not find specific "vipstream-s" button. Dumping all potential server texts:');
            const listItems = await frame.$$('li');
            for (const li of listItems) {
                console.log(' - ' + (await li.innerText()).replace(/\n/g, ' '));
                // Try clicking "VIP Stream" if "vipstream-s" wasn't exact match
                if ((await li.innerText()).toLowerCase().includes('vip')) {
                    console.log('   (Trying to click this VIP option...)');
                    await li.dispatchEvent('click'); // distinct click
                    await page.waitForTimeout(2000);
                }
            }
        }

        console.log('\nWaiting for network activity after interaction...');
        await page.waitForTimeout(8000);

    } catch (e) {
        console.error('Error during execution:', e.message);
    }

    console.log('\n--- Final Collected URLs ---');
    workerRequests.forEach(u => console.log(u));

    // Save to file for user inspection
    fs.writeFileSync('found_urls.json', JSON.stringify({ urls: workerRequests }, null, 2));

    await browser.close();
}

findVipStream();
