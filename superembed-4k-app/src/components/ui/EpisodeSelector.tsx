import React, { useState, useEffect } from 'react';
import { TMDB } from '../../lib/tmdb';

interface Episode {
    id: number;
    name: string;
    overview: string;
    still_path: string | null;
    episode_number: number;
    air_date: string;
}

interface Season {
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
}

interface EpisodeSelectorProps {
    tmdbId: number;
    seasons: Season[];
    currentSeason: number;
    currentEpisode: number;
    onEpisodeSelect: (season: number, episode: number) => void;
}

export const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
    tmdbId,
    seasons,
    currentSeason,
    currentEpisode,
    onEpisodeSelect
}) => {
    const [episodes, setEpisodes] = useState<Episode[]>([]);
    const [selectedSeason, setSelectedSeason] = useState(currentSeason);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchEpisodes = async () => {
            setLoading(true);
            try {
                // Ignore Season 0 (Specials) usually, or handle separately. 
                // Currently just using selectedSeason
                const data = await TMDB.getSeasonDetails(tmdbId, selectedSeason);
                setEpisodes(data.episodes || []);
            } catch (error) {
                console.error('Failed to fetch episodes', error);
            } finally {
                setLoading(false);
            }
        };

        if (selectedSeason) {
            fetchEpisodes();
        }
    }, [tmdbId, selectedSeason]);

    return (
        <div className="w-full bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden backdrop-blur-sm">
            {/* Season Selector */}
            <div className="p-4 border-b border-white/5 bg-black/20 overflow-x-auto scrollbar-hide flex gap-2">
                {seasons.filter(s => s.season_number > 0).map((season) => (
                    <button
                        key={season.id}
                        onClick={() => setSelectedSeason(season.season_number)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${selectedSeason === season.season_number
                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                            : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        {season.name}
                    </button>
                ))}
            </div>

            {/* Episode List */}
            <div className="p-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                        {episodes.map((episode) => {
                            const isCurrent = selectedSeason === currentSeason && episode.episode_number === currentEpisode;

                            return (
                                <div
                                    key={episode.id}
                                    onClick={() => onEpisodeSelect(selectedSeason, episode.episode_number)}
                                    className={`group relative flex items-start gap-4 p-3 rounded-xl cursor-pointer border transition-all duration-300 ${isCurrent
                                        ? 'bg-primary/10 border-primary/50'
                                        : 'bg-black/20 border-transparent hover:bg-white/5 hover:border-white/10'
                                        }`}
                                >
                                    {/* Thumbnail */}
                                    <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                                        {episode.still_path ? (
                                            <img
                                                src={TMDB.getImageUrl(episode.still_path)}
                                                alt={episode.name}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                <span className="material-symbols-outlined">image</span>
                                            </div>
                                        )}

                                        {/* Play Overlay */}
                                        <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity pointer-events-none ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                            <span className="material-symbols-outlined text-white text-3xl">
                                                {isCurrent ? 'equalizer' : 'play_circle'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`text-xs font-bold uppercase tracking-wider ${isCurrent ? 'text-primary' : 'text-zinc-500'}`}>
                                                Episode {episode.episode_number}
                                            </span>
                                            <span className="text-xs text-zinc-500">{episode.air_date?.substring(0, 4)}</span>
                                        </div>
                                        <h4 className={`font-bold truncate mb-1 ${isCurrent ? 'text-primary' : 'text-zinc-200 group-hover:text-white'}`}>
                                            {episode.name}
                                        </h4>
                                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                                            {episode.overview}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
