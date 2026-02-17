require('dotenv').config();
const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  headless: process.env.HEADLESS !== 'false',
  cacheTTL: parseInt(process.env.CACHE_TTL_MINUTES || '10', 10) * 60 * 1000,
  maxScrollCount: parseInt(process.env.MAX_SCROLL_COUNT || '5', 10),
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),

  // 3 akun KeywordTool.io — fallback otomatis
  keywordToolAccounts: [
    {
      email: process.env.KEYWORDTOOL_EMAIL_1 || '',
      password: process.env.KEYWORDTOOL_PASSWORD_1 || '',
      cookieFile: path.join(__dirname, 'scraper', '.kt-cookies-1.json'),
    },
    {
      email: process.env.KEYWORDTOOL_EMAIL_2 || '',
      password: process.env.KEYWORDTOOL_PASSWORD_2 || '',
      cookieFile: path.join(__dirname, 'scraper', '.kt-cookies-2.json'),
    },
    {
      email: process.env.KEYWORDTOOL_EMAIL_3 || '',
      password: process.env.KEYWORDTOOL_PASSWORD_3 || '',
      cookieFile: path.join(__dirname, 'scraper', '.kt-cookies-3.json'),
    },
  ].filter((a) => a.email && a.password),

  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:133.0) Gecko/20100101 Firefox/133.0',
  ],

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  },
};
