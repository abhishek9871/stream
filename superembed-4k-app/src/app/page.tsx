'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '../components/ui/Navbar';
import { Hero } from '../components/ui/Hero';
import { MediaCard } from '../components/ui/MediaCard';
import { TMDB } from '../lib/tmdb';
import { TMDBMovie } from '../types/stream';

export default function Home() {
  const router = useRouter();
  const [trendingMovies, setTrendingMovies] = useState<TMDBMovie[]>([]);
  const [trendingTv, setTrendingTv] = useState<TMDBMovie[]>([]);
  const [popular, setPopular] = useState<TMDBMovie[]>([]);
  const [topRated, setTopRated] = useState<TMDBMovie[]>([]);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const [trendingM, trendingT, popularM, topRatedM] = await Promise.all([
          TMDB.getTrending(),
          TMDB.getTrendingTv(),
          TMDB.getPopular(),
          TMDB.getTopRated()
        ]);

        setTrendingMovies(trendingM.results.map((m: any) => ({ ...m, media_type: 'movie' })));
        setTrendingTv(trendingT.results.map((t: any) => ({ ...t, media_type: 'tv' })));
        setPopular(popularM.results.map((m: any) => ({ ...m, media_type: 'movie' })));
        setTopRated(topRatedM.results.map((m: any) => ({ ...m, media_type: 'movie' })));
      } catch (error) {
        console.error('Failed to fetch content:', error);
      }
    };

    fetchContent();
  }, []);

  const handleMediaSelect = (media: TMDBMovie) => {
    const type = media.media_type || (media.first_air_date ? 'tv' : 'movie');
    router.push(`/title/${media.id}?type=${type}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-body pb-20 overflow-x-hidden">
      <Navbar onSearchSelect={handleMediaSelect} transparent={true} />

      <Hero movies={trendingMovies} onPlay={handleMediaSelect} />

      <div className="relative z-10 -mt-32 space-y-16 px-4 md:px-12 lg:px-16 max-w-[1800px] mx-auto">

        {/* Trending TV Section */}
        <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-end justify-between mb-6 px-2">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold font-display text-white">Trending Series</h2>
              <p className="text-zinc-400 text-sm mt-1">Binge-worthy shows curated for you</p>
            </div>
            <button
              onClick={() => router.push('/browse?category=tv')}
              className="text-sm font-bold text-primary hover:text-white transition-colors"
            >
              View All
            </button>
          </div>
          {/* Changed min-w to fixed w classes to enforce size */}
          <div className="flex overflow-x-auto gap-4 md:gap-6 pb-4 scrollbar-hide snap-x snap-mandatory">
            {trendingTv.slice(0, 15).map((show) => (
              <div key={show.id} className="w-[160px] md:w-[200px] snap-start flex-shrink-0">
                <MediaCard media={show} onClick={handleMediaSelect} showType={true} />
              </div>
            ))}
          </div>
        </section>

        {/* Popular Movies Section */}
        <section className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-end justify-between mb-6 px-2">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold font-display text-white">Popular Movies</h2>
              <p className="text-zinc-400 text-sm mt-1">What everyone is watching right now</p>
            </div>
            <button
              onClick={() => router.push('/browse?category=popular')}
              className="text-sm font-bold text-primary hover:text-white transition-colors"
            >
              View All
            </button>
          </div>
          <div className="flex overflow-x-auto gap-4 md:gap-6 pb-4 scrollbar-hide snap-x snap-mandatory">
            {popular.slice(0, 15).map((movie) => (
              <div key={movie.id} className="w-[160px] md:w-[200px] snap-start flex-shrink-0">
                <MediaCard media={movie} onClick={handleMediaSelect} />
              </div>
            ))}
          </div>
        </section>

        {/* Top Rated Section */}
        <section className="animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <div className="flex items-end justify-between mb-6 px-2">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold font-display text-white">Top Rated Classics</h2>
              <p className="text-zinc-400 text-sm mt-1">Critically acclaimed masterpieces</p>
            </div>
            <button
              onClick={() => router.push('/browse?category=top_rated')}
              className="text-sm font-bold text-primary hover:text-white transition-colors"
            >
              View All
            </button>
          </div>
          <div className="flex overflow-x-auto gap-6 sm:gap-8 pb-8 scrollbar-hide snap-x snap-mandatory pl-4">
            {topRated.slice(0, 15).map((movie, i) => (
              <div key={movie.id} className="w-[160px] md:w-[200px] snap-start flex-shrink-0">
                <MediaCard media={movie} onClick={handleMediaSelect} rank={i + 1} />
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-20 pb-10 text-center border-t border-white/5">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg">play_arrow</span>
            </div>
            <h3 className="text-2xl font-bold font-display tracking-tight">SuperEmbed</h3>
          </div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto mb-8">
            Experience cinema-grade 4K streaming with zero interruptions.
            Powered by VIP stream servers.
          </p>
          <div className="flex justify-center gap-8 text-sm text-zinc-500 font-medium">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">DMCA</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
