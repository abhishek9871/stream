import axios from 'axios';

const API_BASE = 'http://localhost:7860';

async function testMovieExtraction() {
    console.log('\n=== Testing Movie Extraction (Titanic - TMDB 597) ===\n');

    try {
        const response = await axios.get(`${API_BASE}/api/extract`, {
            params: {
                tmdbId: '597',
                type: 'movie'
            },
            timeout: 120000 // 2 minute timeout
        });

        console.log('✅ Success!');
        console.log('M3U8 URL:', response.data.m3u8Url?.substring(0, 100) + '...');
        console.log('Proxied M3U8:', response.data.proxiedM3U8Url?.substring(0, 80) + '...');
        console.log('Subtitles:', response.data.subtitles?.length || 0);
        console.log('Provider:', response.data.provider);
        console.log('Referer:', response.data.referer);

    } catch (error) {
        console.log('❌ Failed:', error.response?.data || error.message);
    }
}

async function testTVExtraction() {
    console.log('\n=== Testing TV Extraction (Game of Thrones S1E1 - TMDB 1399) ===\n');

    try {
        const response = await axios.get(`${API_BASE}/api/extract`, {
            params: {
                tmdbId: '1399',
                type: 'tv',
                season: '1',
                episode: '1'
            },
            timeout: 120000
        });

        console.log('✅ Success!');
        console.log('M3U8 URL:', response.data.m3u8Url?.substring(0, 100) + '...');
        console.log('Proxied M3U8:', response.data.proxiedM3U8Url?.substring(0, 80) + '...');
        console.log('Subtitles:', response.data.subtitles?.length || 0);
        console.log('Provider:', response.data.provider);

    } catch (error) {
        console.log('❌ Failed:', error.response?.data || error.message);
    }
}

async function testHealth() {
    console.log('\n=== Testing Health Endpoint ===\n');

    try {
        const response = await axios.get(`${API_BASE}/health`);
        console.log('✅ Server is healthy:', response.data);
    } catch (error) {
        console.log('❌ Server not running:', error.message);
        return false;
    }
    return true;
}

async function main() {
    console.log('🎬 SuperEmbed Scraper Test Suite\n');
    console.log('Make sure the scraper is running: npm start\n');

    const healthy = await testHealth();
    if (!healthy) {
        console.log('\n⚠️ Start the server first with: npm start');
        return;
    }

    await testMovieExtraction();
    await testTVExtraction();

    console.log('\n=== Tests Complete ===\n');
}

main();
