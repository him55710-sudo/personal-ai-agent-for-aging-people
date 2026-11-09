const allowedGet = new Set(['/runtime', '/state', '/phone/screen']);
const allowedPost = new Set(['/chat', '/consent', '/ai/consent', '/preferences', '/task/decision', '/phone/quote', '/phone/start', '/phone/stop', '/phone/diagnose', '/contacts']);
export async function proxyOwner(request, response, path, origin, env) {
  const reply = (status, body) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); };
  if (request.headers.origin && request.headers.origin !== origin) return reply(403, { error: '같은 페이지에서 연결해 주세요.' });
  if (!(request.method === 'GET' ? allowedGet : request.method === 'POST' ? allowedPost : new Set()).has(path)) return reply(404, { error: '지원하지 않는 실제 실행 요청이에요.' });
  if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(request.headers.authorization || '')) return reply(401, { error: '주인의 연결 키가 필요해요.' });
  const upstream = new URL(env.MOLLA_OWNER_API_URL || 'http://127.0.0.1:4319');
  if (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(upstream.hostname) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) return reply(503, { error: '로컬 실행 서버 설정을 확인해 주세요.' });
  let body, bytes = 0; const chunks = [];
  if (request.method === 'POST') {
    if (!request.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'JSON 요청이 필요해요.' });
    for await (const chunk of request.iterator({ destroyOnReturn: false })) { bytes += chunk.length; if (bytes > 24000) { request.resume(); return reply(413, { error: '요청이 너무 커요.' }); } chunks.push(chunk); }
    body = Buffer.concat(chunks);
  }
  try {
    const res = await fetch(new URL('/api' + path, upstream), { method: request.method, redirect: 'error', signal: AbortSignal.timeout(65000), headers: { Authorization: request.headers.authorization, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(request.headers['idempotency-key'] ? { 'Idempotency-Key': request.headers['idempotency-key'] } : {}) }, body });
    const reader = res.body.getReader(); const buffers = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 6000000) { await reader.cancel(); throw Error('oversize'); } buffers.push(part.value); }
    const data = JSON.parse(Buffer.concat(buffers).toString('utf8')); return reply(res.status, data);
  } catch { return reply(502, { error: '실제 실행 서버에 연결하지 못했어요. 서버 상태를 확인해 주세요. 자동 재실행하지 않았어요.' }); }
}
