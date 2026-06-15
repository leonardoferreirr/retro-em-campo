// Consulta pública de pedido — o cliente informa número do pedido + e-mail da compra.
// Retorna só dados não sensíveis (sem CPF, telefone ou endereço).
import { kvReady, getOrder } from '../lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!kvReady()) return res.status(503).json({ error: 'indisponível no momento' });

  try {
    const { ref = '', email = '' } = req.body || {};
    const cleanRef = String(ref).trim().toUpperCase();
    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanRef || !cleanEmail) return res.status(400).json({ error: 'informe o número do pedido e o e-mail' });

    const order = await getOrder(cleanRef);
    // resposta genérica nos dois casos (não confirma se o pedido existe) — evita enumeração
    const noMatch = !order || String((order.customer && order.customer.email) || '').trim().toLowerCase() !== cleanEmail;
    if (noMatch) return res.status(404).json({ error: 'Pedido não encontrado. Confira o número e o e-mail da compra.' });

    return res.status(200).json({
      ref: order.ref,
      status: order.status,
      created_iso: order.created_iso,
      shipped_iso: order.shipped_iso || null,
      delivered_iso: order.delivered_iso || null,
      tracking: order.tracking || null,
      total: order.total,
      first_name: String((order.customer && order.customer.recipient) || '').split(/\s+/)[0] || '',
      items: (order.items || []).map(i => ({ title: i.title, qty: i.qty || i.quantity || 1 }))
    });
  } catch (e) {
    console.error('order-status error', e);
    return res.status(500).json({ error: 'erro ao consultar o pedido' });
  }
}
