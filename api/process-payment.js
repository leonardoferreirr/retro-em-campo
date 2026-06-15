// Vercel serverless function — processa o pagamento de CARTÃO do Payment Brick (embedado).
// Recebe o token do cartão e cria o pagamento na API do Mercado Pago. (PIX é o create-pix.js.)
// Env var: MP_ACCESS_TOKEN.
import { priceOrder, orderMetadata } from '../lib/pricing.js';
import { rateLimit, clientIp } from '../lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' });

  try {
    const rl = await rateLimit(`rl:pay:${clientIp(req)}`, 20, 60);
    if (!rl.ok) return res.status(429).json({ error: 'muitas tentativas, aguarde um minuto' });

    const { formData = {}, customer = {}, items = [], ref: clientRef } = req.body || {};
    const digits = s => String(s || '').replace(/\D/g, '');

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers['host']}`;

    // preço autoritativo no servidor (bloqueia adulteração de valor)
    let safeItems, amount;
    try { ({ safeItems, amount } = await priceOrder(base, items)); }
    catch (e) { return res.status(e.code || 400).json({ error: e.msg || 'erro no pedido' }); }

    // se o navegador alegou um total menor que o real, é adulteração — recusa
    const claimed = Number(formData.transaction_amount);
    if (claimed && claimed + 0.5 < amount) return res.status(400).json({ error: 'valor divergente, recarregue a página' });
    // número do pedido: vem do cliente (estável entre tentativas) ou é gerado aqui
    const ref = (typeof clientRef === 'string' && /^REC-\d+$/.test(clientRef)) ? clientRef : ('REC-' + Date.now());
    const name = String(customer.recipient || '').trim().split(/\s+/);

    const body = {
      transaction_amount: amount,
      token: formData.token,
      description: (safeItems.map(i => i.player).join(', ') || 'Retrô em Campo').slice(0, 200),
      installments: Number(formData.installments) || 1,
      payment_method_id: formData.payment_method_id,
      issuer_id: formData.issuer_id,
      external_reference: ref,
      notification_url: `${base}/api/mp-webhook`,
      metadata: orderMetadata(base, customer, safeItems),
      payer: {
        email: (formData.payer && formData.payer.email) || customer.email,
        first_name: name[0] || undefined,
        last_name: name.slice(1).join(' ') || undefined,
        identification: (formData.payer && formData.payer.identification) ||
          (customer.cpf ? { type: 'CPF', number: digits(customer.cpf) } : undefined)
      },
      additional_info: {
        items: safeItems.map(i => ({
          title: `${i.player} ${i.sub || ''}`.trim().slice(0, 250),
          quantity: i.qty,
          unit_price: i.price
        })),
        shipments: {
          receiver_address: {
            zip_code: digits(customer.cep),
            state_name: customer.state,
            city_name: customer.city,
            street_name: customer.address
          }
        }
      }
    };

    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        // única por tentativa: cartão recusado + retry (ou PIX) não reusa a resposta antiga
        'X-Idempotency-Key': `${ref}-${Date.now()}`
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.message || 'erro no pagamento', cause: data.cause });

    return res.status(200).json({
      id: data.id,
      ref,
      status: data.status,
      status_detail: data.status_detail
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
