import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const frontendUrl = 'http://127.0.0.1:5177';
const apiUrl = 'http://127.0.0.1:3001';
const tempDir = await mkdtemp(path.join(tmpdir(), 'teacher-ui-smoke-'));
const storePath = path.join(tempDir, 'question_banks_store.json');
const viteCli = path.resolve('frontend/node_modules/vite/bin/vite.js');
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) {
  console.error('Teacher UI smoke failed: Chrome or Edge executable was not found.');
  process.exit(1);
}

function cleanEnv(overrides = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key, value]) => key && !key.startsWith('=') && value !== undefined)
    ),
    ...overrides
  };
}

function spawnService(command, args, options) {
  console.log(`Starting ${args.join(' ')}`);
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.output = '';
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    child.output += text;
    if (/error|failed|exception/i.test(text)) process.stderr.write(text);
  });
  child.stdout.on('data', (chunk) => {
    child.output += chunk.toString();
  });
  child.on('error', (error) => {
    child.output += `${error.message}\n`;
  });
  return child;
}

function probeStatus(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode || 0));
    });
    request.setTimeout(1200, () => {
      request.destroy(new Error('probe timeout'));
    });
    request.on('error', reject);
  });
}

async function waitFor(url, label, service, deadlineMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    if (service?.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready.\n${service.output || ''}`);
    }
    try {
      const status = await probeStatus(url);
      if (status >= 200 && status < 400) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not become ready in time: ${url}`);
}

const backend = spawnService(process.execPath, ['backend/index.js'], {
  cwd: path.resolve('.'),
  env: cleanEnv({
    PORT: '3001',
    QUESTION_BANK_STORE_PATH: storePath,
    REQUIRE_FIREBASE_AUTH: 'false'
  })
});

const frontend = spawnService(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5177', '--strictPort'], {
  cwd: path.resolve('frontend'),
  env: cleanEnv({
    VITE_E2E_TEACHER_ACCESS: 'true'
  })
});

let browser;
try {
  await waitFor(`${apiUrl}/api/health`, 'Backend', backend);
  await waitFor(frontendUrl, 'Frontend', frontend);

  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('dialog', (dialog) => dialog.dismiss());

  await page.goto(frontendUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.locator('.question-bank-dashboard').waitFor({ state: 'visible', timeout: 20000 });

  const dashboardVisible = await page.locator('.teacher-card').isVisible();
  if (!dashboardVisible) throw new Error('Teacher dashboard was not visible.');

  const viewButtons = page.locator('.qb-view-switch button');
  if (await viewButtons.count() < 2) throw new Error('Question bank view switch was not rendered.');
  await viewButtons.nth(1).click();
  await page.locator('.qb-wizard-stepper').waitFor({ state: 'visible', timeout: 10000 });

  const templateHref = await page.locator('.template-download').getAttribute('href');
  if (!templateHref?.includes('localhost:3001/api/question-banks/template')) {
    throw new Error(`Template link did not target the local backend: ${templateHref}`);
  }

  const createModeButtons = page.locator('.creation-mode-grid button');
  if (await createModeButtons.count() < 4) throw new Error('Creation mode buttons were not rendered.');
  await createModeButtons.nth(1).click();

  await page.locator('.manual-editor textarea').fill('What is the safest place to enforce question bank permissions?');
  const manualInputs = page.locator('.manual-editor input');
  await manualInputs.nth(0).fill('Only in the browser');
  await manualInputs.nth(1).fill('On the server');
  await manualInputs.nth(2).fill('In a CSS class');
  await manualInputs.nth(3).fill('In localStorage');
  await manualInputs.nth(4).fill('B');
  await manualInputs.nth(5).fill('Server-side authorization');
  await manualInputs.nth(6).fill('Understand SaaS permission models');
  await manualInputs.nth(7).fill('45');
  await manualInputs.nth(8).fill('Permissions must be verified by backend APIs.');
  await manualInputs.nth(9).fill('E2E smoke test generated content.');

  await page.locator('.manual-editor button.primary-btn').click();
  await page.locator('.import-preview-table').waitFor({ state: 'visible', timeout: 15000 });

  const previewNext = page.locator('.wizard-stage .qb-inline-actions button.primary-btn');
  if (!(await previewNext.isEnabled())) throw new Error('Preview next button was disabled.');
  await previewNext.click();

  await page.locator('.qb-metadata-grid').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.qb-metadata-grid input').nth(0).fill(`Teacher UI Smoke ${Date.now()}`);
  await page.locator('.qb-metadata-grid input').nth(1).fill('Platform Safety');
  await page.locator('.qb-metadata-grid input').nth(3).fill('Question Bank Governance');
  const metadataNext = page.locator('.wizard-stage .qb-inline-actions button.primary-btn');
  if (!(await metadataNext.isEnabled())) throw new Error('Metadata next button was disabled.');
  await metadataNext.click();

  await page.locator('.wizard-stage > .rights-notice-box').waitFor({ state: 'visible', timeout: 10000 });
  const commitButton = page.locator('.wizard-stage .qb-inline-actions button.primary-btn');
  if (await commitButton.isEnabled()) throw new Error('Commit button should be disabled before rights acknowledgement.');
  await page.locator('.ack-checkbox input[type="checkbox"]').check();
  if (!(await commitButton.isEnabled())) throw new Error('Commit button was not enabled after rights acknowledgement.');
  await commitButton.click();

  await page.locator('.next-actions').waitFor({ state: 'visible', timeout: 20000 });

  const fatalConsoleErrors = consoleErrors.filter((message) => (
    !message.includes('Failed to load resource') &&
    !message.includes('permission-denied')
  ));
  if (fatalConsoleErrors.length) {
    throw new Error(`Console errors: ${fatalConsoleErrors.slice(0, 5).join(' | ')}`);
  }

  console.log(`Teacher UI local smoke OK: ${frontendUrl}`);
  console.log('Verified dashboard render, upload wizard, manual preview, rights acknowledgement, and commit.');
} catch (error) {
  console.error('Teacher UI local smoke failed');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  frontend.kill();
  backend.kill();
  await Promise.allSettled([
    new Promise((resolve) => frontend.once('exit', resolve)),
    new Promise((resolve) => backend.once('exit', resolve))
  ]);
  await rm(tempDir, { recursive: true, force: true });
}
