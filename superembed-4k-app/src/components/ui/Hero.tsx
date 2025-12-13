import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade, Pagination } from 'swiper/modules';
import { TMDB } from '../../lib/tmdb';

import 'swiper/css';
import 'swiper/css/effect-fade';
import 'swiper/css/pagination';

import { TMDBMovie } from '../../types/stream';

interface HeroProps {
    movies: TMDBMovie[];
    onPlay: (movie: TMDBMovie) => void;
}

export const Hero: React.FC<HeroProps> = ({ movies, onPlay }) => {
    if (!movies || movies.length === 0) return null;

    return (
        <div className="relative w-full overflow-hidden">
            {/* Fixed height hero with responsive sizing */}
            <div className="h-[75vh] md:h-[80vh] lg:h-[85vh] min-h-[500px] max-h-[900px]">
                <Swiper
                    modules={[Autoplay, EffectFade, Pagination]}
                    effect="fade"
                    autoplay={{ delay: 6000, disableOnInteraction: false }}
                    loop={true}
                    pagination={{
                        clickable: true,
                        bulletClass: 'swiper-pagination-bullet !bg-white/40 !w-2 !h-2 !mx-1',
                        bulletActiveClass: '!bg-white !w-8 !rounded-full'
                    }}
                    className="w-full h-full"
                >
                    {movies.slice(0, 5).map((movie) => (
                        <SwiperSlide key={movie.id} className="relative w-full h-full">
                            {/* Background Image */}
                            <div className="absolute inset-0">
                                <img
                                    src={TMDB.getImageUrl(movie.backdrop_path, 'original')}
                                    alt={movie.title}
                                    className="w-full h-full object-cover object-top"
                                />
                                {/* Cinematic Gradient Overlays */}
                                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />
                                <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent pointer-events-none" />
                                {/* Extra bottom fade for smooth transition to content */}
                                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                            </div>

                            {/* Content - Positioned to not overflow */}
                            <div className="absolute inset-0 flex items-end px-4 sm:px-6 md:px-12 lg:px-24 z-10">
                                <div className="w-full max-w-2xl pb-24 md:pb-32 lg:pb-40">
                                    {/* Badges */}
                                    <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4 opacity-0 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                                        <span className="px-2 py-0.5 md:px-3 md:py-1 bg-primary/20 backdrop-blur-md rounded-full border border-primary/30 text-xs font-bold text-primary uppercase tracking-wider">
                                            Trending
                                        </span>
                                        <span className="flex items-center gap-1 text-yellow-500 font-bold text-xs md:text-sm">
                                            <span className="material-symbols-outlined text-xs md:text-base">star</span>
                                            {movie.vote_average?.toFixed(1)}
                                        </span>
                                    </div>

                                    {/* Title */}
                                    <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-2 md:mb-4 leading-tight opacity-0 animate-slide-up font-display line-clamp-2" style={{ animationDelay: '0.4s' }}>
                                        {movie.title || movie.name}
                                    </h1>

                                    {/* Overview - Hidden on very small screens */}
                                    <p className="hidden sm:block text-white/70 text-sm md:text-base lg:text-lg mb-4 md:mb-6 line-clamp-2 md:line-clamp-3 max-w-xl opacity-0 animate-slide-up" style={{ animationDelay: '0.6s' }}>
                                        {movie.overview}
                                    </p>

                                    {/* Buttons */}
                                    <div className="flex flex-wrap gap-2 md:gap-4 opacity-0 animate-slide-up" style={{ animationDelay: '0.8s' }}>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onPlay(movie);
                                            }}
                                            className="px-4 md:px-8 py-2.5 md:py-3 bg-white text-black rounded-lg md:rounded-xl font-bold flex items-center gap-1.5 md:gap-2 hover:bg-neutral-200 transition-all transform hover:scale-105 text-sm md:text-base shadow-lg shadow-white/10"
                                        >
                                            <span className="material-symbols-outlined text-xl md:text-2xl">play_arrow</span>
                                            Watch Now
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onPlay(movie);
                                            }}
                                            className="px-4 md:px-8 py-2.5 md:py-3 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-lg md:rounded-xl font-bold hover:bg-white/20 transition-all text-sm md:text-base"
                                        >
                                            More Info
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>
        </div>
    );
};
