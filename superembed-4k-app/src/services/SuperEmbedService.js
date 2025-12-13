/**
 * SuperEmbed Service - Connects to the scraper backend to extract M3U8 URLs
 */

const SCRAPER_API_URL = process.env.NEXT_PUBLIC_SCRAPER_URL || 'http://localhost:7860';

class SuperEmbedService {
    /**
     * Extract M3U8 stream from the scraper backend
     * @param {string|null|undefined} imdbId - IMDB ID (e.g., 'tt0068646')
     * @param {string|number} tmdbId - TMDB ID (e.g., 238)
     * @param {string} type - 'movie' or 'tv'
     * @param {number} season - Season number (for TV)
     * @param {number} episode - Episode number (for TV)
     */
    static async extractStream(imdbId, tmdbId = null, type = 'movie', season = null, episode = null) {
        // 🚀 OPTIMIZED: Backend now targets ~10s extraction
        const maxRetries = 6; // Reduced further (backend is now ~10s)
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                // Build query params
                const params = new URLSearchParams();

                if (tmdbId) {
                    params.append('tmdbId', tmdbId.toString());
                } else if (imdbId) {
                    params.append('imdbId', imdbId);
                }

                params.append('type', type);

                if (type === 'tv' && season && episode) {
                    params.append('season', season.toString());
                    params.append('episode', episode.toString());
                }

                const url = `${SCRAPER_API_URL}/api/extract?${params.toString()}`;
                console.log('[SuperEmbedService] Fetching:', url);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                // Handle "extraction in progress" - wait and retry
                if (response.status === 429) {
                    retryCount++;
                    console.log(`[SuperEmbedService] ⏳ Extraction in progress, waiting... (attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced to 1500ms
                    continue;
                }

                // Handle "browser session expired" (503) - auto retry
                if (response.status === 503) {
                    const errorData = await response.json().catch(() => ({}));
                    if (errorData.retry) {
                        retryCount++;
                        console.log(`[SuperEmbedService] 🔄 Browser session expired, auto-retrying... (attempt ${retryCount}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for browser restart
                        continue;
                    }
                }

                const data = await response.json();

                if (data.success) {
                    console.log('[SuperEmbedService] ✅ Stream extracted successfully');
                    return {
                        success: true,
                        m3u8Url: data.proxiedM3U8Url || data.m3u8Url,
                        rawM3U8Url: data.m3u8Url,
                        subtitles: data.subtitles || [],
                        referer: data.referer,
                        provider: data.provider
                    };
                } else {
                    console.error('[SuperEmbedService] ❌ Extraction failed:', data.error);
                    return {
                        success: false,
                        error: data.error || 'Unknown error'
                    };
                }
            } catch (error) {
                console.error('[SuperEmbedService] ❌ Network error:', error);
                return {
                    success: false,
                    error: error.message || 'Network error'
                };
            }
        }

        // Exhausted retries
        console.error('[SuperEmbedService] ❌ Extraction timed out after retries');
        return {
            success: false,
            error: 'Extraction timed out - please try again'
        };
    }

    /**
     * Legacy method - now uses extractStream internally
     */
    static async getStreamingLinks(imdbId, tmdbId = null) {
        const result = await this.extractStream(imdbId, tmdbId, 'movie');

        if (result.success) {
            return [{
                url: result.m3u8Url,
                quality: 'Auto (4K)',
                type: 'hls',
                server: 'VIP Stream S',
                subtitles: result.subtitles
            }];
        }

        return [];
    }

    /**
     * Check if the scraper backend is available
     */
    static async checkHealth() {
        try {
            const response = await fetch(`${SCRAPER_API_URL}/health`);
            const data = await response.json();
            return data.status === 'ok';
        } catch {
            return false;
        }
    }

    /**
     * Get quality label for a stream
     */
    static getLinkQuality(url) {
        if (url.includes('4k') || url.includes('2160')) return '4K';
        if (url.includes('1080')) return '1080p';
        if (url.includes('720')) return '720p';
        return 'Auto';
    }
}

export default SuperEmbedService;
