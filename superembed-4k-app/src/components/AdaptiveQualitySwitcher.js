'use client';

import React, { useState, useEffect } from 'react';
import SuperEmbedService from '../services/SuperEmbedService';
import styles from '../styles/4KPlayer.module.css';

const AdaptiveQualitySwitcher = ({ playerRef, streamingLinks, onQualityChange }) => {
    const [currentQuality, setCurrentQuality] = useState('4K');
    const [availableQualities, setAvailableQualities] = useState([]);

    useEffect(() => {
        if (streamingLinks && streamingLinks.length > 0) {
            const qualities = [...new Set(streamingLinks.map(link =>
                SuperEmbedService.getLinkQuality(link.url)
            ))].filter(q => q !== 'unknown').sort((a, b) => {
                const order = ['4K', '1080p', '720p', '480p'];
                return order.indexOf(a) - order.indexOf(b);
            });
            setAvailableQualities(qualities);

            // Set current quality to best available
            if (qualities.length > 0 && !qualities.includes(currentQuality)) {
                setCurrentQuality(qualities[0]);
            }
        }
    }, [streamingLinks, currentQuality]);

    const switchQuality = (newQuality) => {
        const link = streamingLinks.find(l =>
            SuperEmbedService.getLinkQuality(l.url) === newQuality
        );

        if (link) {
            if (playerRef?.current?.load) {
                playerRef.current.load(link.url);
            }
            setCurrentQuality(newQuality);
            if (onQualityChange) {
                onQualityChange(newQuality, link.url);
            }
        }
    };

    if (availableQualities.length === 0) {
        return null;
    }

    return (
        <div className={styles.adaptiveQuality}>
            <span className={styles.currentQuality}>
                Current: <strong>{currentQuality}</strong>
            </span>
            <div className={styles.qualityButtons}>
                {availableQualities.map(quality => (
                    <button
                        key={quality}
                        onClick={() => switchQuality(quality)}
                        disabled={currentQuality === quality}
                        className={`${styles.qualityButton} ${currentQuality === quality ? styles.active : ''}`}
                    >
                        {quality}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AdaptiveQualitySwitcher;
