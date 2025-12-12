// Simple script to fetch and analyze the vipstream endpoint
const https = require('https');

const token = 'TG1TVFNpS0d5TUVWNUxQTFVGb0lWeWlMVStUQXJnemNJNmk2L1VNNmdzQ0ZuajVGeFdSNW1Fdz0=';
const serverIds = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

async function fetchServer(serverId) {
    return new Promise((resolve, reject) => {
        const url = `https://streamingnow.mov/vipstream_vfx.php?s=${serverId}&token=${token}`;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://streamingnow.mov/',
                'Accept': 'text/html,application/xhtml+xml'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ serverId, html: data, status: res.statusCode }));
        }).on('error', e => resolve({ serverId, error: e.message }));
    });
}

async function main() {
    console.log('Fetching server endpoints to find workers.dev URLs...\n');

    const results = [];

    for (const sid of serverIds) {
        process.stdout.write(`Server ${sid}: `);
        const result = await fetchServer(sid);

        if (result.error) {
            console.log(`Error - ${result.error}`);
            continue;
        }

        if (result.html.includes('workers.dev')) {
            const match = result.html.match(/https?:\/\/[^"'\s<>]+\.workers\.dev[^"'\s<>]*/g);
            if (match) {
                console.log(`🔥 FOUND workers.dev: ${match[0]}`);
                results.push({ serverId: sid, workerUrl: match[0] });
            }
        } else if (result.html.includes('.m3u8')) {
            const m3u8Match = result.html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/);
            if (m3u8Match) {
                console.log(`M3U8: ${m3u8Match[0].substring(0, 60)}...`);
                results.push({ serverId: sid, m3u8: m3u8Match[0] });
            }
        } else if (result.html.includes('file:')) {
            // Playerjs format: file:"url"
            const fileMatch = result.html.match(/file:\s*["']([^"']+)["']/);
            if (fileMatch) {
                console.log(`Playerjs file: ${fileMatch[1].substring(0, 60)}...`);
                results.push({ serverId: sid, file: fileMatch[1] });
            }
        } else {
            console.log(`No stream found (${result.html.length} bytes)`);
        }
    }

    console.log('\n\n========== SUMMARY ==========\n');

    const workers = results.filter(r => r.workerUrl);
    if (workers.length > 0) {
        console.log('Workers.dev URLs found:');
        workers.forEach(w => console.log(`  Server ${w.serverId}: ${w.workerUrl}`));
    } else {
        console.log('No workers.dev URLs found.');
    }

    console.log('\nAll stream URLs:');
    results.forEach(r => {
        const url = r.workerUrl || r.m3u8 || r.file || 'N/A';
        console.log(`  Server ${r.serverId}: ${url.substring(0, 80)}`);
    });

    require('fs').writeFileSync('stream_urls.json', JSON.stringify(results, null, 2));
}

main();
