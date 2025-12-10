export const handleStreamingError = (error, fallbackQuality = '1080p') => {
    console.error('Streaming error:', error);

    const errorMessage = error?.message || String(error);

    if (errorMessage.includes('Network Error') || errorMessage.includes('Failed to fetch')) {
        return {
            message: 'Network issue detected. Switching to lower quality...',
            fallback: true,
            quality: fallbackQuality
        };
    }

    if (errorMessage.includes('Server Error') || errorMessage.includes('503')) {
        return {
            message: 'Server temporarily unavailable. Trying alternative...',
            retry: true
        };
    }

    if (errorMessage.includes('CORS') || errorMessage.includes('blocked')) {
        return {
            message: 'Access blocked. Trying alternative server...',
            retry: true
        };
    }

    return {
        message: 'An error occurred. Please try again later.',
        fatal: true
    };
};

export const getQualityFallback = (currentQuality) => {
    const fallbackChain = {
        '4K': '1080p',
        '1080p': '720p',
        '720p': '480p',
        '480p': null
    };

    return fallbackChain[currentQuality] || null;
};
