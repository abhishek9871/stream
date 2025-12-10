class AnalyticsService {
    static trackStreamStart(movieId, quality) {
        console.log(`Stream started: ${movieId}, Quality: ${quality}`);
    }

    static trackStreamQualityChange(movieId, fromQuality, toQuality) {
        console.log(`Quality changed: ${movieId}, ${fromQuality} → ${toQuality}`);
    }

    static trackStreamError(movieId, error) {
        console.error(`Stream error: ${movieId}`, error);
    }
}

export default AnalyticsService;
