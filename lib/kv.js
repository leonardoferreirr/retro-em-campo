// Helper do Vercel KV (Upstash Redis) via REST API — sem dependências npm.
// Env vars (injetadas pela Vercel ao conectar o KV): KV_REST_API_URL, KV_REST_API_TOKEN.
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

export const kvReady = () => !!(URL && TOKEN);

async function cmd(args) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('KV ' + args[0] + ' -> ' + r.status + ' ' + (j.error || ''));
  return j.result;
}

// salva o pedido e indexa por data (sorted set 'orders' com score = timestamp)
export async function saveOrder(order) {
  await cmd(['SET', 'order:' + order.ref, JSON.stringify(order)]);
  await cmd(['ZADD', 'orders', String(order.ts || 0), order.ref]);
  return order;
}

export async function getOrder(ref) {
  const v = await cmd(['GET', 'order:' + ref]);
  return v ? JSON.parse(v) : null;
}

export async function updateOrder(ref, patch) {
  const cur = await getOrder(ref);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await cmd(['SET', 'order:' + ref, JSON.stringify(next)]);
  return next;
}

// pedidos mais recentes primeiro
export async function listOrders(limit = 100) {
  const refs = await cmd(['ZREVRANGE', 'orders', '0', String(limit - 1)]);
  if (!refs || !refs.length) return [];
  const vals = await cmd(['MGET', ...refs.map(r => 'order:' + r)]);
  return (vals || []).filter(Boolean).map(v => JSON.parse(v));
}

// rate limit simples por janela fixa (INCR + EXPIRE). Falha aberto: se o KV cair,
// não derruba o checkout — só não limita naquele instante.
export async function rateLimit(key, limit, windowSec) {
  if (!kvReady()) return { ok: true };
  try {
    const n = await cmd(['INCR', key]);
    if (n === 1) await cmd(['EXPIRE', key, String(windowSec)]);
    return { ok: n <= limit, count: n };
  } catch { return { ok: true }; }
}

// primeiro IP do x-forwarded-for (Vercel)
export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
