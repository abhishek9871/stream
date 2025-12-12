'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MediaCard } from '@/components/ui/MediaCard';
import { TMDB } from '@/lib/tmdb';
import { TMDBMovie } from '@/types/stream';

// Define fetchers outside component to prevent recreation
const fetchers = {
    movies: (page: number) => TMDB.getPopular(page),
    tv: (page: number) => TMDB.getPopularTv(page),
    popular: (page: number) => TMDB.getPopular(page),
    top_rated: (page: number) => TMDB.getTopRated(page)
};

const categoryMeta: Record<string, { title: string; subtitle: string }> = {
    movies: { title: 'All Movies', subtitle: 'Discover the latest and greatest films' },
    tv: { title: 'TV Series', subtitle: 'Explore trending and popular shows' },
    popular: { title: 'Popular Right Now', subtitle: 'What the world is watching' },
    top_rated: { title: 'Top Rated', subtitle: 'Critically acclaimed masterpieces' }
};

export default function BrowsePage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const category = searchParams.get('category') || 'movies';

    const [items, setItems] = useState<TMDBMovie[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Ref for infinite scroll sentinel
    const observerRef = useRef<IntersectionObserver | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const meta = categoryMeta[category] || categoryMeta.movies;
    const fetcher = fetchers[category as keyof typeof fetchers] || fetchers.movies;

    // Load data function
    const loadData = useCallback(async (pageNum: number, isInitial: boolean) => {
        if (isInitial) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await fetcher(pageNum);
            const type = category === 'tv' ? 'tv' : 'movie';
            const newItems = data.results.map((item: any) => ({ ...item, media_type: type }));

            if (isInitial) {
                setItems(newItems);
            } else {
                setItems(prev => [...prev, ...newItems]);
            }

            setHasMore(data.page < data.total_pages);
        } catch (error) {
            console.error('Failed to fetch', error);
        } finally {
            if (isInitial) setLoading(false);
            else setLoadingMore(false);
        }
    }, [category, fetcher]);

    // Reset on category change
    useEffect(() => {
        setItems([]);
        setPage(1);
        setHasMore(true);
        loadData(1, true);
    }, [category, loadData]);

    // Infinite scroll observer
    useEffect(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    setPage(prev => prev + 1);
                }
            },
            { rootMargin: '200px' } // Start loading before reaching the end
        );

        if (sentinelRef.current) {
            observerRef.current.observe(sentinelRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasMore, loadingMore, loading]);

    // Load more when page changes (but not on initial load)
    useEffect(() => {
        if (page > 1) {
            loadData(page, false);
        }
    }, [page, loadData]);

    const handleMediaSelect = (media: TMDBMovie) => {
        const type = media.media_type || (media.first_air_date ? 'tv' : 'movie');
        router.push(`/title/${media.id}?type=${type}`);
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-body pb-20">
            <Navbar />

            <div className="pt-32 px-4 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
                {/* Header */}
                <div className="mb-10 animate-fade-in">
                    <h1 className="text-4xl md:text-5xl font-bold font-display text-white mb-2">{meta.title}</h1>
                    <p className="text-zinc-400">{meta.subtitle}</p>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
                    {Object.entries(categoryMeta).map(([key, value]) => (
                        <button
                            key={key}
                            onClick={() => router.push(`/browse?category=${key}`)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${category === key
                                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {value.title}
                        </button>
                    ))}
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                            {items.map((item, index) => (
                                <MediaCard
                                    key={`${item.id}-${index}`}
                                    media={item}
                                    onClick={handleMediaSelect}
                                    showType={category === 'tv'}
                                />
                            ))}
                        </div>

                        {/* Infinite Scroll Sentinel */}
                        <div ref={sentinelRef} className="h-20 flex items-center justify-center">
                            {loadingMore && (
                                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            )}
                        </div>

                        {!hasMore && items.length > 0 && (
                            <p className="text-center text-zinc-500 text-sm py-8">You've reached the end!</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
