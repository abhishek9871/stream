export const optimizeForMobile = () => {
    if (typeof navigator === 'undefined') return '4K';

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        return '720p';
    }

    return '4K';
};

export const isMobileDevice = () => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

export const isIndianMobileNetwork = () => {
    if (typeof navigator === 'undefined') return false;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;

    // Check for typical Indian mobile network conditions
    const { effectiveType, downlink } = connection;
    return effectiveType === '3g' || effectiveType === '2g' || downlink < 3;
};
