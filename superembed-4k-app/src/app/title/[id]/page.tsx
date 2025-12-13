'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { TMDB } from '@/lib/tmdb';
import { Navbar } from '@/components/ui/Navbar';
import { EpisodeSelector } from '@/components/ui/EpisodeSelector';

export default function TitlePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const id = params?.id as string;
    // Allow type override via query param, default to movie but try to infer
    const typeQuery = searchParams.get('type');

    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentSeason, setCurrentSeason] = useState(1);
    const [currentEpisode, setCurrentEpisode] = useState(1);

    useEffect(() => {
        if (!id) return;

        const fetchDetails = async () => {
            setLoading(true);
            try {
                // Determine type: if query param exists, use it. 
                // Otherwise try movie, then tv? Or just assume movie if not specified?
                // The MediaCard passes type, so we should always have it in URL ideally.
                // But deep links might not.
                // For now, assume query param 'type' is passed or defaults to 'movie'
                const type = (typeQuery as 'movie' | 'tv') || 'movie';
                const data = await TMDB.getDetails(parseInt(id), type);
                setDetails({ ...data, media_type: type });
            } catch (err) {
                console.error('Failed to get details', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [id, typeQuery]);

    const handlePlay = (s?: number, e?: number) => {
        if (!details) return;

        let url = `/watch/${details.id}`;
        if (details.media_type === 'tv') {
            url += `?s=${s || currentSeason}&e=${e || currentEpisode}`;
        }
        router.push(url);
    };

    if (loading || !details) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const backdropUrl = TMDB.getImageUrl(details.backdrop_path, 'original');
    const posterUrl = TMDB.getImageUrl(details.poster_path, 'w500');
    const year = (details.release_date || details.first_air_date)?.substring(0, 4);

    return (
        <div className="min-h-screen bg-background text-foreground font-body pb-20">
            <Navbar />

            {/* Hero Backdrop */}
            <div className="relative h-[70vh] w-full overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={backdropUrl}
                        alt={details.title || details.name}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />
                </div>

                <div className="absolute inset-0 flex items-center px-4 md:px-12 lg:px-24 pt-20 z-10">
                    <div className="max-w-3xl space-y-6 animate-slide-up">
                        <div className="flex items-center gap-3">
                            {details.media_type === 'tv' && (
                                <span className="px-2 py-1 bg-white/10 backdrop-blur-md rounded border border-white/20 text-xs font-bold text-white uppercase tracking-wider">
                                    TV Series
                                </span>
                            )}
                            <span className="flex items-center gap-1 text-yellow-500 font-bold text-sm">
                                <span className="material-symbols-outlined text-base">star</span>
                                {details.vote_average?.toFixed(1)}
                            </span>
                            <span className="text-zinc-400 font-medium text-sm">{year}</span>
                            {details.runtime && (
                                <span className="text-zinc-400 font-medium text-sm">{Math.floor(details.runtime / 60)}h {details.runtime % 60}m</span>
                            )}
                        </div>

                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight font-display">
                            {details.title || details.name}
                        </h1>

                        <p className="text-zinc-300 text-lg line-clamp-3 max-w-2xl leading-relaxed">
                            {details.overview}
                        </p>

                        <div className="flex items-center gap-4 pt-4">
                            <button
                                onClick={() => handlePlay()}
                                className="px-8 py-3.5 bg-white text-black rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition-all transform hover:scale-105 shadow-lg shadow-white/10"
                            >
                                <span className="material-symbols-outlined text-2xl">play_arrow</span>
                                {details.media_type === 'tv' ? 'Continue Watching' : 'Play Movie'}
                            </button>
                            <button className="px-8 py-3.5 bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-all">
                                Trailer
                            </button>
                        </div>

                        {/* Genres */}
                        <div className="flex flex-wrap gap-2 pt-2">
                            {details.genres?.map((g: any) => (
                                <span key={g.id} className="text-xs text-zinc-500 border border-zinc-800 px-2 py-1 rounded-full">
                                    {g.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="px-4 md:px-12 lg:px-24 -mt-20 relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-12">

                {/* Left Column: Episodes or Info */}
                <div className="lg:col-span-2 space-y-8">
                    {details.media_type === 'tv' && details.seasons && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold font-display">Episodes</h2>
                            <EpisodeSelector
                                tmdbId={details.id}
                                seasons={details.seasons}
                                currentSeason={currentSeason}
                                currentEpisode={currentEpisode}
                                onEpisodeSelect={(s, e) => handlePlay(s, e)}
                            />
                        </div>
                    )}

                    {/* Similar or Recommended could go here */}
                </div>

                {/* Right Column: Meta */}
                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl space-y-4">
                        <h3 className="font-bold text-zinc-400 uppercase text-sm tracking-wider">Details</h3>

                        <div>
                            <span className="block text-xs text-zinc-500 mb-1">Status</span>
                            <span className="text-sm font-medium">{details.status}</span>
                        </div>

                        {details.created_by && details.created_by.length > 0 && (
                            <div>
                                <span className="block text-xs text-zinc-500 mb-1">Created By</span>
                                <div className="flex flex-wrap gap-2">
                                    {details.created_by.map((c: any) => (
                                        <span key={c.id} className="text-sm">{c.name}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {details.production_companies && (
                            <div>
                                <span className="block text-xs text-zinc-500 mb-1">Production</span>
                                <span className="text-sm">{details.production_companies.map((c: any) => c.name).slice(0, 2).join(', ')}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
