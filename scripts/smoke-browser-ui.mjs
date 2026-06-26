import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const hostingUrl = process.env.SMOKE_HOSTING_URL || 'https://empath-os.web.app';
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) {
  console.error('Browser smoke failed: Chrome or Edge executable was not found.');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath,
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  const failedRequests = [];
  const badScriptResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/assets/') || !url.endsWith('.js')) return;
    const contentType = response.headers()['content-type'] || '';
    if (!response.ok() || !contentType.includes('javascript')) {
      badScriptResponses.push(`${response.status()} ${url} (${contentType})`);
    }
  });

  await page.goto(hostingUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.locator('.saas-page-shell').waitFor({ state: 'visible', timeout: 15000 });

  const navLoginButtons = await page.locator('.saas-nav .saas-btn-solid').count();
  if (navLoginButtons !== 1) throw new Error(`Expected one nav login button, found ${navLoginButtons}.`);

  await page.locator('.saas-nav .saas-btn-solid').click();
  await page.locator('.modal-overlay').waitFor({ state: 'visible', timeout: 10000 });

  const emailInputs = await page.locator('.modal-overlay input[type="email"]').count();
  const passwordInputs = await page.locator('.modal-overlay input[type="password"]').count();
  if (emailInputs !== 1 || passwordInputs !== 1) {
    throw new Error(`Auth modal did not expose expected inputs. email=${emailInputs}, password=${passwordInputs}`);
  }

  const fatalConsoleErrors = consoleErrors.filter((message) => (
    !message.includes('Failed to load resource: the server responded with a status of 404') &&
    !message.includes('favicon')
  ));
  if (badScriptResponses.length) throw new Error(`Bad script responses: ${badScriptResponses.join(' | ')}`);
  if (failedRequests.some((message) => message.includes('/assets/'))) {
    throw new Error(`Asset request failures: ${failedRequests.join(' | ')}`);
  }
  if (fatalConsoleErrors.length) {
    throw new Error(`Console errors: ${fatalConsoleErrors.slice(0, 5).join(' | ')}`);
  }

  console.log(`Browser UI smoke OK: ${hostingUrl}`);
  console.log('Member/teacher access button opens the authentication modal.');
} catch (error) {
  console.error(`Browser UI smoke failed for ${hostingUrl}`);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
