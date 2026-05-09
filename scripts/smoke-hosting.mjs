const hostingUrl = process.env.SMOKE_HOSTING_URL || 'https://teach999-53c2d.web.app';
const apiUrl = process.env.SMOKE_API_URL || '';

async function checkHosting() {
  const response = await fetch(hostingUrl);
  if (!response.ok) throw new Error(`Hosting returned ${response.status}`);
  const html = await response.text();
  const match = html.match(/src="([^"]+\.js)"/);
  if (!match) throw new Error('No module script was found in hosted index.html.');

  const scriptUrl = new URL(match[1], hostingUrl).toString();
  const scriptResponse = await fetch(scriptUrl);
  const contentType = scriptResponse.headers.get('content-type') || '';
  if (!scriptResponse.ok) throw new Error(`Main script returned ${scriptResponse.status}`);
  if (!contentType.includes('javascript')) {
    throw new Error(`Main script returned unexpected MIME type: ${contentType}`);
  }

  console.log(`Hosting OK: ${hostingUrl}`);
  console.log(`Main script OK: ${scriptUrl} (${contentType})`);
}

async function checkApiHealth() {
  if (!apiUrl) return;
  const response = await fetch(new URL('/api/health', apiUrl).toString());
  if (!response.ok) throw new Error(`API health returned ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error('API health did not return ok=true.');
  console.log(`API health OK: ${apiUrl}`);
}

await checkHosting();
await checkApiHealth();
