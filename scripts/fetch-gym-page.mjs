/**
 * Renders the OSiR gym page with a real browser (Playwright Chromium) and extracts
 * the schedule text. The page is a Liferay portal — content is JS-rendered so curl
 * returns an empty shell. This script runs inside GitHub Actions.
 *
 * Outputs:
 *   /tmp/gym-text.txt  — extracted page text (sent to Vercel scraper)
 *   GITHUB_OUTPUT      — http_code=<200|0>
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const GYM_URL =
  'https://sport.um.warszawa.pl/waw/osir-wola/-/hala-sportowa-kolo-obozowa-60';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();

await page.setExtraHTTPHeaders({ 'Accept-Language': 'pl-PL,pl;q=0.9' });

let httpCode = 0;

try {
  const response = await page.goto(GYM_URL, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  httpCode = response?.status() ?? 200;

  if (httpCode === 200) {
    // Extract text the same way the server-side Cheerio code does
    const text = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main?.textContent?.trim()) return main.textContent.trim();
      const article = document.querySelector('.journal-content-article, article');
      if (article?.textContent?.trim()) return article.textContent.trim();
      return document.body.textContent?.trim() ?? '';
    });

    if (!text) {
      console.error('Extracted text is empty — page may not have rendered');
      httpCode = 0;
    } else {
      console.log(`Extracted ${text.length} characters`);
      writeFileSync('/tmp/gym-text.txt', text, 'utf8');
    }
  }
} catch (err) {
  console.error('Navigation failed:', err.message);
  httpCode = 0;
} finally {
  await browser.close();
}

const output = process.env.GITHUB_OUTPUT;
if (output) {
  writeFileSync(output, `http_code=${httpCode}\n`, { flag: 'a' });
}

console.log(`http_code=${httpCode}`);
if (httpCode !== 200) process.exit(1);
