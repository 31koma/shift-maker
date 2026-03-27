const crypto = require('crypto');
const LOCAL_TEST_PASSWORD = '33';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''), 'utf8');
  const bBuf = Buffer.from(String(b || ''), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
    return;
  }

  const host = String(req.headers.host || '');
  const hostname = host.split(':')[0];
  const appPassword = LOCAL_HOSTNAMES.has(hostname)
    ? LOCAL_TEST_PASSWORD
    : process.env.APP_PASSWORD;

  if (!appPassword) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'APP_PASSWORD is not configured' }));
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      const raw = typeof body === 'string' ? body : await readRawBody(req);
      body = raw ? JSON.parse(raw) : {};
    }

    const inputPassword = body && typeof body.password === 'string' ? body.password.trim() : '';
    const matched = safeEqual(inputPassword, appPassword);

    res.statusCode = matched ? 200 : 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: matched }));
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'Invalid request body' }));
  }
};
