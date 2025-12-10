'use client';

import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import SuperEmbedService from '../services/SuperEmbedService';
import AnalyticsService from '../services/AnalyticsService';
import styles from '../styles/4KPlayer.module.css';

const VideoPlayer = ({ imdbId, tmdbId, title, type = 'movie', season, episode }) => {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [streamInfo, setStreamInfo] = useState(null);
    const [quality, setQuality] = useState('Auto');
    const [availableQualities, setAvailableQualities] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [extractionStatus, setExtractionStatus] = useState('Connecting...');
    const [playerReady, setPlayerReady] = useState(false);
    const controlsTimeoutRef = useRef(null);

    // Step 1: Extract stream from backend
    useEffect(() => {
        let isMounted = true;

        const extractStream = async () => {
            try {
                setLoading(true);
                setError(null);
                setPlayerReady(false);
                setExtractionStatus('Extracting stream from VIP servers...');

                const result = await SuperEmbedService.extractStream(
                    imdbId,
                    tmdbId,
                    type,
                    season,
                    episode
                );

                if (!isMounted) return;

                if (!result.success) {
                    setError(result.error || 'Failed to extract stream');
                    setLoading(false);
                    return;
                }

                console.log('[VideoPlayer] Stream extracted:', result.m3u8Url);
                setStreamInfo(result);
                setExtractionStatus('Stream found! Loading player...');

            } catch (err) {
                if (!isMounted) return;
                console.error('[VideoPlayer] Extract error:', err);
                setError(err.message || 'Failed to load stream');
                AnalyticsService.trackStreamError(imdbId, err);
                setLoading(false);
            }
        };

        extractStream();

        return () => {
            isMounted = false;
        };
    }, [imdbId, tmdbId, type, season, episode]);

    // Step 2: Initialize HLS.js when we have stream info AND video element is ready
    useEffect(() => {
        if (!streamInfo || !videoRef.current) {
            return;
        }

        console.log('[VideoPlayer] Initializing HLS with video element');

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90
            });

            hlsRef.current = hls;

            // Attach event handlers FIRST
            hls.on(Hls.Events.MANIFEST_LOADING, () => {
                console.log('[HLS] Manifest loading...');
                setExtractionStatus('Loading video manifest...');
            });

            hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
                console.log('[HLS] Manifest loaded, levels:', data.levels?.length);
            });

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                console.log('[HLS] Manifest parsed, quality levels:', data.levels.length);

                const qualities = data.levels.map((level, index) => ({
                    index,
                    height: level.height,
                    width: level.width,
                    bitrate: level.bitrate,
                    label: level.height ? `${level.height}p` : `Level ${index}`
                }));

                setAvailableQualities(qualities);
                setLoading(false);
                setPlayerReady(true);
                setExtractionStatus('Ready');

                AnalyticsService.trackStreamStart(imdbId, 'HLS');
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
                const level = hls.levels[data.level];
                if (level) {
                    setQuality(level.height ? `${level.height}p` : 'Auto');
                }
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('[HLS] Error:', data.type, data.details);
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        console.error('[HLS] Fatal network error - trying to recover');
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        console.log('[HLS] Media error - recovering');
                        hls.recoverMediaError();
                    } else {
                        setError('Playback error occurred');
                        setLoading(false);
                    }
                }
            });

            // Attach media and load source
            hls.attachMedia(videoRef.current);
            hls.loadSource(streamInfo.m3u8Url);

        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS (Safari)
            videoRef.current.src = streamInfo.m3u8Url;
            setLoading(false);
            setPlayerReady(true);
        } else {
            setError('HLS not supported in this browser');
            setLoading(false);
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [streamInfo, imdbId]);

    // Video event handlers
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setProgress(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
        }
    };

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        if (videoRef.current && duration) {
            videoRef.current.currentTime = pos * duration;
        }
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
        }
    };

    const toggleFullscreen = async () => {
        const container = document.querySelector(`.${styles.playerWrapper}`);
        if (!container) return;

        if (!document.fullscreenElement) {
            await container.requestFullscreen?.();
            setIsFullscreen(true);
        } else {
            await document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    };

    const handleQualityChange = (levelIndex) => {
        if (hlsRef.current) {
            hlsRef.current.currentLevel = parseInt(levelIndex);
        }
    };

    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    const handleRetry = () => {
        setError(null);
        setStreamInfo(null);
        setLoading(true);
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        window.location.reload();
    };

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p className={styles.errorIcon}>⚠️</p>
                <p>{error}</p>
                <button onClick={handleRetry} className={styles.retryButton}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className={styles.videoContainer}>
            <div className={styles.qualitySelector}>
                <span className={styles.qualityLabel}>Quality:</span>
                {playerReady ? (
                    <select
                        value={quality}
                        onChange={(e) => {
                            const idx = availableQualities.findIndex(q => q.label === e.target.value);
                            if (idx >= 0) handleQualityChange(idx);
                        }}
                        className={styles.qualityDropdown}
                    >
                        <option value="Auto">Auto</option>
                        {availableQualities.map((q) => (
                            <option key={q.index} value={q.label}>
                                {q.label} {q.bitrate ? `(${Math.round(q.bitrate / 1000)}kbps)` : ''}
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className={styles.qualityInfo}>Loading...</span>
                )}
                <span className={styles.vipBadge}>
                    {streamInfo?.provider || 'VIP Stream'}
                </span>
            </div>

            <div
                className={styles.playerWrapper}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => isPlaying && setShowControls(false)}
            >
                {/* Video element is ALWAYS in DOM */}
                <video
                    ref={videoRef}
                    className={styles.video}
                    style={{ display: loading ? 'none' : 'block' }}
                    onClick={togglePlay}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    playsInline
                />

                {/* Loading overlay */}
                {loading && (
                    <div className={styles.loadingOverlay}>
                        <div className={styles.spinner}></div>
                        <p>{extractionStatus}</p>
                        <p className={styles.loadingSubtext}>This may take 30-60 seconds...</p>
                    </div>
                )}

                {/* Play/Pause Overlay (when not loading and not playing) */}
                {!loading && !isPlaying && (
                    <div className={styles.playOverlay} onClick={togglePlay}>
                        <div className={styles.playButton}>▶</div>
                    </div>
                )}

                {/* Controls */}
                {!loading && (
                    <div className={`${styles.controls} ${showControls ? styles.visible : ''}`}>
                        <div className={styles.progressBar} onClick={handleSeek}>
                            <div
                                className={styles.progressFilled}
                                style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
                            />
                        </div>

                        <div className={styles.controlsRow}>
                            <button onClick={togglePlay} className={styles.controlButton}>
                                {isPlaying ? '⏸' : '▶'}
                            </button>

                            <span className={styles.timeDisplay}>
                                {formatTime(progress)} / {formatTime(duration)}
                            </span>

                            <div className={styles.volumeControl}>
                                <span>🔊</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={volume}
                                    onChange={handleVolumeChange}
                                    className={styles.volumeSlider}
                                />
                            </div>

                            <span className={styles.qualityIndicator}>{quality}</span>

                            <button onClick={toggleFullscreen} className={styles.controlButton}>
                                ⛶
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {title && (
                <div className={styles.titleBar}>
                    <h3>{title}</h3>
                    <span className={styles.qualityBadge}>{quality}</span>
                    <span className={styles.serverInfo}>
                        🌐 {streamInfo?.provider || 'VIP Stream S'}
                    </span>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
