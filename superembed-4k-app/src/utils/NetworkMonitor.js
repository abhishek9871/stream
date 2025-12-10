export class NetworkMonitor {
    constructor() {
        this.connection = typeof navigator !== 'undefined'
            ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
            : null;
        this.quality = '4K';
    }

    startMonitoring() {
        if (this.connection) {
            this.connection.addEventListener('change', this.handleNetworkChange);
        }
    }

    stopMonitoring() {
        if (this.connection) {
            this.connection.removeEventListener('change', this.handleNetworkChange);
        }
    }

    handleNetworkChange = () => {
        if (!this.connection) return;

        const { effectiveType, downlink } = this.connection;

        if (effectiveType === '4g' || downlink > 5) {
            this.quality = '4K';
        } else if (effectiveType === '3g' || downlink > 2) {
            this.quality = '1080p';
        } else {
            this.quality = '720p';
        }
    };

    getCurrentQuality() {
        return this.quality;
    }
}
