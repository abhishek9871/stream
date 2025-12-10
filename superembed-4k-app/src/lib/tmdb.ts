const TMDB_API_KEY = '61d95006877f80fb61358dbb78f153c3';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const TMDB = {
    getImageUrl: (path: string | null, size: 'w500' | 'original' = 'w500') => {
        if (!path) return '/placeholder-poster.png';
        return `${IMAGE_BASE_URL}/${size}${path}`;
    },

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

    search: async (query: string, page = 1) => {
        const res = await fetch(`${BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
        return res.json();
    },

    getDetails: async (id: number, type: 'movie' | 'tv' = 'movie') => {
        const res = await fetch(`${BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,similar,videos`);
        return res.json();
    }
};
