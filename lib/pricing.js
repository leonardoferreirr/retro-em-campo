// Preço autoritativo do pedido — recalcula tudo a partir do catálogo real (data/products.json),
// nunca confiando no preço enviado pelo navegador. Usado pelo cartão e pelo PIX.
export async function priceOrder(base, items) {
  if (!Array.isArray(items) || !items.length) throw { code: 400, msg: 'sacola vazia' };

  const catRes = await fetch(`${base}/data/products.json`);
  if (!catRes.ok) throw { code: 503, msg: 'catálogo indisponível, tente de novo' };
  const catalog = await catRes.json();
  const bySlug = Object.fromEntries((catalog.products || []).map(p => [p.slug, p]));

  let subtotal = 0;
  const safeItems = [];
  for (const i of items) {
    const p = bySlug[i.slug];
    if (!p || !(Number(p.price) > 0)) throw { code: 400, msg: 'produto inválido na sacola' };
    const qty = Math.max(1, Math.min(20, parseInt(i.qty, 10) || 1));
    const unit = Number(p.price);
    subtotal += unit * qty;
    // só o slug vem do cliente; o resto é do catálogo
    safeItems.push({ slug: p.slug, player: p.player, sub: i.sub || p.sub, size: i.size, price: unit, qty, thumb: p.thumb });
  }
  const frete = subtotal >= Number(catalog.frete.gratis_acima) ? 0 : Number(catalog.frete.valor);
  const amount = Math.round((subtotal + frete) * 100) / 100;
  if (!(amount > 0)) throw { code: 400, msg: 'valor inválido' };

  return { safeItems, subtotal, frete, amount };
}

// monta os metadados do pedido (usados pelo webhook pra e-mail + gravação no KV)
export function orderMetadata(base, customer, safeItems) {
  return {
    customer,
    order_items: safeItems.map(i => ({
      title: `${i.player || ''} ${i.sub || ''}`.trim(),
      qty: i.qty,
      unit_price: i.price,
      image: i.thumb ? (/^https?:/.test(i.thumb) ? i.thumb : `${base}/${i.thumb}`) : ''
    }))
  };
}
