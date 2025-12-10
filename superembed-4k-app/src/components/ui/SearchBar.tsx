import React, { useState, useEffect, useRef } from 'react';
import { TMDB } from '../../lib/tmdb';

import { TMDBMovie } from '../../types/stream';

interface SearchBarProps {
    onSelect: (movie: TMDBMovie) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TMDBMovie[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const search = async () => {
            if (query.trim().length === 0) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                const data = await TMDB.search(query);
                setResults(data.results.filter((item: TMDBMovie) => item.media_type !== 'person').slice(0, 5));
                setIsOpen(true);
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(search, 300);
        return () => clearTimeout(timer);
    }, [query]);

    return (
        <div ref={wrapperRef} className="relative w-full max-w-md mx-auto z-50">
            <div className={`relative flex items-center bg-white/10 backdrop-blur-md rounded-full border border-white/20 transition-all duration-300 ${isOpen ? 'rounded-b-none border-b-0 bg-black/80' : 'hover:bg-white/20'}`}>
                <span className="material-symbols-outlined text-white/50 pl-4">search</span>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.length > 0 && setIsOpen(true)}
                    placeholder="Search movies & TV shows..."
                    className="w-full bg-transparent border-none text-white placeholder-white/50 px-4 py-3 focus:ring-0 outline-none"
                />
                {loading && (
                    <div className="pr-4">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-black/90 backdrop-blur-xl border border-white/20 border-t-0 rounded-b-2xl overflow-hidden shadow-2xl">
                    {results.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => {
                                onSelect(item);
                                setIsOpen(false);
                                setQuery('');
                            }}
                            className="flex items-center gap-4 p-3 hover:bg-white/10 cursor-pointer transition-colors group"
                        >
                            <img
                                src={TMDB.getImageUrl(item.poster_path, 'w500')}
                                alt={item.title || item.name}
                                className="w-10 h-14 object-cover rounded bg-neutral-800"
                            />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-white font-medium truncate group-hover:text-primary transition-colors">{item.title || item.name}</h4>
                                <div className="flex items-center gap-2 text-xs text-white/40">
                                    <span>{item.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
                                    <span>•</span>
                                    <span>{(item.release_date || item.first_air_date || '').substring(0, 4)}</span>
                                    <span className="flex items-center gap-0.5 text-yellow-500">
                                        <span className="material-symbols-outlined text-[10px]">star</span>
                                        {item.vote_average?.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
