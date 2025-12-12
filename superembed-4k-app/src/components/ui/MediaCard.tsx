import React from 'react';
import { motion } from 'framer-motion';
import { TMDB } from '../../lib/tmdb';
import { TMDBMovie } from '../../types/stream';

interface MediaCardProps {
    media: TMDBMovie;
    onClick: (media: TMDBMovie) => void;
    rank?: number;
    showType?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({ media, onClick, rank, showType = false }) => {
    const title = media.title || media.name || 'Unknown Title';
    const releaseDate = media.release_date || media.first_air_date;
    const year = releaseDate ? releaseDate.substring(0, 4) : '';
    const isTv = media.media_type === 'tv' || !!media.first_air_date;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.05, y: -10, zIndex: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative group cursor-pointer"
            onClick={() => onClick(media)}
        >
            {/* Rank Badge */}
            {rank && (
                <div className="absolute -left-6 -top-8 text-[120px] font-black text-transparent bg-clip-text bg-gradient-to-br from-white/10 to-transparent z-0 pointer-events-none font-display select-none">
                    {rank}
                </div>
            )}

            <div className="relative rounded-xl overflow-hidden aspect-[2/3] shadow-xl border border-white/5 bg-zinc-900 group-hover:shadow-2xl group-hover:shadow-primary/20 transition-all duration-500">
                <img
                    src={TMDB.getImageUrl(media.poster_path)}
                    alt={title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />

                {/* Constant Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                {/* Hover Reveal Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5">
                    {showType && (
                        <div className="mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
                                {isTv ? 'TV Series' : 'Movie'}
                            </span>
                        </div>
                    )}

                    <h3 className="text-white font-bold text-lg leading-tight mb-2 font-display">{title}</h3>

                    <div className="flex items-center justify-between text-xs text-zinc-300 mb-4 font-medium">
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-500 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">star</span>
                                {media.vote_average?.toFixed(1)}
                            </span>
                            <span>•</span>
                            <span>{year}</span>
                        </div>
                    </div>

                    <button className="w-full bg-white text-black py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-95 shadow-lg shadow-white/5">
                        <span className="material-symbols-outlined text-lg">play_arrow</span>
                        Watch
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
