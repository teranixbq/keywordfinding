const { chromium } = require('playwright');
const fs = require('fs');
const config = require('../config');
const { delay } = require('../utils/helpers');

// ─── Platform URL Map ─────────────────────────────────────
const PLATFORM_URLS = {
    google: 'https://keywordtool.io/google',
    youtube: 'https://keywordtool.io/youtube',
    instagram: 'https://keywordtool.io/instagram',
    tiktok: 'https://keywordtool.io/tiktok',
    'google-trends': 'https://keywordtool.io/google-trends',
};

// ─── Tab Mapping ──────────────────────────────────────────
const TAB_MAP = {
    suggestions: 'Keyword Suggestions',
    questions: 'Questions',
    prepositions: 'Prepositions',
    related: 'Related Keywords',
};

// ─── Cookie Management ────────────────────────────────────
function loadCookies(cookieFile) {
    try {
        if (fs.existsSync(cookieFile)) {
            const data = fs.readFileSync(cookieFile, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.log('[KT] Failed to load cookies:', err.message);
    }
    return null;
}

function saveCookies(cookieFile, cookies, userAgent) {
    try {
        const data = { cookies, userAgent };
        fs.writeFileSync(cookieFile, JSON.stringify(data, null, 2));
        console.log('[KT] Cookies & User-Agent saved');
    } catch (err) {
        console.log('[KT] Failed to save cookies:', err.message);
    }
}

function deleteCookies(cookieFile) {
    try {
        if (fs.existsSync(cookieFile)) {
            fs.unlinkSync(cookieFile);
            console.log('[KT] Cookies deleted:', cookieFile);
        }
    } catch { }
}

// ─── Login Flow ───────────────────────────────────────────
async function loginIfNeeded(context, page, account) {
    // Check if "Login" link is visible in the header (top right)
    // The user pointed out "Secondary Menu > Auto-login" might show "Account" text in footer/body even if not logged in.
    // So we trust the "Login" link visibility more.
    const loginLink = page.locator('a[href="/user/login"]').first();
    const isLoginVisible = await loginLink.isVisible().catch(() => false);

    if (!isLoginVisible) {
        // Double check if we are truly logged in by looking for user menu or dashboard
        const userMenu = page.locator('.user-account, .avatar, text=My Account').first();
        const isUserMenuVisible = await userMenu.isVisible({ timeout: 2000 }).catch(() => false);

        if (isUserMenuVisible) {
            console.log(`[KT] Already logged in as ${account.email} (cookies valid)`);
            return true;
        }
    }

    console.log(`[KT] Not logged in (Login link visible or User menu missing), logging in as ${account.email}...`);

    // Go to login page if not already there
    if (!page.url().includes('/user/login')) {
        await page.goto('https://keywordtool.io/user/login', { waitUntil: 'domcontentloaded' });
        await delay(1000, 2000);
    }

    try {
        await page.fill('input#email', account.email);
        await delay(500, 1000);
        await page.fill('input#password', account.password);
        await delay(800, 1500);

        const loginBtn = page.locator('button[type="submit"]');
        await loginBtn.click();
        console.log('[KT] Login form submitted');
    } catch (fillError) {
        const safeEmail = account.email.replace(/[^a-zA-Z0-9]/g, '_');
        const debugPath = require('path').join(__dirname, `../../debug-login-failed-${safeEmail}.png`);
        await page.screenshot({ path: debugPath, fullPage: true });
        console.log(`[KT] Login fill failed. Screenshot saved to ${debugPath}`);
        throw fillError;
    }

    // Wait for redirect
    let redirected = false;
    try {
        await page.waitForURL((url) => !url.toString().includes('/user/login'), {
            timeout: 15000,
        });
        redirected = true;
    } catch {
        redirected = false;
    }

    await delay(2000, 3000);

    // Detect OTP / verification / captcha
    const currentUrl = page.url();
    const bodyText = await page.textContent('body').catch(() => '');
    const bodyLower = bodyText.toLowerCase();

    if (
        currentUrl.includes('/otp') ||
        currentUrl.includes('/verify') ||
        currentUrl.includes('/captcha') ||
        currentUrl.includes('/two-factor') ||
        bodyLower.includes('one-time password') ||
        bodyLower.includes('otp') ||
        bodyLower.includes('verification code') ||
        bodyLower.includes('verify your') ||
        bodyLower.includes('too many') ||
        bodyLower.includes('rate limit') ||
        bodyLower.includes('captcha')
    ) {
        throw new Error(`OTP/verifikasi diperlukan untuk ${account.email}`);
    }

    // If still on login page
    if (!redirected || currentUrl.includes('/user/login')) {
        const errorMsg = await page.locator('.alert-danger, .alert-error, .text-error, .text-red-500')
            .first()
            .textContent({ timeout: 3000 })
            .catch(() => '');

        const errDetail = errorMsg ? `: ${errorMsg.trim()}` : '';
        throw new Error(`Login gagal untuk ${account.email}${errDetail}`);
    }

    // Save cookies with User-Agent
    const cookies = await context.cookies();
    const currentUserAgent = await page.evaluate(() => navigator.userAgent);
    saveCookies(account.cookieFile, cookies, currentUserAgent);

    console.log(`[KT] Login berhasil: ${account.email}`);
    return true;
}

// ─── Set Language to Indonesian ───────────────────────────
async function setLanguageIndonesian(page) {
    try {
        const langWrapper = page.locator('.ts-wrapper').last();
        const tsControl = langWrapper.locator('.ts-control');
        const selectedLang = await tsControl.textContent({ timeout: 3000 });

        console.log(`[KT] Current language: "${selectedLang.trim()}"`);

        if (selectedLang && selectedLang.trim().startsWith('Indonesian')) {
            console.log('[KT] Language already Indonesian');
            return;
        }

        console.log('[KT] Setting language to Indonesian...');
        await tsControl.click();
        await delay(600, 1000);

        const tsInput = langWrapper.locator('input.dropdown-input');
        await tsInput.fill('Indonesian');
        await delay(800, 1200);

        const option = page.locator('.ts-dropdown .option').filter({ hasText: 'Indonesian' }).first();
        const optVisible = await option.isVisible({ timeout: 3000 }).catch(() => false);

        if (optVisible) {
            await option.click();
            await delay(500, 800);
            console.log('[KT] Language set to Indonesian');
        } else {
            await page.keyboard.press('Enter');
            await delay(500, 800);
            console.log('[KT] Language set via Enter');
        }
    } catch (err) {
        console.log('[KT] Language error, trying keyboard:', err.message);
        try {
            await page.keyboard.type('Indonesian');
            await delay(1000, 1500);
            await page.keyboard.press('Enter');
            await delay(500, 800);
        } catch { }
    }
}

// ─── Extract Keywords from Results Table ──────────────────
async function extractKeywords(page) {
    let tableFound = false;
    for (let attempt = 0; attempt < 3; attempt++) {
        const count = await page.locator('table tbody tr').count().catch(() => 0);
        if (count > 0) {
            tableFound = true;
            console.log(`[KT] Table found: ${count} rows (attempt ${attempt + 1})`);
            break;
        }
        console.log(`[KT] Table not found (attempt ${attempt + 1}/3), waiting...`);
        await delay(5000, 8000);
    }

    if (!tableFound) {
        console.log('[KT] No table rows found');
        return [];
    }

    await delay(1500, 2500);

    const keywords = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        const results = [];

        rows.forEach((row, index) => {
            if (row.querySelector('td[colspan]')) return;

            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;

            const keywordEl = cells[1];
            const keyword = keywordEl ? keywordEl.textContent.trim() : '';

            // Improved blur detection
            // Check for 'blur' class in classList or innerHTML
            const volCell = cells[2];
            const trendCell = cells.length > 3 ? cells[3] : null;

            const isVolumeBlurred = volCell && (
                volCell.classList.contains('blur') ||
                volCell.innerHTML.includes('blur') ||
                volCell.querySelector('.blur') !== null
            );

            const isTrendBlurred = trendCell && (
                trendCell.classList.contains('blur') ||
                trendCell.innerHTML.includes('blur') ||
                trendCell.querySelector('.blur') !== null
            );



            let volumeText = volCell ? volCell.textContent.trim() : '-';
            if (isVolumeBlurred) volumeText = '-';

            let trendText = trendCell ? trendCell.textContent.trim() : '-';
            if (isTrendBlurred) trendText = '-';

            if (keyword) {
                let searchVolume = 0;
                if (volumeText !== '-') {
                    const cleanVolume = volumeText.replace(/,/g, '').replace(/\s/g, '');
                    if (cleanVolume !== '' && !isNaN(parseInt(cleanVolume, 10))) {
                        searchVolume = parseInt(cleanVolume, 10);
                    }
                }

                results.push({
                    keyword,
                    searchVolume,
                    searchVolumeFormatted: volumeText,
                    trend: trendText || '-',
                    isDataAvailable: !isVolumeBlurred,
                });
            }
        });

        return results;
    });

    return keywords;
}

// ─── Try Scraping with One Account ────────────────────────
async function tryWithAccount(account, keyword, options) {
    const {
        platform = 'google',
        tab = 'suggestions',
        minVolume = 0,
        maxVolume = Infinity,
    } = options;

    const platformUrl = PLATFORM_URLS[platform];
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

        const contextOptions = {
            userAgent,
            viewport: { width: 1280, height: 720 },
            locale: 'id-ID',
            extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
        };

        // Load cookies for this account
        // Load cookies for this account
        const savedData = loadCookies(account.cookieFile);
        if (savedData && savedData.cookies) {
            contextOptions.storageState = { cookies: savedData.cookies, origins: [] };

            // USE THE SAVED USER AGENT if available
            if (savedData.userAgent) {
                contextOptions.userAgent = savedData.userAgent;
                console.log(`[KT] Loaded cookies & User-Agent for ${account.email}`);
            } else {
                console.log(`[KT] Loaded cookies (legacy) for ${account.email}`);
            }
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        // Stealth
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            window.chrome = { runtime: {} };
        });

        // Navigate to platform
        console.log(`[KT] Navigating to ${platformUrl}`);
        await page.goto(platformUrl, {
            waitUntil: 'domcontentloaded',
            timeout: config.requestTimeout,
        });
        await delay(2000, 3000);

        // Login
        // Login (Try-Catch to allow Guest fallback)
        try {
            await loginIfNeeded(context, page, account);
        } catch (loginErr) {
            console.log(`[KT] Login failed/skipped: ${loginErr.message}`);
            console.log('[KT] Proceeding as Guest (data might be blurred)...');
        }

        // Navigate again if redirected
        const currentUrl = page.url();
        if (!currentUrl.includes(platform === 'google-trends' ? 'google-trends' : `/${platform}`)) {
            await page.goto(platformUrl, {
                waitUntil: 'domcontentloaded',
                timeout: config.requestTimeout,
            });
            await delay(2000, 3000);
        }

        // Set language
        await setLanguageIndonesian(page);

        // Search
        console.log(`[KT] Searching: "${keyword}" on ${platform}`);
        const keywordInput = page.locator('input[id*="keyword"]').first();
        await keywordInput.click();
        await keywordInput.fill('');
        await delay(300, 500);
        await keywordInput.fill(keyword);
        await delay(500, 800);

        const searchBtn = page.locator('form button.btn.btn-primary, button.btn.btn-primary').first();
        await searchBtn.click();
        console.log('[KT] Search submitted...');

        // Wait for results
        try {
            await page.waitForURL((url) => url.toString().includes('/search/'), { timeout: 60000 });
            console.log('[KT] Results page loaded');
        } catch {
            console.log('[KT] URL wait timed out');
        }

        await delay(8000, 12000);

        // Switch tab
        if (tab && tab !== 'suggestions') {
            const tabLabel = TAB_MAP[tab];
            if (tabLabel) {
                try {
                    const tabEl = page.locator('a.nav-link').filter({ hasText: tabLabel }).first();
                    await tabEl.click();
                    console.log(`[KT] Tab: ${tabLabel}`);
                    await delay(3000, 5000);
                } catch (err) {
                    console.log(`[KT] Tab switch failed: ${err.message}`);
                }
            }
        }

        // Extract stats
        let totalSearchVolume = 0;
        let averageTrend = '-';
        try {
            const statsText = await page.evaluate(() => {
                const stats = {};
                const body = document.body.textContent;
                const volMatch = body.match(/Total Search Volume[^0-9]*(\d[\d,]*)/);
                if (volMatch) stats.totalSearchVolume = parseInt(volMatch[1].replace(/,/g, ''), 10);
                const trendMatch = body.match(/Average Trend[^+-]*([+-][\d,.]+%)/);
                if (trendMatch) stats.averageTrend = trendMatch[1];
                return stats;
            });
            totalSearchVolume = statsText.totalSearchVolume || 0;
            averageTrend = statsText.averageTrend || '-';
        } catch { }

        // Extract keywords
        const allKeywords = await extractKeywords(page);
        console.log(`[KT] Extracted ${allKeywords.length} keywords`);

        // Check if data is Pro (not all blurred)
        if (allKeywords.length > 0) {
            const hasAnyRealData = allKeywords.some((kw) => kw.isDataAvailable);
            if (!hasAnyRealData) {
                console.log(`[KT] Warning: Data is blurred (Guest/Free tier). Proceeding anyway.`);
                // We DO NOT throw error anymore, as requested by user.
                // We return what we have (keywords without volume).
            } else {
                // Success! Save cookies if we got real data
                const cookies = await context.cookies();
                // Save cookies with User-Agent
                const currentUserAgent = await page.evaluate(() => navigator.userAgent);
                saveCookies(account.cookieFile, cookies, currentUserAgent);
            }
        }

        // Apply volume filters
        const filtered = allKeywords.filter((kw) => {
            return kw.searchVolume >= minVolume && kw.searchVolume <= maxVolume;
        });

        console.log(`[KT] Volume filter (${minVolume}-${maxVolume}): ${filtered.length} keywords`);

        return {
            account: account.email,
            totalKeywordsFound: allKeywords.length,
            totalSearchVolume,
            averageTrend,
            filter: {
                minVolume,
                maxVolume: maxVolume === Infinity ? 'unlimited' : maxVolume,
            },
            filteredCount: filtered.length,
            keywords: filtered,
        };
    } finally {
        if (browser) await browser.close();
    }
}

// ─── Main Scrape Function (Multi-Account Fallback) ────────
/**
 * Scrape keyword data from keywordtool.io
 * Tries each account in order. If one fails, tries the next.
 *
 * @param {string} keyword - Search keyword
 * @param {object} options
 * @param {string} options.platform - google|youtube|instagram|tiktok|google-trends
 * @param {string} options.tab - suggestions|questions|prepositions|related
 * @param {number} options.minVolume - Minimum search volume filter
 * @param {number} options.maxVolume - Maximum search volume filter
 */
async function scrapeKeywords(keyword, options = {}) {
    const { platform = 'google' } = options;

    const platformUrl = PLATFORM_URLS[platform];
    if (!platformUrl) {
        throw new Error(`Invalid platform: "${platform}". Valid: ${Object.keys(PLATFORM_URLS).join(', ')}`);
    }

    // Clone accounts array to sort it without mutating config
    const accounts = [...config.keywordToolAccounts];
    if (!accounts || accounts.length === 0) {
        throw new Error('Tidak ada akun KeywordTool.io dikonfigurasi di .env');
    }

    // Prioritize accounts with existing cookies
    accounts.sort((a, b) => {
        const aExists = fs.existsSync(a.cookieFile);
        const bExists = fs.existsSync(b.cookieFile);
        if (aExists && !bExists) return -1;
        if (!aExists && bExists) return 1;
        return 0;
    });

    const errors = [];

    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        console.log(`\n[KT] ══ Mencoba akun ${i + 1}/${accounts.length}: ${account.email} ══`);

        try {
            const result = await tryWithAccount(account, keyword, options);
            console.log(`[KT] ✅ Berhasil dengan akun: ${account.email}`);
            return result;
        } catch (err) {
            console.error(`[KT] ❌ Akun ${account.email} gagal: ${err.message}`);
            // Delete cookies for failed account
            deleteCookies(account.cookieFile);
            errors.push({ account: account.email, error: err.message });
        }
    }

    // All accounts failed
    const errorDetails = errors.map((e) => `${e.account}: ${e.error}`).join(' | ');
    throw new Error(`Semua akun gagal login. ${errorDetails}`);
}

module.exports = { scrapeKeywords, PLATFORM_URLS };
