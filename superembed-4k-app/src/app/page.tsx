'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '../components/ui/Navbar';
import { Hero } from '../components/ui/Hero';
import { MediaCard } from '../components/ui/MediaCard';
import { TMDB } from '../lib/tmdb';
import { TMDBMovie } from '../types/stream';

// Reusable Media Row Component with scroll buttons
const MediaRow: React.FC<{
  title: string;
  subtitle: string;
  items: TMDBMovie[];
  onItemClick: (media: TMDBMovie) => void;
  onViewAll: () => void;
  showType?: boolean;
  showRank?: boolean;
}> = ({ title, subtitle, items, onItemClick, onViewAll, showType = false, showRank = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const updateArrows = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 20);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 20);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    updateArrows();
  }, [items]);

  return (
    <section className="relative group/section">
      {/* Header */}
      <div className="flex items-end justify-between mb-4 md:mb-6 px-1">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold font-display text-white">{title}</h2>
          <p className="text-zinc-400 text-xs sm:text-sm mt-0.5 md:mt-1">{subtitle}</p>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs sm:text-sm font-bold text-primary hover:text-white transition-colors whitespace-nowrap"
        >
          View All
        </button>
      </div>

      {/* Carousel Container */}
      <div className="relative">
        {/* Left Arrow - Hidden on mobile, shown on hover for desktop */}
        <button
          onClick={() => scroll('left')}
          className={`hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-24 bg-gradient-to-r from-background via-background/90 to-transparent items-center justify-start pl-2 transition-opacity duration-300 ${showLeftArrow ? 'opacity-0 group-hover/section:opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
          <span className="material-symbols-outlined text-white text-3xl hover:scale-110 transition-transform">chevron_left</span>
        </button>

        {/* Right Arrow - Hidden on mobile, shown on hover for desktop */}
        <button
          onClick={() => scroll('right')}
          className={`hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-24 bg-gradient-to-l from-background via-background/90 to-transparent items-center justify-end pr-2 transition-opacity duration-300 ${showRightArrow ? 'opacity-0 group-hover/section:opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
          <span className="material-symbols-outlined text-white text-3xl hover:scale-110 transition-transform">chevron_right</span>
        </button>

        {/* Scrollable Row */}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="flex gap-3 sm:gap-4 md:gap-5 pb-4 snap-x snap-mandatory scroll-container"
          style={{
            scrollBehavior: 'smooth',
            scrollPaddingLeft: '4px',
            touchAction: 'pan-x'
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="w-[130px] sm:w-[150px] md:w-[180px] lg:w-[200px] snap-start flex-shrink-0 first:ml-0"
            >
              <MediaCard
                media={item}
                onClick={onItemClick}
                showType={showType}
                rank={showRank ? i + 1 : undefined}
              />
            </div>
          ))}
          {/* End padding */}
          <div className="w-4 flex-shrink-0" />
        </div>
      </div>
    </section>
  );
};

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
    <div className="min-h-screen bg-background text-foreground font-body overflow-x-hidden">
      <Navbar onSearchSelect={handleMediaSelect} transparent={true} />

      <Hero movies={trendingMovies} onPlay={handleMediaSelect} />

      {/* Content Sections - Proper spacing without overlap */}
      <div className="relative z-10 space-y-8 md:space-y-12 lg:space-y-16 px-4 sm:px-6 md:px-12 lg:px-16 max-w-[1800px] mx-auto -mt-16 md:-mt-24 lg:-mt-32 pb-20">

        {/* Trending TV Section */}
        <MediaRow
          title="Trending Series"
          subtitle="Binge-worthy shows curated for you"
          items={trendingTv.slice(0, 15)}
          onItemClick={handleMediaSelect}
          onViewAll={() => router.push('/browse?category=tv')}
          showType={true}
        />

        {/* Popular Movies Section */}
        <MediaRow
          title="Popular Movies"
          subtitle="What everyone is watching right now"
          items={popular.slice(0, 15)}
          onItemClick={handleMediaSelect}
          onViewAll={() => router.push('/browse?category=popular')}
        />

        {/* Top Rated Section */}
        <MediaRow
          title="Top Rated Classics"
          subtitle="Critically acclaimed masterpieces"
          items={topRated.slice(0, 15)}
          onItemClick={handleMediaSelect}
          onViewAll={() => router.push('/browse?category=top_rated')}
          showRank={true}
        />

        {/* Footer */}
        <footer className="pt-12 md:pt-20 pb-8 md:pb-10 text-center border-t border-white/5">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg">play_arrow</span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold font-display tracking-tight">SuperEmbed</h3>
          </div>
          <p className="text-zinc-500 text-xs md:text-sm max-w-md mx-auto mb-6 md:mb-8 px-4">
            Experience cinema-grade 4K streaming with zero interruptions.
            Powered by VIP stream servers.
          </p>
          <div className="flex justify-center gap-4 md:gap-8 text-xs md:text-sm text-zinc-500 font-medium">
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
