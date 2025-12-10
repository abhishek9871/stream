'use client';

import React, { useState } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import styles from './page.module.css';

// Sample movies with TMDB IDs for the scraper
const SAMPLE_MOVIES = [
  { id: 'tt0068646', title: 'The Godfather', year: 1972, tmdbId: 238 },
  { id: 'tt0137523', title: 'Fight Club', year: 1999, tmdbId: 550 },
  { id: 'tt0120338', title: 'Titanic', year: 1997, tmdbId: 597 },
  { id: 'tt0468569', title: 'The Dark Knight', year: 2008, tmdbId: 155 },
  { id: 'tt0111161', title: 'The Shawshank Redemption', year: 1994, tmdbId: 278 },
];

export default function Home() {
  const [selectedMovie, setSelectedMovie] = useState(SAMPLE_MOVIES[0]);
  const [playerKey, setPlayerKey] = useState(0);

  const handleMovieSelect = (movie) => {
    setSelectedMovie(movie);
    // Force player remount when changing movies
    setPlayerKey(prev => prev + 1);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>▶</span>
            <h1>4K Stream India</h1>
          </div>
          <p className={styles.tagline}>
            Ultra HD Streaming • Native HLS Playback • No Ads
          </p>
        </div>
        <div className={styles.regionBadge}>
          <span className={styles.flag}>🇮🇳</span>
          <span>New Delhi</span>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.heroSection}>
          <div className={styles.movieSelector}>
            <h2>Select a Movie</h2>
            <div className={styles.movieTabs}>
              {SAMPLE_MOVIES.map((movie) => (
                <button
                  key={movie.id}
                  onClick={() => handleMovieSelect(movie)}
                  className={`${styles.movieTab} ${selectedMovie.id === movie.id ? styles.active : ''}`}
                >
                  <span className={styles.movieTitle}>{movie.title}</span>
                  <span className={styles.movieYear}>{movie.year}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.playerSection}>
            <VideoPlayer
              key={playerKey}
              imdbId={selectedMovie.id}
              tmdbId={selectedMovie.tmdbId}
              title={selectedMovie.title}
              type="movie"
            />
          </div>
        </section>

        <section className={styles.featuresSection}>
          <h2>Features</h2>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎬</div>
              <h3>4K Ultra HD</h3>
              <p>Native HLS playback with adaptive bitrate streaming</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🚫</div>
              <h3>Ad-Free</h3>
              <p>Direct M3U8 extraction bypasses all embedded ads</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <h3>Fast Loading</h3>
              <p>Pre-extracted streams for instant playback</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📱</div>
              <h3>All Devices</h3>
              <p>Works on desktop, mobile, and smart TVs</p>
            </div>
          </div>
        </section>

        <section className={styles.infoSection}>
          <div className={styles.infoCard}>
            <h3>Now Playing</h3>
            <p><strong>{selectedMovie.title}</strong> ({selectedMovie.year})</p>
            <p className={styles.idInfo}>
              IMDB: {selectedMovie.id} • TMDB: {selectedMovie.tmdbId}
            </p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>© 2025 4K Stream India • Powered by VIP Stream S</p>
        <div className={styles.footerLinks}>
          <span>Backend: localhost:7860</span>
        </div>
      </footer>
    </div>
  );
}
