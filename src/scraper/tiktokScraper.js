const { chromium } = require('playwright');
const config = require('../config');
const { parseCount, extractHashtags, cleanText, delay } = require('../utils/helpers');

/**
 * Scrape TikTok search results for a given keyword
 * @param {string} keyword - Search keyword
 * @param {object} options - { limit: number }
 * @returns {Promise<Array>} Array of video objects
 */
async function scrapeTikTokSearch(keyword, options = {}) {
    const { limit = 20 } = options;
    const userAgent = config.getRandomUserAgent();

    let browser;
    try {
        browser = await chromium.launch({
            headless: config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        const context = await browser.newContext({
            userAgent,
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        const page = await context.newPage();

        // Stealth overrides
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`;
        console.log(`[Scraper] Navigating to: ${searchUrl}`);

        await page.goto(searchUrl, {
            waitUntil: 'networkidle',
            timeout: config.requestTimeout,
        });

        await delay(4000, 6000);

        // Dismiss modals
        try {
            const declineBtn = page.locator('button:has-text("Decline")').first();
            if (await declineBtn.isVisible({ timeout: 2000 })) {
                await declineBtn.click();
                await delay(500, 1000);
            }
        } catch { }

        try {
            const closeBtn = page.locator('[data-e2e="modal-close-inner-button"]').first();
            if (await closeBtn.isVisible({ timeout: 2000 })) {
                await closeBtn.click();
                await delay(500, 1000);
            }
        } catch { }

        // Wait for search results
        try {
            await page.waitForSelector('[data-e2e="search_top-item"]', { timeout: 15000 });
            console.log('[Scraper] Found search_top-item elements');
        } catch {
            console.log('[Scraper] search_top-item not found, trying fallback...');
        }

        // Scroll to load more content
        let previousHeight = 0;
        for (let i = 0; i < config.maxScrollCount; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(2000, 4000);
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === previousHeight) break;
            previousHeight = currentHeight;
        }

        // Extract video data
        // In headless mode, TikTok puts the description in the <img alt> attribute
        // of the thumbnail image inside each search_top-item card.
        // Format: "description text #hashtag1 #hashtag2  created by AuthorName with SoundName"
        const videos = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-e2e="search_top-item"]');

            cards.forEach((card) => {
                // Get video URL
                const videoLink = card.querySelector('a[href*="/video/"]');
                if (!videoLink) return;
                const href = videoLink.getAttribute('href') || '';
                const url = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;

                // Get view count
                const viewsEl = card.querySelector('[data-e2e="video-views"]');
                const views = viewsEl ? viewsEl.textContent.trim() : '0';

                // Extract description from img alt attribute (headless mode)
                const img = card.querySelector('img[alt]');
                let altText = img ? img.getAttribute('alt') || '' : '';

                // Parse alt text: "description #hashtags  created by AuthorName with SoundName"
                let description = altText;
                let author = '';

                // Extract author from "created by X with" pattern
                const createdByMatch = altText.match(/\s{2,}created by\s+(.+?)(?:\s+with\s+|$)/i);
                if (createdByMatch) {
                    author = '@' + createdByMatch[1].trim();
                    // Remove the "created by..." part from description
                    description = altText.substring(0, altText.indexOf(createdByMatch[0])).trim();
                }

                // If no "created by" pattern, try to extract author from URL
                if (!author) {
                    const authorMatch = href.match(/@([^/]+)/);
                    if (authorMatch) author = '@' + authorMatch[1];
                }

                // Also try to get description from search-card-video-caption (works in non-headless)
                const captionEl = card.querySelector('[data-e2e="search-card-video-caption"]');
                if (captionEl && captionEl.textContent.trim()) {
                    description = captionEl.textContent.trim();
                }

                // Try to get author from search-card-user-unique-id
                const authorEl = card.querySelector('[data-e2e="search-card-user-unique-id"]');
                if (authorEl && authorEl.textContent.trim()) {
                    author = '@' + authorEl.textContent.trim().replace(/^@/, '');
                }

                // Extract hashtags from search-common-link elements
                const hashtagEls = card.querySelectorAll('[data-e2e="search-common-link"]');
                const cardHashtags = [];
                hashtagEls.forEach((el) => {
                    const text = (el.textContent || '').trim();
                    if (text.startsWith('#')) cardHashtags.push(text.toLowerCase());
                });

                results.push({ description, author, views, url, hashtags: cardHashtags });
            });

            return results;
        });

        console.log(`[Scraper] Found ${videos.length} video entries`);

        // Post-process
        const processed = videos.slice(0, limit).map((v) => {
            // Strip "created by X with Y" suffix from alt-text extracted descriptions
            let desc = v.description;
            const createdIdx = desc.search(/\s{1,}created by\s+/i);
            if (createdIdx > 0) {
                desc = desc.substring(0, createdIdx).trim();
            }

            const descHashtags = extractHashtags(desc);
            const allHashtags = [...new Set([...(v.hashtags || []), ...descHashtags])];

            return {
                description: cleanText(desc),
                author: v.author || '',
                hashtags: allHashtags,
            };
        });

        console.log(`[Scraper] Processed ${processed.length} videos`);
        return processed;
    } catch (error) {
        console.error(`[Scraper] Error:`, error.message);
        throw new Error(`Scraping failed: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { scrapeTikTokSearch };
