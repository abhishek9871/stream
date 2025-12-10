export const getIndianServerPriority = () => {
    return [
        { name: 'StreamTape', region: 'IN', latency: 20, quality: '4K' },
        { name: 'Vidoza', region: 'IN', latency: 35, quality: '4K' },
        { name: 'StreamSB', region: 'IN', latency: 25, quality: '1080p' },
        { name: 'StreamCherry', region: 'SG', latency: 45, quality: '4K' },
        { name: 'VidCloud', region: 'US', latency: 120, quality: '4K' }
    ];
};

export const selectBestIndianServer = (servers) => {
    return servers
        .filter(server => server.region === 'IN' || server.latency < 50)
        .sort((a, b) => a.latency - b.latency)[0];
};

export const getServersByQuality = (servers, quality = '4K') => {
    return servers.filter(server => server.quality === quality);
};

export const isNearDelhi = (region) => {
    const delhiNearRegions = ['IN', 'SG', 'AE', 'HK'];
    return delhiNearRegions.includes(region);
};
