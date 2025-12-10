class CacheService {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 48 * 60 * 60 * 1000; // 48 hours
    }

    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() - item.timestamp > this.cacheDuration) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    clear() {
        this.cache.clear();
    }
}

export default new CacheService();
