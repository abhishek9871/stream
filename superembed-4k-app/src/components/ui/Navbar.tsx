import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from './SearchBar';

interface NavbarProps {
    onSearchSelect?: (movie: any) => void;
    transparent?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearchSelect, transparent = false }) => {
    const router = useRouter();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const bgClass = transparent
        ? (scrolled ? 'bg-black/80 backdrop-blur-xl border-b border-white/5' : 'bg-transparent border-transparent')
        : 'bg-black/80 backdrop-blur-xl border-b border-white/5';

    const handleNavClick = (path: string) => {
        router.push(path);
    };

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${bgClass}`}>
            <div className="max-w-[1600px] mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-8">
                {/* Logo */}
                <a href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl rotate-3 shadow-lg shadow-primary/20 flex items-center justify-center group-hover:rotate-6 transition-transform duration-300">
                        <span className="material-symbols-outlined text-white text-xl transform -rotate-3">play_arrow</span>
                    </div>
                    <span className="text-2xl font-bold font-display tracking-tight text-white group-hover:text-white/90 transition-colors">
                        Super<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Embed</span>
                    </span>
                </a>

                {/* Search */}
                <div className="flex-1 max-w-xl hidden md:block">
                    {onSearchSelect ? (
                        <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 hover:border-white/20 transition-all cursor-text group focus-within:bg-black focus-within:border-primary/50">
                            <SearchBar onSelect={onSearchSelect} />
                        </div>
                    ) : (
                        <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 hover:border-white/20 transition-all">
                            <SearchBar onSelect={(item) => window.location.href = `/title/${item.id}?type=${item.media_type || 'movie'}`} />
                        </div>
                    )}
                </div>

                {/* Links */}
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => handleNavClick('/')}
                        className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                    >
                        Home
                    </button>
                    <button
                        onClick={() => handleNavClick('/browse?category=movies')}
                        className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                    >
                        Movies
                    </button>
                    <button
                        onClick={() => handleNavClick('/browse?category=tv')}
                        className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                    >
                        TV Shows
                    </button>

                    <button className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 border border-white/10 hover:border-white/30 transition-all" />
                </div>
            </div>
        </nav>
    );
};
