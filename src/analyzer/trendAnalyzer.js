const { STOP_WORDS } = require('../utils/helpers');

/**
 * Analyze scraped video data to extract trending themes
 * @param {Array} videos - Array of video objects from scraper
 * @param {string} keyword - Original search keyword
 * @returns {object} Trend analysis results
 */
function analyzeTrends(videos, keyword = '') {
    if (!videos || videos.length === 0) {
        return {
            trendingHashtags: [],
            trendingKeywords: [],
            topVideos: [],
            themes: [],
            summary: 'No videos found to analyze.',
        };
    }

    // --- 1. Trending Hashtags ---
    const hashtagMap = new Map();
    videos.forEach((video) => {
        const seen = new Set();
        video.hashtags.forEach((tag) => {
            const normalizedTag = tag.toLowerCase();
            if (seen.has(normalizedTag)) return;
            seen.add(normalizedTag);

            if (!hashtagMap.has(normalizedTag)) {
                hashtagMap.set(normalizedTag, { tag: normalizedTag, count: 0 });
            }
            const entry = hashtagMap.get(normalizedTag);
            entry.count++;
        });
    });

    const trendingHashtags = Array.from(hashtagMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    // --- 2. Trending Keywords ---
    const keywordLower = keyword.toLowerCase().split(/\s+/);
    const wordMap = new Map();

    videos.forEach((video) => {
        if (!video.description) return;

        // Remove hashtags from description for word analysis
        const textWithoutHashtags = video.description.replace(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g, '');
        const words = textWithoutHashtags
            .toLowerCase()
            .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !keywordLower.includes(w));

        const seenWords = new Set();
        words.forEach((word) => {
            if (seenWords.has(word)) return;
            seenWords.add(word);

            if (!wordMap.has(word)) {
                wordMap.set(word, { word, count: 0 });
            }
            const entry = wordMap.get(word);
            entry.count++;
        });
    });

    const trendingKeywords = Array.from(wordMap.values())
        .filter((w) => w.count >= 2) // At least appears in 2 videos
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    // --- 3. Top Videos ---
    const topVideos = videos.slice(0, 10);

    // --- 4. Theme Clustering (simple approach based on co-occurring hashtags) ---
    const themes = clusterThemes(videos, keyword);

    // --- 5. Summary ---
    const topTags = trendingHashtags.slice(0, 3).map((h) => h.tag).join(', ');
    const topWords = trendingKeywords.slice(0, 3).map((w) => w.word).join(', ');

    const summary =
        `Analyzed ${videos.length} videos for "${keyword}". ` +
        (topTags ? `Top hashtags: ${topTags}. ` : '') +
        (topWords ? `Trending topics: ${topWords}.` : '');

    return {
        trendingHashtags,
        trendingKeywords,
        topVideos,
        themes,
        summary,
    };
}

/**
 * Simple theme clustering based on hashtag co-occurrence
 */
function clusterThemes(videos, keyword) {
    const themeCounts = new Map();

    videos.forEach((video) => {
        const tags = video.hashtags.filter(
            (t) => !keyword.toLowerCase().split(/\s+/).some((kw) => t.includes(kw))
        );

        tags.forEach((tag) => {
            if (!themeCounts.has(tag)) {
                themeCounts.set(tag, {
                    theme: tag.replace('#', ''),
                    videos: 0,
                    sampleDescriptions: [],
                });
            }
            const entry = themeCounts.get(tag);
            entry.videos++;
            if (entry.sampleDescriptions.length < 2) {
                entry.sampleDescriptions.push(
                    video.description.substring(0, 100) + (video.description.length > 100 ? '...' : '')
                );
            }
        });
    });

    return Array.from(themeCounts.values())
        .filter((t) => t.videos >= 2)
        .sort((a, b) => b.videos - a.videos)
        .slice(0, 10);
}

function formatNumber(num) {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
}

module.exports = { analyzeTrends };
