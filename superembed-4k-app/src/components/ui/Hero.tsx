import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade, Navigation, Pagination } from 'swiper/modules';
import { TMDB } from '../../lib/tmdb';

import 'swiper/css';
import 'swiper/css/effect-fade';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import { TMDBMovie } from '../../types/stream';

interface HeroProps {
    movies: TMDBMovie[];
    onPlay: (movie: TMDBMovie) => void;
}

export const Hero: React.FC<HeroProps> = ({ movies, onPlay }) => {
    if (!movies || movies.length === 0) return null;

    return (
        <div className="relative h-[85vh] w-full overflow-hidden">
            <Swiper
                modules={[Autoplay, EffectFade, Navigation, Pagination]}
                effect="fade"
                autoplay={{ delay: 6000, disableOnInteraction: false }}
                loop={true}
                pagination={{ clickable: true }}
                className="w-full h-full"
            >
                {movies.slice(0, 5).map((movie) => (
                    <SwiperSlide key={movie.id} className="relative w-full h-full">
                        {/* Background Image */}
                        <div className="absolute inset-0">
                            <img
                                src={TMDB.getImageUrl(movie.backdrop_path, 'original')}
                                alt={movie.title}
                                className="w-full h-full object-cover"
                            />
                            {/* Cinematic Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent" />
                        </div>

                        {/* Content */}
                        <div className="absolute inset-0 flex items-center px-4 md:px-12 lg:px-24 pb-32">
                            <div className="max-w-2xl pt-20">
                                <div className="flex items-center gap-3 mb-4 opacity-0 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                                    <span className="px-2 py-1 bg-white/10 backdrop-blur-md rounded border border-white/20 text-xs font-bold text-white uppercase tracking-wider">
                                        Trending
                                    </span>
                                    <span className="flex items-center gap-1 text-yellow-500 font-bold text-sm">
                                        <span className="material-symbols-outlined text-base">star</span>
                                        {movie.vote_average?.toFixed(1)}
                                    </span>
                                </div>

                                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight opacity-0 animate-slide-up font-display" style={{ animationDelay: '0.4s' }}>
                                    {movie.title}
                                </h1>

                                <p className="text-white/70 text-base md:text-lg mb-8 line-clamp-3 max-w-xl opacity-0 animate-slide-up" style={{ animationDelay: '0.6s' }}>
                                    {movie.overview}
                                </p>

                                <div className="flex flex-wrap gap-4 opacity-0 animate-slide-up" style={{ animationDelay: '0.8s' }}>
                                    <button
                                        onClick={() => onPlay(movie)}
                                        className="px-8 py-3.5 bg-white text-black rounded-xl font-bold flex items-center gap-2 hover:bg-neutral-200 transition-all transform hover:scale-105"
                                    >
                                        <span className="material-symbols-outlined text-2xl">play_arrow</span>
                                        Watch Now
                                    </button>
                                    <button className="px-8 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl font-bold hover:bg-white/20 transition-all">
                                        More Info
                                    </button>
                                </div>
                            </div>
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
};
