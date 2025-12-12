const TMDB_API_KEY = '61d95006877f80fb61358dbb78f153c3';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const TMDB = {
    getImageUrl: (path: string | null, size: 'w500' | 'original' = 'w500') => {
        if (!path) return '/placeholder-poster.png';
        return `${IMAGE_BASE_URL}/${size}${path}`;
    },

    // Movies
    getTrending: async (page = 1) => {
        const res = await fetch(`${BASE_URL}/trending/movie/week?api_key=${TMDB_API_KEY}&page=${page}`);
        return res.json();
    },

    getPopular: async (page = 1) => {
        const res = await fetch(`${BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`);
        return res.json();
    },

    getTopRated: async (page = 1) => {
        const res = await fetch(`${BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&page=${page}`);
        return res.json();
    },

    // TV Shows
    getTrendingTv: async (page = 1) => {
        const res = await fetch(`${BASE_URL}/trending/tv/week?api_key=${TMDB_API_KEY}&page=${page}`);
        return res.json();
    },

    getPopularTv: async (page = 1) => {
        const res = await fetch(`${BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&page=${page}`);
        return res.json();
    },

    getTopRatedTv: async (page = 1) => {
        const res = await fetch(`${BASE_URL}/tv/top_rated?api_key=${TMDB_API_KEY}&page=${page}`);
        return res.json();
    },

    // Search
    search: async (query: string, page = 1) => {
        const res = await fetch(`${BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
        return res.json();
    },

    // Details - Unified
    getDetails: async (id: number, type: 'movie' | 'tv' = 'movie') => {
        const res = await fetch(`${BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,similar,videos,recommendations,external_ids`);
        return res.json();
    },

    // TV Specific
    getSeasonDetails: async (tvId: number, seasonNumber: number) => {
        const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`);
        return res.json();
    }
};
