export const getIndianOptimizedServers = () => {
    return [
        { name: 'StreamTape', region: 'IN', quality: '4K', latency: 'LOW' },
        { name: 'Vidoza', region: 'IN', quality: '4K', latency: 'MEDIUM' },
        { name: 'StreamSB', region: 'IN', quality: '1080p', latency: 'LOW' },
        { name: 'StreamCherry', region: 'SG', quality: '4K', latency: 'MEDIUM' },
        { name: 'VidCloud', region: 'US', quality: '4K', latency: 'HIGH' }
    ];
};

export const filterServersByRegion = (servers, region = 'IN') => {
    return servers.filter(server => server.region === region || server.latency === 'LOW');
};
