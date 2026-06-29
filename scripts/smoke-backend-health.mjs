const apiUrl = process.env.SMOKE_API_URL || 'https://live-quiz-game1.onrender.com';

async function check(path, label) {
  const response = await fetch(new URL(path, apiUrl).toString());
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

  const announcementsResponse = await check('/api/announcements', 'Public announcements');
  const announcements = await announcementsResponse.json();
  if (!Array.isArray(announcements)) {
    throw new Error('Public announcements did not return an array.');
  }

  const protectedResponse = await fetch(new URL('/api/question-banks', apiUrl).toString());
  if (![200, 401].includes(protectedResponse.status)) {
    const body = await protectedResponse.text();
    throw new Error(`Protected question bank endpoint returned unexpected ${protectedResponse.status}: ${body.slice(0, 200)}`);
  }

  console.log(`Backend health OK: ${apiUrl}`);
  console.log(`Public announcements OK: ${announcements.length} active`);
  console.log(`Protected question bank endpoint OK: ${protectedResponse.status}`);
} catch (error) {
  console.error(`Backend smoke failed for ${apiUrl}`);
  console.error(error.message);
  process.exitCode = 1;
}
