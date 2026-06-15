// Vercel serverless function — cria um pagamento PIX e devolve o QR Code (imagem + copia-e-cola)
// pra exibir direto no site, sem o fluxo de e-mail do brick. Env var: MP_ACCESS_TOKEN.
import { priceOrder, orderMetadata } from '../lib/pricing.js';
import { rateLimit, clientIp } from '../lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' });

  try {
    const rl = await rateLimit(`rl:pix:${clientIp(req)}`, 15, 60);
    if (!rl.ok) return res.status(429).json({ error: 'muitas tentativas, aguarde um minuto' });

    const { customer = {}, items = [], ref: clientRef } = req.body || {};
    const digits = s => String(s || '').replace(/\D/g, '');
    if (!customer.email) return res.status(400).json({ error: 'e-mail obrigatório para o PIX' });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers['host']}`;

    // preço autoritativo no servidor (mesma blindagem do cartão)
    let safeItems, amount;
    try { ({ safeItems, amount } = await priceOrder(base, items)); }
    catch (e) { return res.status(e.code || 400).json({ error: e.msg || 'erro no pedido' }); }

    const ref = (typeof clientRef === 'string' && /^REC-\d+$/.test(clientRef)) ? clientRef : ('REC-' + Date.now());
    const name = String(customer.recipient || '').trim().split(/\s+/);

    const body = {
      transaction_amount: amount,
      description: (safeItems.map(i => i.player).join(', ') || 'Retrô em Campo').slice(0, 200),
      payment_method_id: 'pix',
      external_reference: ref,
      notification_url: `${base}/api/mp-webhook`,
      metadata: orderMetadata(base, customer, safeItems),
      payer: {
        email: customer.email,
        first_name: name[0] || undefined,
        last_name: name.slice(1).join(' ') || undefined,
        identification: customer.cpf ? { type: 'CPF', number: digits(customer.cpf) } : undefined
      }
    };

    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        'X-Idempotency-Key': `pix-${ref}`  // re-clicar devolve o mesmo QR, não duplica
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.message || 'erro ao gerar PIX', cause: data.cause });

    const tx = (data.point_of_interaction && data.point_of_interaction.transaction_data) || {};
    return res.status(200).json({
      id: data.id,
      ref,
      status: data.status,
      amount,
      qr_code: tx.qr_code || '',            // copia e cola
      qr_base64: tx.qr_code_base64 || '',   // imagem PNG (base64)
      ticket_url: tx.ticket_url || ''
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
