import React from 'react';
import { motion } from 'framer-motion';
import { TMDB } from '../../lib/tmdb';

import { TMDBMovie } from '../../types/stream';

interface MovieCardProps {
    movie: TMDBMovie;
    onClick: (movie: TMDBMovie) => void;
    rank?: number;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onClick, rank }) => {
    return (
        <motion.div
            whileHover={{ scale: 1.05, y: -10 }}
            className="relative group cursor-pointer"
            onClick={() => onClick(movie)}
        >
            {/* Rank Badge for Top Rated */}
            {rank && (
                <div className="absolute -left-4 -top-6 text-[100px] font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/0 opacity-20 z-0 pointer-events-none font-display">
                    {rank}
                </div>
            )}

            <div className="relative rounded-xl overflow-hidden aspect-[2/3] shadow-lg border border-white/5 z-10 glass-hover">
                <img
                    src={TMDB.getImageUrl(movie.poster_path)}
                    alt={movie.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                />

                {/* Overlay on Hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <h3 className="text-white font-bold line-clamp-2 mb-1">{movie.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-white/70">
                        <span className="flex items-center gap-1 text-yellow-500 font-bold">
                            <span className="material-symbols-outlined text-sm">star</span>
                            {movie.vote_average?.toFixed(1)}
                        </span>
                        <span>•</span>
                        <span>{movie.release_date?.substring(0, 4)}</span>
                    </div>
                    <button className="mt-3 w-full bg-white text-black py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors">
                        <span className="material-symbols-outlined text-base">play_arrow</span>
                        Watch Now
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
