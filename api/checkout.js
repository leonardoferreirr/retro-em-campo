// Vercel serverless function — cria preferência de pagamento no Mercado Pago (Checkout Pro)
// Requer a env var MP_ACCESS_TOKEN (token de produção da conta Mercado Pago do Retrô em Campo).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' });

  try {
    const { items = [], frete = 0 } = req.body || {};
    if (!items.length) return res.status(400).json({ error: 'sacola vazia' });

    const mpItems = items.map(i => ({
      title: `${i.player} — ${i.sub} (Tam ${i.size})`.slice(0, 250),
      quantity: Number(i.qty) || 1,
      currency_id: 'BRL',
      unit_price: Number(i.price)
    }));
    if (frete > 0) {
      mpItems.push({ title: 'Frete', quantity: 1, currency_id: 'BRL', unit_price: Number(frete) });
    }

    const proto = (req.headers['x-forwarded-proto'] || 'https');
    const host = req.headers['host'];
    const base = `${proto}://${host}`;

    const pref = {
      items: mpItems,
      back_urls: {
        success: `${base}/#/suporte`,
        failure: `${base}/#/`,
        pending: `${base}/#/`
      },
      auto_return: 'approved',
      statement_descriptor: 'RETROEMCAMPO'
    };

    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(pref)
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.message || 'erro Mercado Pago' });

    return res.status(200).json({ init_point: data.init_point, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
