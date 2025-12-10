import SuperEmbedService from './SuperEmbedService';
import CacheService from './CacheService';

class OptimizedSuperEmbedService {
    static async getOptimizedLinks(imdbId, tmdbId = null) {
        const cacheKey = `superembed_${imdbId}_${tmdbId}`;
        const cached = CacheService.get(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            const links = await SuperEmbedService.getStreamingLinks(imdbId, tmdbId);
            CacheService.set(cacheKey, links);
            return links;
        } catch (error) {
            throw error;
        }
    }
}

export default OptimizedSuperEmbedService;
