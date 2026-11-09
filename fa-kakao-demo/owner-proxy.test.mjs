import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDemoServer } from './server.mjs';

test('owner bridge authenticates, restricts routes/origin, forwards exact requests and never caches private screens', async t => {
  const calls = [];
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    calls.push({ path: req.url, auth: req.headers.authorization, identity: req.headers['x-owner'], body: Buffer.concat(chunks).toString() });
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const app = createDemoServer({ MOLLA_OWNER_API_URL: `http://127.0.0.1:${upstream.address().port}` });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  t.after(() => { app.closeAllConnections(); app.close(); upstream.closeAllConnections(); upstream.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, headers = { Authorization: `Bearer ${'x'.repeat(43)}` };
  assert.equal((await fetch(base + '/api/owner/state')).status, 401);
  assert.equal((await fetch(base + '/api/owner/state', { headers: { ...headers, Origin: 'http://evil.invalid' } })).status, 403);
  assert.equal((await fetch(base + '/api/owner/shell', { headers })).status, 404);
  assert.equal(calls.length, 0);
  const screen = await fetch(base + '/api/owner/phone/screen', { headers });
  assert.equal(screen.status, 200); assert.equal(screen.headers.get('cache-control'), 'no-store');
  const body = JSON.stringify({ id: 'task', decision: 'cancel' });
  await fetch(base + '/api/owner/task/decision', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Owner': 'dad' }, body });
  assert.deepEqual(calls.at(-1), { path: '/api/task/decision', auth: headers.Authorization, identity: undefined, body });
  const oversized = await fetch(base + '/api/owner/chat', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: 'x'.repeat(25000) });
  assert.equal(oversized.status, 413); assert.equal(calls.length, 2);
});
