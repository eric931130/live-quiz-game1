const apiUrl = process.env.SMOKE_API_URL || 'https://live-quiz-game1.onrender.com';

async function check(path, label) {
  const response = await fetch(new URL(path, apiUrl).toString(), {
    headers: {
      'x-user-id': 'smoke-health-teacher',
      'x-user-email': 'smoke-health@example.test',
      'x-user-name': 'Smoke Health',
      'x-user-role': 'teacher',
      'x-school-id': 'smoke-school'
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} returned ${response.status}: ${body.slice(0, 200)}`);
  }
  return response;
}

try {
  const healthResponse = await check('/api/health', 'API health');
  const health = await healthResponse.json();
  if (!health.ok) throw new Error('API health did not return ok=true.');

  const templateResponse = await check('/api/question-banks/template', 'Question bank template');
  const contentType = templateResponse.headers.get('content-type') || '';
  if (!contentType.includes('spreadsheetml')) {
    throw new Error(`Template returned unexpected content type: ${contentType}`);
  }
  const bytes = (await templateResponse.arrayBuffer()).byteLength;
  if (bytes < 1000) throw new Error(`Template response was unexpectedly small: ${bytes} bytes`);

  console.log(`Backend health OK: ${apiUrl}`);
  console.log(`Question bank template OK: ${bytes} bytes (${contentType})`);
} catch (error) {
  console.error(`Backend smoke failed for ${apiUrl}`);
  console.error(error.message);
  process.exitCode = 1;
}
