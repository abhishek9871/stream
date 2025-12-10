import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import type { ExtractedStream, SubtitleTrack } from '../../types/stream';
import { VideoEnhancer } from '../../utils/VideoEnhancer';
import './NativePlayer.css';

// Volume adjustment step for keyboard controls
const VOLUME_STEP = 0.1;
const SEEK_STEP = 10;

interface NativePlayerProps {
    extracted: ExtractedStream;
    title?: string;
    poster?: string;
    autoplay?: boolean;
    onClose?: () => void;
    nextEpisode?: { season: number; episode: number; title: string };
    onPlayNext?: () => void;
    shouldEnterFullscreen?: boolean;
}

// Helper to find best English subtitle
const findEnglishSubtitle = (subtitles: SubtitleTrack[]): SubtitleTrack | null => {
    if (!subtitles || subtitles.length === 0) return null;

    // Priority order for English subtitles
    const englishPatterns = [
        /^english$/i,
        /^english\s*\(cc\)$/i,
        /^english\s*-\s*cc$/i,
        /^eng$/i,
        /^en$/i,
        /english/i,
        /eng/i,
    ];

    for (const pattern of englishPatterns) {
        const match = subtitles.find(sub => pattern.test(sub.label));
        if (match) return match;
    }

    // If no English found, check for default
    const defaultSub = subtitles.find(sub => sub.default);
    if (defaultSub) return defaultSub;

    return null;
};

// Reusable Control Button Component
const ControlButton = ({ icon, onClick, className = '', size = '3xl', title = '' }: { icon: string; onClick?: () => void; className?: string; size?: string; title?: string }) => (
    <button
        onClick={onClick}
        className={`p-1 md:p-2 text-white/80 hover:text-white transition-colors ${className}`}
        title={title}
    >
        <span className={`material-symbols-outlined text-xl md:!text-${size}`}>{icon}</span>
    </button>
);

export const MoviePlayer: React.FC<NativePlayerProps> = ({
    extracted,
    title = 'Cosmic Odyssey',
    poster,
    autoplay = true,
    onClose,
    nextEpisode,
    onPlayNext,
    shouldEnterFullscreen = false
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // Video State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showRemainingTime, setShowRemainingTime] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isVolumeScrubbing, setIsVolumeScrubbing] = useState(false);
    const volumeBarRef = useRef<HTMLDivElement>(null);
    const hideControlsTimeoutRef = useRef<number | null>(null);

    // Quality State (declared early for use in resetHideControlsTimer)
    const [quality, setQuality] = useState<number>(-1);
    const [qualities, setQualities] = useState<Array<{ index: number; height: number; label: string }>>([]);
    const [showQualityMenu, setShowQualityMenu] = useState(false);

    // Subtitle State (declared early for use in resetHideControlsTimer)
    const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
    const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
    const [subtitlesReady, setSubtitlesReady] = useState(false);

    // Playback Speed State
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    // Video Enhancement State
    const [enhancementEnabled, setEnhancementEnabled] = useState(() => {
        const saved = localStorage.getItem('videoEnhancement');
        return saved === 'true';
    });
    const enhancerRef = useRef<VideoEnhancer | null>(null);
    const enhancedCanvasRef = useRef<HTMLCanvasElement>(null);
    const [enhancementSupported] = useState(() => VideoEnhancer.isSupported());

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Auto-hide controls after inactivity
    const HIDE_CONTROLS_DELAY = 3000; // 3 seconds

    const resetHideControlsTimer = useCallback(() => {
        setShowControls(true);

        // Clear existing timeout
        if (hideControlsTimeoutRef.current) {
            window.clearTimeout(hideControlsTimeoutRef.current);
        }

        // Only set timer to hide if playing AND no menus are open
        if (isPlaying && !showSubtitleMenu && !showQualityMenu && !showSpeedMenu) {
            hideControlsTimeoutRef.current = window.setTimeout(() => {
                setShowControls(false);
            }, HIDE_CONTROLS_DELAY);
        }
    }, [isPlaying, showSubtitleMenu, showQualityMenu, showSpeedMenu]);

    // Handle mouse movement to show controls
    const handleMouseMove = useCallback(() => {
        resetHideControlsTimer();
    }, [resetHideControlsTimer]);

    // Reset timer when play state changes or menus close
    useEffect(() => {
        if (!isPlaying) {
            // When paused, always show controls
            setShowControls(true);
            if (hideControlsTimeoutRef.current) {
                window.clearTimeout(hideControlsTimeoutRef.current);
            }
        } else if (showSubtitleMenu || showQualityMenu) {
            // Keep controls visible when menus are open
            setShowControls(true);
            if (hideControlsTimeoutRef.current) {
                window.clearTimeout(hideControlsTimeoutRef.current);
            }
        } else {
            // When playing and no menus open, start the hide timer
            resetHideControlsTimer();
        }

        return () => {
            if (hideControlsTimeoutRef.current) {
                window.clearTimeout(hideControlsTimeoutRef.current);
            }
        };
    }, [isPlaying, showSubtitleMenu, showQualityMenu, resetHideControlsTimer]);

    // Mobile Gesture State
    const [brightness, setBrightness] = useState(1); // 0.2 to 2.0 range
    const [isZoomToFill, setIsZoomToFill] = useState(false); // Zoom to fill for mobile
    const [isFullscreen, setIsFullscreen] = useState(false); // Track fullscreen state
    const [gestureIndicator, setGestureIndicator] = useState<{
        type: 'volume' | 'brightness' | 'seek-forward' | 'seek-backward' | 'zoom';
        value: number | string;
    } | null>(null);
    const touchStartRef = useRef<{ x: number; y: number; time: number; initialVolume: number; initialBrightness: number } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number } | null>(null);
    const gestureIndicatorTimeoutRef = useRef<number | null>(null);
    const initialPinchDistanceRef = useRef<number | null>(null);
    const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
    const countdownCancelledRef = useRef(false);

    // Reset cancelled state when episode changes
    useEffect(() => {
        countdownCancelledRef.current = false;
        setNextEpisodeCountdown(null);
    }, [nextEpisode?.season, nextEpisode?.episode]);

    // Auto-play Next Episode Logic
    useEffect(() => {
        if (!duration || !currentTime || !onPlayNext || !nextEpisode) return;

        const remaining = duration - currentTime;

        // Trigger countdown when 5 seconds remain (only if not cancelled)
        if (remaining <= 5 && remaining > 0 && isPlaying && nextEpisodeCountdown === null && !countdownCancelledRef.current) {
            setNextEpisodeCountdown(5);
        }

        // Cancel countdown if user seeks back
        if (remaining > 6 && nextEpisodeCountdown !== null) {
            setNextEpisodeCountdown(null);
        }
    }, [currentTime, duration, isPlaying, nextEpisodeCountdown, onPlayNext, nextEpisode]);

    // Handle Countdown Timer
    useEffect(() => {
        if (nextEpisodeCountdown === null) return;

        if (nextEpisodeCountdown <= 0) {
            if (onPlayNext) {
                onPlayNext();
                setNextEpisodeCountdown(null);
            }
            return;
        }

        const timer = setTimeout(() => {
            setNextEpisodeCountdown(prev => (prev !== null ? prev - 1 : null));
        }, 1000);

        return () => clearTimeout(timer);
    }, [nextEpisodeCountdown, onPlayNext]);

    // Track fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Restore fullscreen when new episode loads if needed
    useEffect(() => {
        if (shouldEnterFullscreen && containerRef.current && !document.fullscreenElement) {
            // Small delay to ensure video is ready
            const timer = setTimeout(() => {
                containerRef.current?.requestFullscreen().catch(() => { });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [shouldEnterFullscreen, extracted.m3u8Url]);

    // Show gesture indicator with auto-hide
    const showGestureIndicatorWithTimeout = useCallback((indicator: typeof gestureIndicator) => {
        setGestureIndicator(indicator);
        if (gestureIndicatorTimeoutRef.current) {
            window.clearTimeout(gestureIndicatorTimeoutRef.current);
        }
        gestureIndicatorTimeoutRef.current = window.setTimeout(() => {
            setGestureIndicator(null);
        }, 800);
    }, []);

    // Touch handlers for mobile gestures
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Detect pinch start (two fingers)
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            initialPinchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
            return;
        }

        const touch = e.touches[0];
        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            initialVolume: volume,
            initialBrightness: brightness
        };
    }, [volume, brightness]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        // Handle pinch zoom (two fingers)
        if (e.touches.length === 2 && initialPinchDistanceRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const delta = currentDistance - initialPinchDistanceRef.current;

            // Toggle zoom if pinch is significant
            if (Math.abs(delta) > 50) {
                if (delta > 0 && !isZoomToFill) {
                    setIsZoomToFill(true);
                    showGestureIndicatorWithTimeout({ type: 'zoom', value: 'Fill' });
                } else if (delta < 0 && isZoomToFill) {
                    setIsZoomToFill(false);
                    showGestureIndicatorWithTimeout({ type: 'zoom', value: 'Fit' });
                }
                initialPinchDistanceRef.current = currentDistance;
            }
            return;
        }

        // Don't handle gestures when menus are open
        if (showSubtitleMenu || showQualityMenu || showSpeedMenu) return;
        // Only allow volume/brightness gestures in fullscreen mode on mobile (prevent page scroll interference)
        if (!isFullscreen) return;
        if (!touchStartRef.current || !containerRef.current || !videoRef.current) return;

        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const isRightHalf = touchStartRef.current.x > rect.left + rect.width / 2;

        const deltaY = touchStartRef.current.y - touch.clientY;
        const sensitivity = 200; // pixels for full range change

        // Only trigger if swipe distance exceeds threshold
        if (Math.abs(deltaY) > 5) {
            if (isRightHalf) {
                // Volume control on right half
                const volumeChange = deltaY / sensitivity;
                const newVolume = Math.max(0, Math.min(1, touchStartRef.current.initialVolume + volumeChange));
                setVolume(newVolume);
                videoRef.current.volume = newVolume;
                if (newVolume > 0 && isMuted) {
                    setIsMuted(false);
                    videoRef.current.muted = false;
                }
                showGestureIndicatorWithTimeout({ type: 'volume', value: Math.round(newVolume * 100) });
            } else {
                // Brightness control on left half
                const brightnessChange = deltaY / sensitivity;
                const newBrightness = Math.max(0.2, Math.min(2, touchStartRef.current.initialBrightness + brightnessChange));
                setBrightness(newBrightness);
                // Show brightness as percentage where 1.0 = 100%
                showGestureIndicatorWithTimeout({ type: 'brightness', value: Math.round(newBrightness * 100) });
            }
        }
    }, [isMuted, showGestureIndicatorWithTimeout, showSubtitleMenu, showQualityMenu, showSpeedMenu, isZoomToFill, isFullscreen]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        // Reset pinch tracking
        initialPinchDistanceRef.current = null;

        // Don't handle gestures when menus are open
        if (showSubtitleMenu || showQualityMenu || showSpeedMenu) {
            touchStartRef.current = null;
            return;
        }
        if (!containerRef.current) return;

        const touch = e.changedTouches[0];
        const now = Date.now();
        const rect = containerRef.current.getBoundingClientRect();
        const isRightHalf = touch.clientX > rect.left + rect.width / 2;

        // Check for double tap (within 300ms) - only works in fullscreen mode
        if (isFullscreen && lastTapRef.current && now - lastTapRef.current.time < 300) {
            // Verify taps are on same side
            const lastTapRightHalf = lastTapRef.current.x > rect.left + rect.width / 2;
            if (isRightHalf === lastTapRightHalf) {
                // Inline seek logic to avoid dependency ordering issues
                if (videoRef.current) {
                    if (isRightHalf) {
                        videoRef.current.currentTime += SEEK_STEP;
                        showGestureIndicatorWithTimeout({ type: 'seek-forward', value: SEEK_STEP });
                    } else {
                        videoRef.current.currentTime -= SEEK_STEP;
                        showGestureIndicatorWithTimeout({ type: 'seek-backward', value: SEEK_STEP });
                    }
                }
                lastTapRef.current = null; // Reset to prevent triple-tap triggering
                return;
            }
        }

        // Check if it was a tap (short touch without much movement)
        if (touchStartRef.current) {
            const touchDuration = now - touchStartRef.current.time;
            const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
            const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

            if (touchDuration < 300 && deltaX < 20 && deltaY < 20) {
                // This was a tap, record it for potential double-tap (only in fullscreen)
                if (isFullscreen) {
                    lastTapRef.current = { time: now, x: touch.clientX };
                }

                // Single tap shows controls (works in all modes)
                resetHideControlsTimer();
            }
        }

        touchStartRef.current = null;
    }, [showGestureIndicatorWithTimeout, resetHideControlsTimer, showSubtitleMenu, showQualityMenu, showSpeedMenu, isFullscreen]);

    // Initialize HLS
    useEffect(() => {
        if (!videoRef.current || !extracted.m3u8Url) return;

        const video = videoRef.current;

        // Reset state
        setLoading(true);
        setError(null);
        setSubtitlesReady(false);

        // Cleanup previous instance
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        // Remove existing tracks
        const existingTracks = video.querySelectorAll('track');
        existingTracks.forEach(track => track.remove());

        const initHls = () => {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                });

                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                    const qualityList = data.levels
                        .map((level, index) => ({
                            index,
                            height: level.height || 0,
                            label: level.height ? `${level.height}p` : `Level ${index}`
                        }))
                        .sort((a, b) => b.height - a.height);

                    setQualities(qualityList);

                    // Force start at highest quality
                    if (qualityList.length > 0) {
                        hls.startLevel = qualityList[0].index;
                        setQuality(qualityList[0].index);
                    } else {
                        setQuality(-1);
                    }

                    setLoading(false);
                    addSubtitleTracks(video);

                    if (autoplay) {
                        video.play().catch(() => setIsPlaying(false));
                        setIsPlaying(true);
                    }
                });

                hls.on(Hls.Events.ERROR, (_, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                hls.destroy();
                                break;
                        }
                    }
                });

                hlsRef.current = hls;
                hls.loadSource(extracted.m3u8Url);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS (Safari)
                video.src = extracted.m3u8Url;
                video.addEventListener('loadedmetadata', () => {
                    setLoading(false);
                    if (autoplay) video.play();
                });
                addSubtitleTracks(video);
            }
        };

        initHls();

        return () => {
            if (hlsRef.current) hlsRef.current.destroy();
        };
    }, [extracted.m3u8Url]);

    // Video Enhancement Initialization
    useEffect(() => {
        if (!enhancementSupported || !enhancedCanvasRef.current) return;

        const enhancer = new VideoEnhancer();
        const initialized = enhancer.initialize(enhancedCanvasRef.current);

        if (initialized) {
            enhancerRef.current = enhancer;
        }

        return () => {
            if (enhancerRef.current) {
                enhancerRef.current.destroy();
                enhancerRef.current = null;
            }
        };
    }, [enhancementSupported]);

    // Start/Stop enhancement based on state and playback
    useEffect(() => {
        if (!enhancerRef.current || !videoRef.current) return;

        if (enhancementEnabled && isPlaying) {
            enhancerRef.current.start(videoRef.current);
        } else {
            enhancerRef.current.stop();
        }
    }, [enhancementEnabled, isPlaying]);

    // Toggle enhancement handler
    const toggleEnhancement = useCallback(() => {
        const newValue = !enhancementEnabled;
        setEnhancementEnabled(newValue);
        localStorage.setItem('videoEnhancement', String(newValue));
    }, [enhancementEnabled]);

    // Handle Subtitles
    const addSubtitleTracks = (video: HTMLVideoElement) => {
        if (!extracted.subtitles || extracted.subtitles.length === 0) {
            setSubtitlesReady(true);
            return;
        }

        extracted.subtitles.forEach((sub) => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = sub.label;
            track.srclang = sub.label.toLowerCase().substring(0, 2);
            track.src = sub.file;
            track.default = false;
            video.appendChild(track);
        });

        // Auto-select English
        setTimeout(() => {
            const englishSub = findEnglishSubtitle(extracted.subtitles!);
            if (englishSub) {
                setActiveSubtitle(englishSub.file);
                // Enable track by label
                for (let i = 0; i < video.textTracks.length; i++) {
                    if (video.textTracks[i].label === englishSub.label) {
                        video.textTracks[i].mode = 'showing';
                        break;
                    }
                }
            }
            setSubtitlesReady(true);
        }, 500);
    };

    // Switch Subtitle
    const handleSubtitleChange = (subtitleFile: string | null) => {
        const video = videoRef.current;
        if (!video) return;

        for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'disabled';
        }

        if (subtitleFile) {
            const targetSub = extracted.subtitles?.find(s => s.file === subtitleFile);
            if (targetSub) {
                for (let i = 0; i < video.textTracks.length; i++) {
                    if (video.textTracks[i].label === targetSub.label) {
                        video.textTracks[i].mode = 'showing';
                        break;
                    }
                }
            }
        }
        setActiveSubtitle(subtitleFile);
        setShowSubtitleMenu(false);
    };

    // Switch Quality
    const handleQualityChange = (index: number) => {
        setQuality(index);
        if (hlsRef.current) {
            hlsRef.current.currentLevel = index;
        }
        setShowQualityMenu(false);
    };

    // Video Controls Handlers
    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current && !isScrubbing) {
            setCurrentTime(videoRef.current.currentTime);
            setDuration(videoRef.current.duration || 0);
        }
    };

    const formatTime = (time: number) => {
        if (!isFinite(time) || isNaN(time)) return "0:00";
        const totalSeconds = Math.floor(time);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        }
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const handleSeek = (amount: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += amount;
        }
    };

    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current || !videoRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const percent = Math.min(Math.max(0, e.clientX - rect.left), rect.width) / rect.width;
        videoRef.current.currentTime = percent * videoRef.current.duration;
        setCurrentTime(videoRef.current.currentTime);
    };

    const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isScrubbing && timelineRef.current && videoRef.current) {
            const rect = timelineRef.current.getBoundingClientRect();
            const percent = Math.min(Math.max(0, e.clientX - rect.left), rect.width) / rect.width;
            videoRef.current.currentTime = percent * videoRef.current.duration;
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            containerRef.current.requestFullscreen();
        }
    };

    const toggleMute = () => {
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    };

    const handleVolumeChange = useCallback((clientX: number) => {
        if (!videoRef.current || !volumeBarRef.current) return;
        const rect = volumeBarRef.current.getBoundingClientRect();
        const percent = Math.min(Math.max(0, clientX - rect.left), rect.width) / rect.width;

        const newVolume = Math.max(0, Math.min(1, percent));
        setVolume(newVolume);
        videoRef.current.volume = newVolume;

        if (newVolume > 0 && isMuted) {
            setIsMuted(false);
            videoRef.current.muted = false;
        }
    }, [isMuted]);

    const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsVolumeScrubbing(true);
        handleVolumeChange(e.clientX);
    };

    const handleVolumeMouseMove = useCallback((e: MouseEvent) => {
        if (isVolumeScrubbing) {
            handleVolumeChange(e.clientX);
        }
    }, [isVolumeScrubbing, handleVolumeChange]);

    const handleVolumeMouseUp = useCallback(() => {
        setIsVolumeScrubbing(false);
    }, []);

    // Global mouse events for volume scrubbing
    useEffect(() => {
        if (isVolumeScrubbing) {
            document.addEventListener('mousemove', handleVolumeMouseMove);
            document.addEventListener('mouseup', handleVolumeMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleVolumeMouseMove);
            document.removeEventListener('mouseup', handleVolumeMouseUp);
        };
    }, [isVolumeScrubbing, handleVolumeMouseMove, handleVolumeMouseUp]);

    // Playback speed change handler
    const handleSpeedChange = (speed: number) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = speed;
            setPlaybackSpeed(speed);
        }
        setShowSpeedMenu(false);
    };

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle if player container is focused or in fullscreen
            if (!containerRef.current) return;
            const isPlayerFocused = containerRef.current.contains(document.activeElement) || document.fullscreenElement === containerRef.current;
            if (!isPlayerFocused && !document.fullscreenElement) return;

            switch (e.code) {
                case 'Space':
                case 'KeyK':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handleSeek(-SEEK_STEP);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleSeek(SEEK_STEP);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (videoRef.current) {
                        const newVol = Math.min(1, videoRef.current.volume + VOLUME_STEP);
                        videoRef.current.volume = newVol;
                        setVolume(newVol);
                        if (isMuted) {
                            setIsMuted(false);
                            videoRef.current.muted = false;
                        }
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (videoRef.current) {
                        const newVol = Math.max(0, videoRef.current.volume - VOLUME_STEP);
                        videoRef.current.volume = newVol;
                        setVolume(newVol);
                    }
                    break;
                case 'KeyM':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'Escape':
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else if (onClose) {
                        onClose();
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isMuted, onClose]);

    // Progress Bar Width
    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            tabIndex={0}
            className="flex items-center justify-center w-full h-full bg-black group relative overflow-hidden font-display outline-none cursor-none"
            style={{ cursor: showControls ? 'default' : 'none' }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => { setIsHovering(false); setShowControls(false); }}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Video Element */}
            <video
                ref={videoRef}
                className={`w-full h-full transition-all duration-300 ${isZoomToFill ? 'object-cover' : 'object-contain'}`}
                style={{ filter: `brightness(${brightness})` }}
                onClick={togglePlay}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                    setIsPlaying(false);
                    // If no next episode (series finale), close player
                    if (!nextEpisode && onClose) {
                        onClose();
                    }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onVolumeChange={() => {
                    if (videoRef.current) {
                        setVolume(videoRef.current.volume);
                        setIsMuted(videoRef.current.muted);
                    }
                }}
            />

            {/* Enhanced Video Canvas (WebGL) */}
            {enhancementSupported && (
                <canvas
                    ref={enhancedCanvasRef}
                    className={`absolute inset-0 w-full h-full transition-opacity duration-300 pointer-events-none ${enhancementEnabled && isPlaying ? 'opacity-100' : 'opacity-0'} ${isZoomToFill ? 'object-cover' : 'object-contain'}`}
                    style={{ filter: `brightness(${brightness})` }}
                />
            )}

            {/* Loading Spinner */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
                </div>
            )}

            {/* Mobile Gesture Indicator */}
            {gestureIndicator && (
                <div className={`absolute top-1/2 -translate-y-1/2 z-40 pointer-events-none ${gestureIndicator.type === 'volume' || gestureIndicator.type === 'seek-forward' ? 'right-8' : 'left-8'
                    }`}>
                    <div className="bg-black/70 backdrop-blur-sm rounded-xl p-4 flex flex-col items-center gap-2 min-w-[80px]">
                        {gestureIndicator.type === 'volume' && (
                            <>
                                <span className="material-symbols-outlined text-white text-3xl">
                                    {gestureIndicator.value === 0 ? 'volume_off' : gestureIndicator.value < 50 ? 'volume_down' : 'volume_up'}
                                </span>
                                <div className="w-1 h-24 bg-white/30 rounded-full overflow-hidden relative">
                                    <div
                                        className="absolute bottom-0 w-full bg-white rounded-full transition-all duration-100"
                                        style={{ height: `${gestureIndicator.value}%` }}
                                    ></div>
                                </div>
                                <span className="text-white text-sm font-medium">{gestureIndicator.value}%</span>
                            </>
                        )}
                        {gestureIndicator.type === 'brightness' && (
                            <>
                                <span className="material-symbols-outlined text-white text-3xl">
                                    {gestureIndicator.value < 80 ? 'brightness_low' : gestureIndicator.value < 120 ? 'brightness_medium' : 'brightness_high'}
                                </span>
                                <div className="w-1 h-24 bg-white/30 rounded-full overflow-hidden relative">
                                    <div
                                        className="absolute bottom-0 w-full bg-yellow-400 rounded-full transition-all duration-100"
                                        style={{ height: `${Math.min(100, (gestureIndicator.value / 200) * 100)}%` }}
                                    ></div>
                                </div>
                                <span className="text-white text-sm font-medium">{gestureIndicator.value}%</span>
                            </>
                        )}
                        {gestureIndicator.type === 'seek-forward' && (
                            <>
                                <span className="material-symbols-outlined text-white text-4xl">forward_10</span>
                                <span className="text-white text-sm font-medium">+{gestureIndicator.value}s</span>
                            </>
                        )}
                        {gestureIndicator.type === 'seek-backward' && (
                            <>
                                <span className="material-symbols-outlined text-white text-4xl">replay_10</span>
                                <span className="text-white text-sm font-medium">-{gestureIndicator.value}s</span>
                            </>
                        )}
                        {gestureIndicator.type === 'zoom' && (
                            <>
                                <span className="material-symbols-outlined text-white text-4xl">
                                    {gestureIndicator.value === 'Fill' ? 'zoom_out_map' : 'zoom_in_map'}
                                </span>
                                <span className="text-white text-sm font-medium">{gestureIndicator.value}</span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Gradient Overlay */}
            <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/50 transition-opacity duration-300 pointer-events-none ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}></div>

            {/* Top Controls (Title + Close) - Always visible on hover or pause */}
            <div className={`absolute top-0 left-0 right-0 p-3 md:p-6 transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex justify-between items-start gap-2">
                    <h2 className="text-white font-heading text-base sm:text-xl md:text-2xl lg:text-3xl font-bold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] line-clamp-1 flex-1">{title}</h2>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="text-white hover:text-white/80 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all backdrop-blur-md border border-white/20 flex-shrink-0"
                        >
                            <span className="material-symbols-outlined text-lg md:text-xl">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Center Play Button - Hidden on mobile (gestures handle play/pause) */}
            {!loading && (
                <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
                    <button
                        onClick={togglePlay}
                        className={`flex items-center justify-center size-20 bg-black/50 backdrop-blur-sm text-white rounded-full transition-all duration-300 transform pointer-events-auto hover:scale-110 hover:bg-primary ${isPlaying ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}
                    >
                        <span className="material-symbols-outlined !text-5xl">play_arrow</span>
                    </button>
                </div>
            )}

            {/* Next Episode Overlay */}
            {nextEpisode && (
                <div className={`absolute bottom-12 left-1/2 md:left-auto md:bottom-24 md:right-8 z-50 transition-all duration-500 transform ${nextEpisodeCountdown !== null ? 'opacity-100 -translate-x-1/2 translate-y-0 md:translate-x-0' : 'opacity-0 -translate-x-1/2 translate-y-10 md:translate-x-0 pointer-events-none'}`}>
                    <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-4 shadow-2xl max-w-[280px]">
                        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1">Up Next in {nextEpisodeCountdown}</p>
                        <h4 className="text-white font-bold text-sm md:text-base line-clamp-1 mb-3">{nextEpisode.title}</h4>
                        <div className="flex gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setNextEpisodeCountdown(null);
                                    if (onPlayNext) onPlayNext();
                                }}
                                className="flex-1 bg-white text-black py-2 px-3 rounded font-bold text-xs md:text-sm hover:bg-gray-200 transition-colors"
                            >
                                Play Now
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    countdownCancelledRef.current = true;
                                    setNextEpisodeCountdown(null);
                                }}
                                className="bg-white/10 text-white py-2 px-3 rounded font-bold text-xs md:text-sm hover:bg-white/20 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Control Bar - Auto-hide during playback */}
            <div className={`absolute bottom-0 left-0 right-0 p-2 md:p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex flex-col gap-3">

                    {/* Timeline */}
                    <div
                        ref={timelineRef}
                        className="flex h-5 items-center justify-center group/timeline cursor-pointer"
                        onClick={handleTimelineClick}
                        onMouseDown={() => setIsScrubbing(true)}
                        onMouseUp={() => setIsScrubbing(false)}
                        onMouseLeave={() => setIsScrubbing(false)}
                        onMouseMove={handleTimelineMouseMove}
                    >
                        <div className="relative w-full h-1 group-hover/timeline:h-2 transition-all duration-200 bg-white/30 rounded-full overflow-hidden">
                            {/* Buffer Bar (optional to add if buffer info available) */}
                            {/* Progress Bar */}
                            <div
                                className="absolute top-0 left-0 h-full bg-primary transition-all duration-100"
                                style={{ width: `${progressPercent}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center justify-between gap-1 md:gap-4">
                        <div className="flex items-center gap-0.5 md:gap-2">
                            {/* Play button - hidden on mobile (gestures handle it) */}
                            <button onClick={togglePlay} className="hidden md:block p-1 md:p-2 text-white/80 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-2xl md:!text-3xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
                            </button>

                            {/* Seek buttons - hidden on mobile (gestures handle it) */}
                            <div className="hidden md:flex items-center gap-2">
                                <ControlButton icon="replay_10" onClick={() => handleSeek(-10)} />
                                <ControlButton icon="forward_10" onClick={() => handleSeek(10)} />
                            </div>

                            {/* Volume control - hidden on mobile (touch gestures handle it) */}
                            <div className="hidden md:flex items-center gap-2 group/volume">
                                <ControlButton
                                    icon={isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                                    size="base"
                                    onClick={toggleMute}
                                />
                                <div
                                    ref={volumeBarRef}
                                    className="w-24 h-2 bg-white/30 rounded-full overflow-hidden scale-x-0 group-hover/volume:scale-x-100 origin-left transition-transform duration-200 cursor-pointer"
                                    onMouseDown={handleVolumeMouseDown}
                                >
                                    <div
                                        className="h-full bg-white rounded-full pointer-events-none"
                                        style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                                    ></div>
                                </div>
                            </div>

                            {/* Time display - visible on all devices */}
                            <div className="flex items-center text-white/80 text-xs font-medium tracking-wider pl-1 md:pl-2 font-mono">
                                <span>{formatTime(currentTime)}</span>
                                <span className="px-0.5">/</span>
                                <span
                                    className="cursor-pointer hover:text-white transition-colors"
                                    onClick={() => setShowRemainingTime(!showRemainingTime)}
                                    title={showRemainingTime ? "Show Total Time" : "Show Remaining Time"}
                                >
                                    {showRemainingTime
                                        ? `-${formatTime(duration - currentTime)}`
                                        : formatTime(duration)
                                    }
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 relative">
                            {/* Video Enhancement Toggle */}
                            {enhancementSupported && (
                                <button
                                    onClick={toggleEnhancement}
                                    className={`p-1 md:p-2 transition-colors ${enhancementEnabled ? 'text-accent-primary' : 'text-white/80 hover:text-white'}`}
                                    title={enhancementEnabled ? 'Video Enhancement ON' : 'Video Enhancement OFF'}
                                >
                                    <span className="material-symbols-outlined text-xl md:text-2xl">auto_fix_high</span>
                                </button>
                            )}

                            {/* Subtitles Button */}
                            <div className="relative">
                                <ControlButton
                                    icon="closed_caption"
                                    size="base"
                                    onClick={() => { setShowSubtitleMenu(!showSubtitleMenu); setShowQualityMenu(false); setShowSpeedMenu(false); }}
                                />
                                {showSubtitleMenu && (
                                    <div
                                        className="absolute bottom-12 right-0 w-48 md:w-80 bg-black/95 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl overflow-hidden max-h-32 md:max-h-72 overflow-y-auto scrollbar-thin"
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-2 text-xs font-bold text-white/60 uppercase border-b border-white/20 bg-white/5">Subtitles</div>
                                        <button
                                            className={`w-full text-left px-3 py-2 text-xs md:text-sm hover:bg-white/10 transition-colors ${!activeSubtitle ? 'text-green-400 font-semibold' : 'text-white'}`}
                                            onClick={() => handleSubtitleChange(null)}
                                        >
                                            Off
                                        </button>
                                        {extracted.subtitles?.map((sub, i) => (
                                            <button
                                                key={i}
                                                className={`w-full text-left px-3 py-2 text-xs md:text-sm hover:bg-white/10 transition-colors whitespace-normal break-words ${activeSubtitle === sub.file ? 'text-green-400 font-semibold' : 'text-white'}`}
                                                onClick={() => handleSubtitleChange(sub.file)}
                                            >
                                                {sub.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Quality Button */}
                            <div className="relative">
                                <ControlButton
                                    icon="settings"
                                    size="base"
                                    onClick={() => { setShowQualityMenu(!showQualityMenu); setShowSubtitleMenu(false); }}
                                />
                                {showQualityMenu && (
                                    <div
                                        className="absolute bottom-12 right-0 w-24 md:w-32 bg-background-dark/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-32 md:max-h-60 overflow-y-auto scrollbar-thin"
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-1.5 md:py-2 text-xs font-bold text-white/50 uppercase border-b border-white/10">Quality</div>
                                        <button
                                            className={`w-full text-left px-3 py-1.5 md:py-2 text-xs md:text-sm hover:bg-white/10 transition-colors ${quality === -1 ? 'text-primary font-bold' : 'text-white/80'}`}
                                            onClick={() => handleQualityChange(-1)}
                                        >
                                            Auto
                                        </button>
                                        {qualities.map(q => (
                                            <button
                                                key={q.index}
                                                className={`w-full text-left px-3 py-1.5 md:py-2 text-xs md:text-sm hover:bg-white/10 transition-colors ${quality === q.index ? 'text-primary font-bold' : 'text-white/80'}`}
                                                onClick={() => handleQualityChange(q.index)}
                                            >
                                                {q.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Playback Speed Button */}
                            <div className="relative">
                                <button
                                    className="p-1 md:p-2 text-white/80 hover:text-white transition-colors flex items-center gap-0.5"
                                    onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowQualityMenu(false); setShowSubtitleMenu(false); }}
                                    title="Playback speed"
                                >
                                    <span className="material-symbols-outlined text-xl md:text-2xl">speed</span>
                                    {playbackSpeed !== 1 && (
                                        <span className="text-xs font-bold">{playbackSpeed}x</span>
                                    )}
                                </button>
                                {showSpeedMenu && (
                                    <div
                                        className="absolute bottom-12 right-0 w-20 md:w-28 bg-background-dark/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-32 md:max-h-60 overflow-y-auto scrollbar-thin"
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-1.5 md:py-2 text-xs font-bold text-white/50 uppercase border-b border-white/10">Speed</div>
                                        {PLAYBACK_SPEEDS.map(speed => (
                                            <button
                                                key={speed}
                                                className={`w-full text-left px-3 py-1.5 md:py-2 text-xs md:text-sm hover:bg-white/10 transition-colors ${playbackSpeed === speed ? 'text-primary font-bold' : 'text-white/80'}`}
                                                onClick={() => handleSpeedChange(speed)}
                                            >
                                                {speed === 1 ? 'Normal' : `${speed}x`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Zoom to Fill Button - Mobile only */}
                            <button
                                className="md:hidden p-1 text-white/80 hover:text-white transition-colors"
                                onClick={() => {
                                    setIsZoomToFill(!isZoomToFill);
                                    showGestureIndicatorWithTimeout({ type: 'zoom', value: isZoomToFill ? 'Fit' : 'Fill' });
                                }}
                                title={isZoomToFill ? 'Fit to screen' : 'Fill screen'}
                            >
                                <span className="material-symbols-outlined text-xl">
                                    {isZoomToFill ? 'zoom_in_map' : 'zoom_out_map'}
                                </span>
                            </button>

                            <ControlButton icon="fullscreen" size="base" onClick={toggleFullscreen} />
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default MoviePlayer;
