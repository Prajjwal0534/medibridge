// Native Request/Response helpers; never log credentials or user data.
export function env(name) {
  return typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name];
}

export function json(status, body, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  });
}

export async function readJson(request, maxBytes) {
  const tooLarge = () => Object.assign(new Error('Payload too large'), {status: 413});
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge();
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON'), {status: 400}); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Expected a JSON object'), {status: 400});
  }
  return body;
}

// Bounded per-instance telemetry limit; not a distributed rate limiter.
export function createRateLimiter(limit, windowMs = 600000, maxKeys = 2000) {
  const windows = new Map();
  return (ip = 'unknown') => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now - entry.startedAt >= windowMs) windows.delete(key);
    }
    const entry = windows.get(ip);
    if (entry) return ++entry.count > limit;
    if (windows.size >= maxKeys) windows.delete(windows.keys().next().value);
    windows.set(ip, {startedAt: now, count: 1});
    return false;
  };
}
