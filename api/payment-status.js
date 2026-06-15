// Vercel serverless function — consulta o status de um pagamento (usado pelo polling do PIX).
// Devolve só o status (sem dados sensíveis). Env var: MP_ACCESS_TOKEN.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' });

  try {
    const { id } = req.body || {};
    if (!/^\d+$/.test(String(id || ''))) return res.status(400).json({ error: 'id inválido' });
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!r.ok) return res.status(502).json({ error: 'erro ao consultar' });
    const data = await r.json();
    return res.status(200).json({ status: data.status, ref: data.external_reference || null });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
