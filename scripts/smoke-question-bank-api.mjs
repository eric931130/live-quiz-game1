import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ExcelJS = require('../backend/node_modules/exceljs');

const port = Number(process.env.SMOKE_API_PORT || 3099);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(path.join(tmpdir(), 'question-bank-smoke-'));
const storePath = path.join(tempDir, 'question_banks_store.json');

const teacherHeaders = {
  'x-user-id': 'smoke-teacher-owner',
  'x-user-email': 'owner@example.test',
  'x-user-name': 'Smoke Teacher',
  'x-user-role': 'teacher',
  'x-school-id': 'smoke-school'
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return response;
}

async function waitForHealth(deadlineMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const response = await request('/api/health');
      if (response.ok) return parseJson(response);
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Backend did not become healthy in time.');
}

async function makeWorkbookBlob() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.addRow([
    'type',
    'question',
    'optionA',
    'optionB',
    'optionC',
    'optionD',
    'answer',
    'difficulty',
    'chapter',
    'section',
    'tags',
    'explanation'
  ]);
  sheet.addRow([
    'multiple_choice',
    'What is 2 + 2?',
    '3',
    '4',
    '5',
    '6',
    'B',
    'easy',
    'Arithmetic',
    'Addition',
    'math,smoke',
    '2 + 2 equals 4.'
  ]);
  sheet.addRow([
    'true_false',
    'The platform should validate permissions on the server.',
    'O',
    'X',
    '',
    '',
    'A',
    'medium',
    'Security',
    'Authorization',
    'security,permissions',
    'Front-end controls are not a security boundary.'
  ]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

const child = spawn(process.execPath, ['backend/index.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    PORT: String(port),
    QUESTION_BANK_STORE_PATH: storePath,
    REQUIRE_FIREBASE_AUTH: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const health = await waitForHealth();
  assert(health.ok === true, 'Health check did not return ok.');

  const templateResponse = await request('/api/question-banks/template', {
    headers: teacherHeaders
  });
  assert(templateResponse.ok, 'Template download failed.');
  assert(
    (templateResponse.headers.get('content-type') || '').includes('spreadsheetml'),
    'Template response did not use Excel content type.'
  );
  assert((await templateResponse.arrayBuffer()).byteLength > 1000, 'Template file was unexpectedly small.');

  const form = new FormData();
  form.append('file', await makeWorkbookBlob(), 'smoke-question-bank.xlsx');
  form.append('defaults', JSON.stringify({ course: 'Smoke Course', legalAcknowledged: true }));
  const previewResponse = await request('/api/question-banks/import/preview', {
    method: 'POST',
    headers: teacherHeaders,
    body: form
  });
  assert(previewResponse.ok, `Preview failed with ${previewResponse.status}.`);
  const preview = await parseJson(previewResponse);
  assert(preview.summary.totalRows === 2, 'Preview total row count mismatch.');
  assert(preview.summary.validQuestions === 2, 'Preview valid question count mismatch.');

  const createResponse = await request('/api/question-banks/import/commit', {
    method: 'POST',
    headers: { ...teacherHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      metadata: {
        title: `Smoke API Bank ${Date.now()}`,
        subject: 'Math',
        course: 'Smoke Course',
        visibility: 'private'
      },
      rows: preview.rows,
      legalAcknowledged: true
    })
  });
  assert(createResponse.ok, `Import commit failed with ${createResponse.status}.`);
  const bank = await parseJson(createResponse);
  assert(bank.id, 'Committed bank did not include an id.');
  assert(bank.questions?.length === 2, 'Committed bank question count mismatch.');

  const unauthorizedEdit = await request(`/api/question-banks/${bank.id}`, {
    method: 'PATCH',
    headers: {
      ...teacherHeaders,
      'x-user-id': 'smoke-teacher-other',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ title: 'Should Not Edit' })
  });
  assert(unauthorizedEdit.status === 403, 'Non-owner edit should be rejected.');

  const exportResponse = await request(`/api/question-banks/${bank.id}/export`, {
    method: 'POST',
    headers: teacherHeaders
  });
  assert(exportResponse.ok, `Export failed with ${exportResponse.status}.`);
  assert(
    (exportResponse.headers.get('content-type') || '').includes('spreadsheetml'),
    'Export response did not use Excel content type.'
  );
  assert((await exportResponse.arrayBuffer()).byteLength > 1000, 'Export file was unexpectedly small.');

  const listResponse = await request('/api/question-banks', { headers: teacherHeaders });
  assert(listResponse.ok, 'Question bank list failed.');
  const list = await parseJson(listResponse);
  assert(Array.isArray(list) && list.some((item) => item.id === bank.id), 'Created bank was not visible to owner.');

  console.log(`Question bank API smoke OK: ${baseUrl}`);
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(tempDir, { recursive: true, force: true });
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}
