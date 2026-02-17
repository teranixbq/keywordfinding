/**
 * Parse view/like count strings like "1.2M", "500K", "1234" into numbers
 */
function parseCount(str) {
    if (!str || typeof str !== 'string') return 0;
    str = str.trim().replace(/,/g, '');

    const multipliers = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
    const match = str.match(/^([\d.]+)\s*([KMB])?$/i);
    if (!match) return parseInt(str.replace(/\D/g, ''), 10) || 0;

    const num = parseFloat(match[1]);
    const suffix = (match[2] || '').toUpperCase();
    return Math.round(num * (multipliers[suffix] || 1));
}

/**
 * Extract hashtags from text
 */
function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g);
    return matches ? matches.map((tag) => tag.toLowerCase()) : [];
}

/**
 * Clean text: remove emojis and excessive whitespace
 */
function cleanText(text) {
    if (!text) return '';
    return text
        .replace(
            /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu,
            ''
        )
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Random delay for anti-detection
 */
function delay(min = 1000, max = 3000) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Indonesian + English stop words to filter out common words
 */
const STOP_WORDS = new Set([
    // English
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
    'could', 'should', 'may', 'might', 'not', 'no', 'so', 'if', 'when',
    'what', 'which', 'who', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just',
    'about', 'up', 'out', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'i', 'me', 'you', 'he', 'she', 'we', 'they', 'them', 'been', 'being',
    'get', 'got', 'go', 'going', 'make', 'like', 'see', 'also', 'new',
    // Indonesian
    'dan', 'atau', 'di', 'ke', 'dari', 'yang', 'ini', 'itu', 'untuk',
    'dengan', 'pada', 'adalah', 'akan', 'sudah', 'bisa', 'ada', 'tidak',
    'ya', 'aku', 'kamu', 'dia', 'kita', 'mereka', 'saya', 'juga', 'lagi',
    'nih', 'dong', 'sih', 'banget', 'gak', 'ga', 'udah', 'yg', 'nya',
    'aja', 'deh', 'kan', 'tuh', 'wkwk', 'wkwkwk',
    // Common short/noise words
    'fy', 'fyp', 'foryou', 'foryoupage', 'viral', 'tiktok', 'reels',
    // TikTok alt text noise (from "created by X with Y's original sound")
    'created', 'sound', 'original', 'suara', 'asli',
]);

module.exports = { parseCount, extractHashtags, cleanText, delay, STOP_WORDS };
