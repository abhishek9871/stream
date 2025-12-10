import React, { useEffect, useState, useRef } from 'react';
import { MoviePlayer } from './MoviePlayer';
import SuperEmbedService from '../../services/SuperEmbedService';
import { ExtractedStream } from '../../types/stream';
import { processSubtitles, cleanupSubtitleUrls, ProcessedSubtitle } from '../../services/SubtitleService';

interface StreamContainerProps {
    tmdbId?: number;
    imdbId?: string;
    type?: 'movie' | 'tv';
    season?: number;
    episode?: number;
    title: string;
    poster?: string;
    onClose: () => void;
    nextEpisode?: { season: number; episode: number; title: string };
    onPlayNext?: () => void;
}

export const StreamContainer: React.FC<StreamContainerProps> = ({
    tmdbId,
    imdbId,
    type = 'movie',
    season,
    episode,
    title,
    poster,
    onClose,
    nextEpisode,
    onPlayNext
}) => {
    const [stream, setStream] = useState<ExtractedStream | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('Initializing secure connection...');
    const componentMounted = useRef(true);

    useEffect(() => {
        componentMounted.current = true;

        // Small delay to prevent strict mode double-firing from being an issue (though Service handles it too)
        const timer = setTimeout(() => {
            extract();
        }, 500);

        return () => {
            componentMounted.current = false;
            clearTimeout(timer);
        };
    }, [tmdbId, imdbId, type, season, episode]);

    const extract = async () => {
        if (!componentMounted.current) return;

        try {
            setLoading(true);
            setError(null);
            setStatus('Connecting to VIP streaming servers...');

            // @ts-ignore - JS service
            const result = await SuperEmbedService.extractStream(
                imdbId,
                tmdbId,
                type,
                season,
                episode
            );

            if (!componentMounted.current) return;

            if (result.success) {
                setStatus('Stream found! Processing subtitles...');

                // Process Subdl subtitles (extract from ZIP, convert to VTT)
                let processedSubtitles: ProcessedSubtitle[] = [];
                if (result.subtitles && result.subtitles.length > 0) {
                    try {
                        processedSubtitles = await processSubtitles(result.subtitles);
                    } catch (subError) {
                        console.error('Subtitle processing error:', subError);
                        // Continue without subtitles
                    }
                }

                // Convert processed subtitles to the format expected by MoviePlayer
                const subtitleTracks = processedSubtitles.map(sub => ({
                    label: sub.label,
                    lang: sub.lang,
                    file: sub.vttUrl, // Now a blob URL to VTT content
                    default: false
                }));

                setStream({
                    success: true,
                    m3u8Url: result.m3u8Url,
                    subtitles: subtitleTracks,
                    referer: result.referer
                });
                setLoading(false);
            } else {
                console.error('Stream extraction failed:', result.error);
                setError(result.error || 'Failed to find a high-quality stream.');
                setLoading(false);
            }
        } catch (err: any) {
            if (!componentMounted.current) return;
            console.error('Stream extraction error:', err);
            setError(err.message || 'Connection error');
            setLoading(false);
        }
    };

    if (error) {
        return (
            <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 font-display">
                <div className="max-w-md w-full bg-neutral-900 border border-white/10 rounded-2xl p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>

                    <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error_outline</span>
                    <h3 className="text-2xl font-bold text-white mb-2">Stream Unavailable</h3>
                    <p className="text-white/60 mb-8">{error}</p>

                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-lg font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            Close
                        </button>
                        <button
                            onClick={extract}
                            className="px-6 py-2.5 rounded-lg font-medium bg-white text-black hover:bg-neutral-200 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loading || !stream) {
        return (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center font-display">
                {/* Cinema Loader */}
                <div className="relative w-24 h-24 mb-8">
                    <div className="absolute inset-0 border-t-4 border-primary rounded-full animate-spin"></div>
                    <div className="absolute inset-2 border-r-4 border-secondary rounded-full animate-spin animation-delay-200"></div>
                    <div className="absolute inset-4 border-b-4 border-accent rounded-full animate-spin animation-delay-500"></div>
                </div>

                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50 animate-pulse mb-2">
                    Loading Movie
                </h3>
                <p className="text-white/50 font-mono text-sm tracking-wider">{status}</p>

                <button
                    onClick={onClose}
                    className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined text-3xl">close</span>
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black animate-fade-in">
            <MoviePlayer
                extracted={stream}
                title={title}
                poster={poster}
                onClose={onClose}
                autoplay={true}
                nextEpisode={nextEpisode}
                onPlayNext={onPlayNext}
            />
        </div>
    );
};
