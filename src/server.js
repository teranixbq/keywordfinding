const express = require('express');
const cors = require('cors');
const config = require('./config');
const { scrapeTikTokSearch } = require('./scraper/tiktokScraper');
const { scrapeKeywords, PLATFORM_URLS } = require('./scraper/keywordToolScraper');
const { analyzeTrends } = require('./analyzer/trendAnalyzer');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Simple In-Memory Cache ───────────────────────────────
const cache = new Map();

function getCacheKey(keyword, limit) {
    return `${keyword.toLowerCase().trim()}:${limit}`;
}

function getFromCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > config.cacheTTL) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ─── Health Check ─────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// ─── GET /api/trending ────────────────────────────────────
// Main endpoint: scrape + analyze trending themes
app.get('/api/trending', async (req, res) => {
    try {
        const { keyword, limit = '20' } = req.query;

        if (!keyword || keyword.trim().length === 0) {
            return res.status(400).json({
                error: 'Missing required parameter: keyword',
                usage: 'GET /api/trending?keyword=honor+of+kings&limit=20',
            });
        }

        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
        const cacheKey = getCacheKey(keyword, parsedLimit);

        // Check cache
        const cached = getFromCache(cacheKey);
        if (cached) {
            console.log(`[API] Cache hit for "${keyword}"`);
            return res.json({ ...cached, fromCache: true });
        }

        console.log(`[API] Scraping TikTok for: "${keyword}" (limit: ${parsedLimit})`);
        const startTime = Date.now();

        // Scrape TikTok
        const videos = await scrapeTikTokSearch(keyword, { limit: parsedLimit });

        // Analyze trends
        const analysis = analyzeTrends(videos, keyword);

        const result = {
            keyword: keyword.trim(),
            scrapedAt: new Date().toISOString(),
            scrapeDurationMs: Date.now() - startTime,
            totalVideosAnalyzed: videos.length,
            ...analysis,
        };

        // Cache result
        setCache(cacheKey, result);

        res.json(result);
    } catch (error) {
        console.error('[API] /api/trending error:', error.message);
        res.status(500).json({
            error: 'Failed to scrape trending data',
            message: error.message,
        });
    }
});

// ─── GET /api/search ──────────────────────────────────────
// Raw search results without trend analysis
app.get('/api/search', async (req, res) => {
    try {
        const { keyword, limit = '20' } = req.query;

        if (!keyword || keyword.trim().length === 0) {
            return res.status(400).json({
                error: 'Missing required parameter: keyword',
                usage: 'GET /api/search?keyword=honor+of+kings&limit=20',
            });
        }

        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        console.log(`[API] Raw search for: "${keyword}" (limit: ${parsedLimit})`);
        const startTime = Date.now();

        const videos = await scrapeTikTokSearch(keyword, { limit: parsedLimit });

        res.json({
            keyword: keyword.trim(),
            scrapedAt: new Date().toISOString(),
            scrapeDurationMs: Date.now() - startTime,
            totalResults: videos.length,
            videos,
        });
    } catch (error) {
        console.error('[API] /api/search error:', error.message);
        res.status(500).json({
            error: 'Failed to scrape search data',
            message: error.message,
        });
    }
});

// ─── GET /api/keywords/:platform ──────────────────────────
// Scrape keyword research data from keywordtool.io
app.get('/api/keywords/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { keyword, tab = 'suggestions', minVolume = '0', maxVolume } = req.query;

        // Validate platform
        const validPlatforms = Object.keys(PLATFORM_URLS);
        if (!validPlatforms.includes(platform)) {
            return res.status(400).json({
                error: `Invalid platform: "${platform}"`,
                validPlatforms,
                usage: 'GET /api/keywords/google?keyword=<term>&minVolume=50&maxVolume=200',
            });
        }

        // Validate keyword
        if (!keyword || keyword.trim().length === 0) {
            return res.status(400).json({
                error: 'Missing required parameter: keyword',
                usage: 'GET /api/keywords/google?keyword=lny+hok+2026&minVolume=50&maxVolume=200',
            });
        }

        const parsedMinVolume = Math.max(parseInt(minVolume, 10) || 0, 0);
        const parsedMaxVolume = maxVolume ? parseInt(maxVolume, 10) || Infinity : Infinity;



        console.log(`[API] Scraping keywordtool.io for: "${keyword}" on ${platform} (volume: ${parsedMinVolume}-${parsedMaxVolume === Infinity ? '∞' : parsedMaxVolume})`);
        const startTime = Date.now();

        const result = await scrapeKeywords(keyword, {
            platform,
            tab,
            minVolume: parsedMinVolume,
            maxVolume: parsedMaxVolume,
        });

        const response = {
            keyword: keyword.trim(),
            platform,
            tab,
            scrapedAt: new Date().toISOString(),
            scrapeDurationMs: Date.now() - startTime,
            ...result,
            isSuccess: true,
        };



        res.json(response);
    } catch (error) {
        console.error('[API] /api/keywords error:', error.message);

        // Return appropriate status code based on error type
        let statusCode = 500;
        if (error.message.includes('Login gagal')) statusCode = 401;
        if (error.message.includes('OTP') || error.message.includes('verifikasi')) statusCode = 503;

        res.status(statusCode).json({
            error: 'Failed to scrape keyword data',
            message: error.message,
            isSuccess: false,
        });
    }
});

// ─── GET /api/cache/clear ─────────────────────────────────
app.delete('/api/cache', (req, res) => {
    const size = cache.size;
    cache.clear();
    res.json({ message: `Cache cleared. ${size} entries removed.` });
});

// ─── 404 Handler ──────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        availableEndpoints: [
            'GET /health',
            'GET /api/trending?keyword=<search_term>&limit=<number>',
            'GET /api/search?keyword=<search_term>&limit=<number>',
            'GET /api/keywords/:platform?keyword=<term>&minVolume=<min>&maxVolume=<max>',
            'DELETE /api/cache',
        ],
    });
});

// ─── Error Handler ────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────
app.listen(config.port, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║   TikTok Trending API + KeywordTool Scraper                ║
║   Running on http://localhost:${config.port}                        ║
║                                                            ║
║   Endpoints:                                               ║
║   GET /health                                              ║
║   GET /api/trending?keyword=<term>&limit=20                ║
║   GET /api/search?keyword=<term>&limit=20                  ║
║   GET /api/keywords/:platform?keyword=<term>               ║
║       platforms: google,youtube,instagram,tiktok,trends     ║
║       params: &minVolume=50&maxVolume=200&tab=suggestions   ║
║   DELETE /api/cache                                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
