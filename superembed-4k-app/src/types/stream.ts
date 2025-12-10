export interface SubtitleTrack {
    file: string;
    label: string;
    kind?: string;
    default?: boolean;
}

export interface ExtractedStream {
    success: boolean;
    m3u8Url: string;
    proxiedM3U8Url?: string;
    subtitles?: SubtitleTrack[];
    referer?: string;
    provider?: string;
    error?: string;
}

export interface MovieDetails {
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    runtime?: number;
    genres?: { id: number; name: string }[];
}

export interface TMDBMovie {
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    backdrop_path: string | null;
    media_type?: 'movie' | 'tv' | 'person';
    overview: string;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
}
