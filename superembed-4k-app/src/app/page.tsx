'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/ui/Navbar';
import { Hero } from '../components/ui/Hero';
import { MovieCard } from '../components/ui/MovieCard';
import { StreamContainer } from '../components/player/StreamContainer';
import { TMDB } from '../lib/tmdb';
import { TMDBMovie } from '../types/stream';

export default function Home() {
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [popular, setPopular] = useState<TMDBMovie[]>([]);
  const [topRated, setTopRated] = useState<TMDBMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<{ tmdbId: number; title: string; poster: string; type: 'movie' | 'tv' } | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const [trendingData, popularData, topRatedData] = await Promise.all([
          TMDB.getTrending(),
          TMDB.getPopular(),
          TMDB.getTopRated()
        ]);

        setTrending(trendingData.results || []);
        setPopular(popularData.results || []);
        setTopRated(topRatedData.results || []);
      } catch (error) {
        console.error('Failed to fetch content:', error);
      }
    };

    fetchContent();
  }, []);

  const handleMovieSelect = (movie: TMDBMovie) => {
    // Normalize movie data structure
    setSelectedMovie({
      tmdbId: movie.id,
      title: movie.title || movie.name || 'Unknown Title',
      poster: TMDB.getImageUrl(movie.backdrop_path || movie.poster_path, 'original'),
      type: movie.media_type === 'tv' ? 'tv' : 'movie'
    });
  };

  return (
    <div className="min-h-screen bg-black text-white font-body selection:bg-primary selection:text-white pb-20">
      <Navbar onSearchSelect={handleMovieSelect} />

      <Hero movies={trending} onPlay={handleMovieSelect} />

      <main className="relative z-10 -mt-20 space-y-12 px-4 md:px-12 lg:px-24">

        {/* Popular Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-bold font-display">Popular Now</h2>
            <button className="text-sm font-bold text-primary hover:text-white transition-colors">View All</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {popular.slice(0, 12).map((movie) => (
              <MovieCard key={movie.id} movie={movie} onClick={handleMovieSelect} />
            ))}
          </div>
        </section>

        {/* Top Rated Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-bold font-display">Top Rated Classics</h2>
            <button className="text-sm font-bold text-primary hover:text-white transition-colors">View All</button>
          </div>
          <div className="flex overflow-x-auto gap-6 sm:gap-8 pb-8 scrollbar-hide snap-x p-4 -m-4">
            {topRated.slice(0, 10).map((movie, i) => (
              <div key={movie.id} className="min-w-[160px] md:min-w-[200px] snap-center">
                <MovieCard movie={movie} onClick={handleMovieSelect} rank={i + 1} />
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-20 pb-10 text-center border-t border-white/10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-2xl">diamond</span>
            <h3 className="text-2xl font-bold font-display">SuperEmbed</h3>
          </div>
          <p className="text-white/40 text-sm max-w-md mx-auto mb-8">
            Experience cinema-grade streaming with our advanced Native HLS player.
            Powered by VIP Stream S servers for uncompromised 4K quality.
          </p>
          <div className="flex justify-center gap-6 text-sm text-white/60">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">DMCA</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </footer>
      </main>

      {/* Video Player Overlay */}
      {selectedMovie && (
        <StreamContainer
          tmdbId={selectedMovie.tmdbId}
          type={selectedMovie.type}
          title={selectedMovie.title}
          poster={selectedMovie.poster}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
}
