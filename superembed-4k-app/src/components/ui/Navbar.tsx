import React from 'react';
import { SearchBar } from './SearchBar';

interface NavbarProps {
    onSearchSelect: (movie: any) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearchSelect }) => {
    return (
        <nav className="fixed top-0 left-0 right-0 z-40 px-4 md:px-8 py-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-primary to-secondary rounded-xl rotate-3 shadow-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-lg md:text-xl transform -rotate-3">play_arrow</span>
                    </div>
                    <span className="text-xl md:text-2xl font-bold font-display tracking-tight text-white">
                        Super<span className="text-primary">Embed</span>
                    </span>
                </div>

                <div className="w-full md:w-auto md:flex-1 md:max-w-xl">
                    <SearchBar onSelect={onSearchSelect} />
                </div>
            </div>
        </nav>
    );
};
