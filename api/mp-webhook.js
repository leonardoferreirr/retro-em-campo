// Vercel serverless function — webhook do Mercado Pago.
// Dispara e-mail com os dados de entrega quando um pagamento é aprovado.
// Env vars: MP_ACCESS_TOKEN, RESEND_API_KEY, MP_WEBHOOK_SECRET (assinatura secreta do webhook).
import crypto from 'node:crypto';

const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'Retrô em Campo <pedidos@retroemcampo.com.br>';
const STORE_EMAIL = 'retroemcampo@gmail.com'; // onde você recebe os pedidos pra enviar

const BRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// valida a assinatura x-signature do Mercado Pago (se o secret estiver configurado)
function validSignature(req) {
  if (!MP_WEBHOOK_SECRET) return true; // sem secret, não bloqueia (configure pra ativar)
  try {
    const sig = req.headers['x-signature'] || '';
    const reqId = req.headers['x-request-id'] || '';
    const parts = Object.fromEntries(sig.split(',').map(p => p.split('=').map(x => x.trim())));
    const ts = parts.ts, v1 = parts.v1;
    if (!ts || !v1) return false;
    const dataId = String(req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || '').toLowerCase();
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
    const a = Buffer.from(hmac), b = Buffer.from(v1);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

async function mpGet(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
  if (!r.ok) throw new Error('MP GET ' + url + ' -> ' + r.status);
  return r.json();
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  try {
    if (!validSignature(req)) return res.status(401).json({ error: 'invalid signature' });

    const type = req.query.type || req.query.topic || (req.body && req.body.type) || '';
    if (type !== 'payment') return res.status(200).json({ ok: true, ignored: type });

    const paymentId = req.query['data.id'] || (req.body && req.body.data && req.body.data.id);
    if (!paymentId) return res.status(200).json({ ok: true, note: 'sem id' });

    const payment = await mpGet(`https://api.mercadopago.com/v1/payments/${paymentId}`);
    if (payment.status !== 'approved') return res.status(200).json({ ok: true, status: payment.status });

    // os dados de entrega vão no metadata da preferência; recupera via merchant_order -> preference
    let customer = {}, items = [];
    try {
      const orderId = payment.order && payment.order.id;
      if (orderId) {
        const mo = await mpGet(`https://api.mercadopago.com/merchant_orders/${orderId}`);
        items = mo.items || [];
        if (mo.preference_id) {
          const pref = await mpGet(`https://api.mercadopago.com/checkout/preferences/${mo.preference_id}`);
          customer = (pref.metadata && pref.metadata.customer) || {};
          if (!items.length) items = pref.items || [];
        }
      }
    } catch { /* segue com o que tiver do payment */ }

    const ref = payment.external_reference || ('MP-' + paymentId);
    const total = payment.transaction_amount;
    const rows = items.map(i =>
      `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.title)}</td>
       <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
       <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${BRL(i.unit_price)}</td></tr>`).join('');

    const field = (label, val) => `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${label}</td><td style="padding:4px 0;font-weight:600">${esc(val) || '—'}</td></tr>`;

    // e-mail PRA VOCÊ — pedido a separar e enviar
    const adminHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#111">
        <h2 style="margin:0 0 4px">Pedido aprovado · ${esc(ref)}</h2>
        <p style="color:#666;margin:0 0 18px">Pagamento confirmado no Mercado Pago. Separe e envie.</p>
        <h3 style="margin:18px 0 6px">Itens</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows}</tbody></table>
        <p style="text-align:right;font-size:16px;font-weight:800;margin:10px 0 0">Total: ${BRL(total)}</p>
        <h3 style="margin:22px 0 6px">Dados de entrega</h3>
        <table style="font-size:14px"><tbody>
          ${field('Destinatário', customer.recipient)}
          ${field('CPF', customer.cpf)}
          ${field('Telefone', customer.phone)}
          ${field('E-mail', customer.email)}
          ${field('CEP', customer.cep)}
          ${field('Estado', customer.state)}
          ${field('Cidade', customer.city)}
          ${field('Endereço', customer.address)}
        </tbody></table>
      </div>`;
    await sendEmail(STORE_EMAIL, `Pedido aprovado ${ref} — ${BRL(total)}`, adminHtml);

    // e-mail PRO CLIENTE — confirmação
    if (customer.email) {
      const custHtml = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#111">
          <h2 style="margin:0 0 4px">Pedido confirmado!</h2>
          <p style="color:#666;margin:0 0 18px">Olá${customer.recipient ? ', ' + esc(customer.recipient.split(' ')[0]) : ''}! Recebemos o seu pagamento. Em breve a sua camisa será separada e enviada.</p>
          <h3 style="margin:18px 0 6px">Resumo</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows}</tbody></table>
          <p style="text-align:right;font-size:16px;font-weight:800;margin:10px 0 0">Total: ${BRL(total)}</p>
          <p style="font-size:13px;color:#666;margin-top:18px">Pedido ${esc(ref)}. Dúvidas? Responda este e-mail ou chame no WhatsApp.</p>
          <p style="font-size:13px;color:#999">Retrô em Campo</p>
        </div>`;
      await sendEmail(customer.email, 'Pedido confirmado — Retrô em Campo', custHtml);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    // 200 pra evitar tempestade de retry; o erro fica no log da Vercel
    console.error('mp-webhook error', e);
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
