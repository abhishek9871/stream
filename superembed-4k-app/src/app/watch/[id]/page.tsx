'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { StreamContainer } from '@/components/player/StreamContainer';
import { TMDB } from '@/lib/tmdb';

export default function WatchPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    // ID from URL /watch/[id]
    const id = params?.id as string;

    // Query params for details
    const season = searchParams.get('s');
    const episode = searchParams.get('e');
    const type = season ? 'tv' : 'movie';

    const [details, setDetails] = useState<any>(null);

    useEffect(() => {
        if (!id) return;

        const fetchDetails = async () => {
            try {
                const data = await TMDB.getDetails(parseInt(id), type);
                setDetails(data);
            } catch (err) {
                console.error('Failed to get details', err);
            }
        };
        fetchDetails();
    }, [id, type]);

    if (!id || !details) return <div className="min-h-screen bg-black" />;

    const tmdbId = parseInt(id);
    const seasonNum = season ? parseInt(season) : undefined;
    const episodeNum = episode ? parseInt(episode) : undefined;

    const title = type === 'tv'
        ? `${details.name || details.title} S${seasonNum} E${episodeNum}`
        : (details.title || details.name);

    return (
        <div className="fixed inset-0 bg-black z-50">
            <StreamContainer
                tmdbId={tmdbId}
                type={type}
                season={seasonNum}
                episode={episodeNum}
                title={title}
                poster={TMDB.getImageUrl(details.backdrop_path || details.poster_path, 'original')}
                onClose={() => router.back()}
                embedded={true}
            />
        </div>
    );
}
