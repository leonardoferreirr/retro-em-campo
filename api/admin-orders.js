// Painel de pedidos (uso interno). Protegido por senha (env ADMIN_PASSWORD).
//  GET  -> lista os pedidos (header x-admin-key)
//  POST -> { ref, tracking } grava o código de rastreio e envia o e-mail ao cliente
//          { ref, status:'delivered' } marca como entregue
import crypto from 'node:crypto';
import { kvReady, listOrders, getOrder, updateOrder, deleteOrder, rateLimit, clientIp } from '../lib/kv.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'Retrô em Campo <pedidos@retroemcampo.com.br>';
const LOGO = 'https://www.retroemcampo.com.br/assets/brand/logo-light.png';
const CORREIOS = 'https://rastreamento.correios.com.br';

const BRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function authorized(req) {
  if (!ADMIN_PASSWORD) return false;
  const key = String(req.headers['x-admin-key'] || '');
  const a = Buffer.from(key), b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html })
  });
  const body = await r.text();
  if (!r.ok) console.error('resend FAIL', r.status, body); else console.log('resend OK', r.status);
}

function trackingEmail(order) {
  const first = String((order.customer && order.customer.recipient) || '').split(/\s+/)[0] || '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;margin:0;padding:22px 0">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#fff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111">
          <tr><td align="center" style="background:#0a0a0a;padding:22px 0"><img src="${LOGO}" alt="Retrô em Campo" width="210" style="width:210px;max-width:60%;height:auto;display:block"></td></tr>
          <tr><td style="padding:24px 28px 30px">
            <h2 style="margin:0 0 4px">Seu pedido foi enviado! 📦</h2>
            <p style="color:#666;margin:0 0 18px">Olá${first ? ', ' + esc(first) : ''}! Sua camisa saiu para entrega. Acompanhe pelo código abaixo.</p>
            <p style="margin:0 0 4px;color:#666;font-size:13px">Código de rastreio</p>
            <p style="font-size:22px;font-weight:800;letter-spacing:1px;margin:0 0 18px">${esc(order.tracking)}</p>
            <a href="${CORREIOS}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700">Rastrear nos Correios</a>
            <p style="font-size:13px;color:#666;margin-top:18px">No site dos Correios, cole o código acima para ver a localização. O prazo é de 10 a 20 dias úteis.</p>
            <p style="font-size:13px;color:#666">Pedido ${esc(order.ref)}. Dúvidas? Responda este e-mail ou chame no WhatsApp.</p>
            <p style="font-size:13px;color:#999">Retrô em Campo</p>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

export default async function handler(req, res) {
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD não configurado na Vercel' });
  if (!kvReady()) return res.status(503).json({ error: 'KV indisponível' });
  // trava força-bruta na senha: 30 req/min por IP
  const rl = await rateLimit(`rl:adm:${clientIp(req)}`, 30, 60);
  if (!rl.ok) return res.status(429).json({ error: 'muitas tentativas, aguarde um minuto' });
  if (!authorized(req)) return res.status(401).json({ error: 'senha inválida' });

  try {
    if (req.method === 'GET') {
      const orders = await listOrders(200);
      return res.status(200).json({ orders });
    }

    if (req.method === 'POST') {
      const { ref, tracking, status, action } = req.body || {};
      const cleanRef = String(ref || '').trim().toUpperCase();
      if (!cleanRef) return res.status(400).json({ error: 'ref obrigatório' });
      const order = await getOrder(cleanRef);
      if (!order) return res.status(404).json({ error: 'pedido não encontrado' });

      if (action === 'delete') {
        await deleteOrder(cleanRef);
        return res.status(200).json({ ok: true, deleted: true });
      }
      if (action === 'archive' || action === 'unarchive') {
        const updated = await updateOrder(cleanRef, { archived: action === 'archive' });
        return res.status(200).json({ ok: true, order: updated });
      }

      if (status === 'delivered') {
        const updated = await updateOrder(cleanRef, { status: 'delivered', delivered_iso: new Date().toISOString() });
        return res.status(200).json({ ok: true, order: updated });
      }

      const code = String(tracking || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!code) return res.status(400).json({ error: 'código de rastreio obrigatório' });
      const updated = await updateOrder(cleanRef, {
        tracking: code, status: 'shipped',
        shipped_iso: order.shipped_iso || new Date().toISOString()
      });
      // só dispara e-mail se o código mudou (evita reenvio em edição acidental)
      if (order.tracking !== code && order.customer && order.customer.email) {
        await sendEmail(order.customer.email, 'Seu pedido foi enviado — Retrô em Campo', trackingEmail(updated));
      }
      return res.status(200).json({ ok: true, order: updated, emailed: order.tracking !== code });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('admin-orders error', e);
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
