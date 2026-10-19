// App Store Connect API için küçük yardımcı. Kullanım:
//   node scripts/asc.js <METHOD> <path> [json-gövde]
// Gerekenler: APPLE_API_KEY_P8 (içerik), APPLE_API_KEY_ID, APPLE_API_ISSUER
const crypto = require('crypto');
const [, , method, path, body] = process.argv;
const b64u = b => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64u(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_API_KEY_ID, typ: 'JWT' }));
const claims = b64u(JSON.stringify({ iss: process.env.APPLE_API_ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: process.env.APPLE_API_KEY_P8, dsaEncoding: 'ieee-p1363' });
const token = head + '.' + claims + '.' + b64u(sig);
(async () => {
  const r = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body || undefined
  });
  const text = await r.text();
  if (!r.ok) { console.error('HTTP ' + r.status + ' ' + text.slice(0, 800)); process.exit(1); }
  process.stdout.write(text || '{}');
})();
