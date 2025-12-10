/**
 * SubtitleService - Handles fetching, extracting, and converting subtitles from Subdl
 * 
 * Subdl provides subtitles as ZIP files containing subtitle files. This service:
 * 1. Fetches the ZIP file
 * 2. Extracts subtitle files (SRT, SUB, ASS, VTT, TXT)
 * 3. Converts to VTT format
 * 4. Returns a blob URL that can be used with <track> element
 */

import JSZip from 'jszip';

export interface ProcessedSubtitle {
    label: string;
    lang: string;
    vttUrl: string; // Blob URL to VTT content
    originalFile: string;
    quality: number; // Quality score for sorting
}

export interface SubdlSubtitle {
    label: string;
    lang: string;
    file: string; // ZIP download URL
    author?: string;
    downloads?: number;
    hi?: boolean; // Hearing impaired
    source?: string;
}

// Supported subtitle extensions (in priority order)
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.txt'];

/**
 * Convert SRT content to VTT format
 */
function convertSrtToVtt(srtContent: string): string {
    let vtt = 'WEBVTT\n\n';
    const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;

        let timingLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('-->')) {
                timingLineIndex = i;
                break;
            }
        }

        if (timingLineIndex === -1) continue;

        // Convert timing: SRT uses commas (00:00:00,000), VTT uses periods (00:00:00.000)
        const timing = lines[timingLineIndex].replace(/,/g, '.');
        const text = lines.slice(timingLineIndex + 1).join('\n');

        if (timing && text) {
            vtt += `${timing}\n${text}\n\n`;
        }
    }

    return vtt;
}

/**
 * Convert ASS/SSA content to VTT format
 */
function convertAssToVtt(assContent: string): string {
    let vtt = 'WEBVTT\n\n';
    const lines = assContent.split(/\r?\n/);

    for (const line of lines) {
        // ASS format: Dialogue: 0,0:00:00.00,0:00:00.00,Default,,0,0,0,,Text
        if (line.startsWith('Dialogue:')) {
            const parts = line.split(',');
            if (parts.length >= 10) {
                const start = parts[1].trim();
                const end = parts[2].trim();
                const text = parts.slice(9).join(',')
                    .replace(/\\N/g, '\n')
                    .replace(/\{[^}]*\}/g, ''); // Remove ASS formatting tags

                if (start && end && text.trim()) {
                    vtt += `${start} --> ${end}\n${text.trim()}\n\n`;
                }
            }
        }
    }

    return vtt;
}

/**
 * Calculate quality score for a subtitle based on its label
 */
function calculateQualityScore(label: string): number {
    const lowerLabel = label.toLowerCase();
    let score = 0;

    // Prefer 4K/UHD (+100)
    if (lowerLabel.includes('4k') || lowerLabel.includes('uhd') || lowerLabel.includes('2160')) {
        score += 100;
    }

    // Prefer 1080p (+50)
    if (lowerLabel.includes('1080')) {
        score += 50;
    }

    // Prefer BluRay (+30)
    if (lowerLabel.includes('bluray') || lowerLabel.includes('blu-ray')) {
        score += 30;
    }

    // Prefer REMUX (+20)
    if (lowerLabel.includes('remux')) {
        score += 20;
    }

    // Prefer known good encoders (+10)
    const goodEncoders = ['tigole', 'yify', 'rarbg', 'sparks'];
    for (const encoder of goodEncoders) {
        if (lowerLabel.includes(encoder)) {
            score += 10;
            break;
        }
    }

    // Penalize hearing impaired (-5) unless user wants it
    if (lowerLabel.includes('sdh') || lowerLabel.includes('hearing')) {
        score -= 5;
    }

    return score;
}

/**
 * Fetch and process a single subtitle
 * Handles both:
 * - Embedded subtitles (direct VTT URLs from source - perfectly synced)
 * - Subdl subtitles (ZIP files that need extraction)
 */
export async function processSubtitle(subtitle: SubdlSubtitle): Promise<ProcessedSubtitle | null> {
    try {
        console.log(`[SubtitleService] Fetching: ${subtitle.label.substring(0, 50)}... (source: ${subtitle.source || 'unknown'})`);

        // EMBEDDED SUBTITLES: Direct VTT URL from source (perfectly synced!)
        if (subtitle.source === 'embedded' || subtitle.source === 'network') {
            // These are direct VTT URLs, no ZIP extraction needed
            const fileUrl = subtitle.file;

            // Check if it's already a VTT file
            if (fileUrl.includes('.vtt')) {
                console.log(`[SubtitleService] 🎯 EMBEDDED subtitle (synced with source): ${fileUrl.substring(0, 60)}...`);

                // Give embedded subtitles highest quality score (they're perfectly synced)
                const quality = 1000; // Higher than any Subdl subtitle

                // Label to indicate this is the synced subtitle from the source
                const label = subtitle.label === 'English'
                    ? 'English • Synced'
                    : (subtitle.label || 'English (Synced)');

                return {
                    label,
                    lang: subtitle.lang || 'en',
                    vttUrl: fileUrl, // Use the URL directly
                    originalFile: fileUrl,
                    quality
                };
            }

            // If it's SRT, fetch and convert
            if (fileUrl.includes('.srt')) {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    console.warn(`[SubtitleService] Failed to fetch embedded SRT: ${response.status}`);
                    return null;
                }

                const srtContent = await response.text();
                const vttContent = convertSrtToVtt(srtContent);
                const vttBlob = new Blob([vttContent], { type: 'text/vtt' });
                const vttUrl = URL.createObjectURL(vttBlob);

                return {
                    label: subtitle.label || 'English (Synced)',
                    lang: subtitle.lang || 'en',
                    vttUrl,
                    originalFile: fileUrl,
                    quality: 1000
                };
            }
        }

        // SUBDL SUBTITLES: ZIP files that need extraction
        const response = await fetch(subtitle.file);
        if (!response.ok) {
            console.warn(`[SubtitleService] Failed to fetch (${response.status}): ${subtitle.label.substring(0, 30)}`);
            return null;
        }

        const zipBlob = await response.blob();
        const zip = await JSZip.loadAsync(zipBlob);

        // Find subtitle file in the ZIP (try multiple formats)
        let subtitleContent: string | null = null;
        let subtitleFileName: string | null = null;
        let fileExtension: string = '';

        // Get all files sorted by priority
        const files = Object.keys(zip.files).filter(f => !zip.files[f].dir);

        // Try to find subtitle file by extension priority
        for (const ext of SUBTITLE_EXTENSIONS) {
            for (const fileName of files) {
                if (fileName.toLowerCase().endsWith(ext)) {
                    subtitleFileName = fileName;
                    subtitleContent = await zip.files[fileName].async('text');
                    fileExtension = ext;
                    break;
                }
            }
            if (subtitleContent) break;
        }

        if (!subtitleContent) {
            // Log what files were found in the ZIP for debugging
            console.warn(`[SubtitleService] No subtitle file found in ZIP. Files: ${files.join(', ')}`);
            return null;
        }

        console.log(`[SubtitleService] Extracted: ${subtitleFileName}`);

        // Convert to VTT based on format
        let vttContent: string;
        if (fileExtension === '.vtt') {
            vttContent = subtitleContent; // Already VTT
        } else if (fileExtension === '.ass' || fileExtension === '.ssa') {
            vttContent = convertAssToVtt(subtitleContent);
        } else {
            // SRT, SUB, TXT all use similar format
            vttContent = convertSrtToVtt(subtitleContent);
        }

        // Create blob URL
        const vttBlob = new Blob([vttContent], { type: 'text/vtt' });
        const vttUrl = URL.createObjectURL(vttBlob);

        const quality = calculateQualityScore(subtitle.label);
        console.log(`[SubtitleService] ✅ Processed: ${subtitle.label.substring(0, 40)}... (quality: ${quality})`);

        return {
            label: subtitle.label,
            lang: subtitle.lang,
            vttUrl,
            originalFile: subtitle.file,
            quality
        };
    } catch (error) {
        console.warn('[SubtitleService] Error processing subtitle:', error);
        return null;
    }
}

/**
 * Process ALL subtitles in parallel
 */
export async function processSubtitles(subtitles: SubdlSubtitle[]): Promise<ProcessedSubtitle[]> {
    if (!subtitles || subtitles.length === 0) {
        return [];
    }

    console.log(`[SubtitleService] Processing ALL ${subtitles.length} subtitle(s) in parallel...`);

    // Process ALL subtitles in parallel
    const promises = subtitles.map(sub => processSubtitle(sub));
    const results = await Promise.all(promises);

    // Filter out nulls and sort by quality
    const processed = results
        .filter((sub): sub is ProcessedSubtitle => sub !== null)
        .sort((a, b) => b.quality - a.quality);

    console.log(`[SubtitleService] ✅ Successfully processed ${processed.length}/${subtitles.length} subtitle(s)`);

    if (processed.length > 0) {
        console.log(`[SubtitleService] Best subtitle: "${processed[0].label.substring(0, 50)}..." (quality: ${processed[0].quality})`);
    }

    return processed;
}

/**
 * Find the best English subtitle from a list (already sorted by quality)
 */
export function findBestEnglishSubtitle(subtitles: ProcessedSubtitle[]): ProcessedSubtitle | null {
    if (!subtitles || subtitles.length === 0) return null;
    // List is already sorted by quality, return first
    return subtitles[0] || null;
}

/**
 * Cleanup blob URLs to prevent memory leaks
 */
export function cleanupSubtitleUrls(subtitles: ProcessedSubtitle[]): void {
    for (const sub of subtitles) {
        if (sub.vttUrl && sub.vttUrl.startsWith('blob:')) {
            URL.revokeObjectURL(sub.vttUrl);
        }
    }
}

export default {
    processSubtitle,
    processSubtitles,
    findBestEnglishSubtitle,
    cleanupSubtitleUrls
};
