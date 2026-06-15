'use strict';
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const DIAC = new RegExp('[\\u0300-\\u036f]','g');
const slugify = s => s.toLowerCase().normalize('NFD').replace(DIAC,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const BRL = n => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const CMP = p => p.price_compare || DATA.price_compare_default || 0;
const OFF = p => { const c=CMP(p); return c>p.price ? Math.round((1-p.price/c)*100) : 0; };
const PARC = (v,n=3) => `${n}x de ${BRL(v/n)} sem juros`;
const YR = y => { if(!y) return ''; y=String(y).trim();
  if(y.includes('/')){const a=y.split('/');return `’${a[0].slice(-2)}/${a[a.length-1].slice(-2)}`;}
  return `’${y.slice(-2)}`; };
const subOf = p => `${p.team}${p.year?' · '+YR(p.year):''}${p.variant?' ('+p.variant+')':''}`;

let DATA={products:[]}, CART=load();
const TEAMSLUG={}; // slug -> display name

function load(){ try{return JSON.parse(localStorage.getItem('rec_cart'))||[]}catch{return[]} }
function save(){ localStorage.setItem('rec_cart',JSON.stringify(CART)); renderCart(); }

/* ---------------- boot ---------------- */
fetch('data/products.json').then(r=>r.json()).then(d=>{
  DATA=d;
  d.products.forEach(p=>{ p.tslug=slugify(p.team); TEAMSLUG[p.tslug]=p.team; });
  buildNav(); renderCart(); route();
});
window.addEventListener('hashchange',route);

/* ---------------- nav ---------------- */
function groupsOf(section){
  const m={};
  DATA.products.filter(p=>p.section===section).forEach(p=>{(m[p.team]=m[p.team]||[]).push(p)});
  return m;
}
function buildNav(){
  const mk=(section,title)=>{
    const g=groupsOf(section);
    const subs=Object.keys(g).sort((a,b)=>a.localeCompare(b,'pt'))
      .map(t=>`<a href="#/${section}/${slugify(t)}">${t}<span class="n">${g[t].length}</span></a>`).join('');
    return `<div class="grp" data-sec="${section}">
      <button data-go="#/${section}">${title}<span class="chev">▾</span></button>
      <div class="sub">${subs}</div></div>`;
  };
  $('#nav').innerHTML =
    `<a href="#/">Início</a><a href="#/todas">Todas as camisetas</a>`
    + mk('times','Times') + mk('selecoes','Seleções');
  $$('#nav .grp>button').forEach(b=>b.addEventListener('click',()=>{
    b.parentElement.classList.toggle('open');
    location.hash=b.dataset.go; closeNav();
  }));
  $$('#nav > a, #nav .sub a').forEach(a=>a.addEventListener('click',closeNav));
}

/* ---------------- router ---------------- */
function route(){
  if(window.__hero){clearInterval(window.__hero);window.__hero=null;}
  const h=(location.hash||'#/').replace(/^#/,'');
  const seg=h.split('/').filter(Boolean); // ['times','barcelona']
  window.scrollTo(0,0);
  if(seg.length===0) return viewHome();
  if(seg[0]==='produto') return viewProduct(seg[1]);
  if(seg[0]==='checkout') return viewCheckout();
  if(seg[0]==='todas') return viewAll();
  if(seg[0]==='suporte') return viewDoc('suporte');
  if(seg[0]==='termos') return viewDoc('termos');
  if(seg[0]==='privacidade') return viewDoc('privacidade');
  if(seg[0]==='times'||seg[0]==='selecoes'){
    if(seg[1]) return viewGroup(seg[0],seg[1]);
    return viewSection(seg[0]);
  }
  viewHome();
  setActive(h);
}
function setActive(h){
  $$('#nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+h));
}

/* ---------------- cards ---------------- */
function card(p){
  const b=p.img[1]||p.img[0];
  const c=CMP(p), off=OFF(p);
  return `<a class="card" href="#/produto/${p.slug}">
    <span class="ph">
      <img class="a" loading="lazy" src="${p.thumb}" alt="${p.player} ${p.team}">
      <img class="b" loading="lazy" src="${b}" alt="">
    </span>
    ${off?`<span class="tag">${off}% OFF</span>`:''}
    <span class="cinfo">
      <span class="ci-txt">
        <span class="ci-pl">${p.player}${p.number?' #'+p.number:''}</span>
        <span class="ci-sb">${subOf(p)}</span>
      </span>
      <span class="ci-pr">${c>p.price?`<s>${BRL(c)}</s>`:''}<b>${BRL(p.price)}</b></span>
    </span></a>`;
}

/* ---------------- views ---------------- */
function viewHome(){
  const feat=[...DATA.products].slice(0,12);
  const slides=[
    {img:'assets/brand/hero-1.jpg',v:'assets/brand/hero-1-v.jpg',
     h:'As camisetas mais icônicas de todas',sub:'Da laranja holandesa de 88 aos mantos eternos, reunidos aqui.',cta:'Ver todas as camisetas',href:'#/todas'},
    {img:'assets/brand/hero-2.jpg',v:'assets/brand/hero-2-v.jpg',
     h:'As seleções que pararam o mundo',sub:'Rivalidades eternas, recriadas em peça.',cta:'Ver seleções',href:'#/selecoes'},
    {img:'assets/brand/hero-3.jpg',v:'assets/brand/hero-3-v.jpg',
     h:'Clube no peito, história nas cores',sub:'Os mantos que marcaram época nos maiores clubes.',cta:'Ver times',href:'#/times'}
  ];
  const slidesHTML=slides.map((s,i)=>`
    <a class="hslide${i?'':' on'}" href="${s.href}" data-i="${i}" style="--d:url('${s.img}');--m:url('${s.v}')">
      <div class="hcopy">
        <h1>${s.h}</h1><p>${s.sub}</p>
        <span class="btn btn-light">${s.cta} <span aria-hidden="true">→</span></span>
      </div>
    </a>`).join('');
  const dotsHTML=slides.map((s,i)=>`<button class="hdot${i?'':' on'}" data-i="${i}" aria-label="slide ${i+1}"></button>`).join('');
  $('#view').innerHTML=`
  <section class="hero-carousel" id="heroCar">
    <div class="hslides">${slidesHTML}</div>
    <div class="hdots">${dotsHTML}</div>
  </section>
  <div class="wrap">
    <div class="tiles">
      <a class="tile" href="#/times"><img src="${DATA.products.find(p=>p.section==='times').img[0]}" alt=""><h3>Times</h3><span class="go">Ver todos →</span></a>
      <a class="tile" href="#/selecoes"><img src="${DATA.products.find(p=>p.section==='selecoes').img[0]}" alt=""><h3>Seleções</h3><span class="go">Ver todas →</span></a>
    </div>
    <div class="shead"><h2>Destaques</h2><span class="cnt">${DATA.products.length} modelos no acervo</span></div>
    <div class="grid">${feat.map(card).join('')}</div>
  </div>
  ${footer()}`;
  const car=$('#heroCar');
  if(car){
    const sl=$$('.hslide',car), dt=$$('.hdot',car); let ci=0;
    const show=i=>{ci=(i+sl.length)%sl.length;
      sl.forEach((s,j)=>s.classList.toggle('on',j===ci));
      dt.forEach((d,j)=>d.classList.toggle('on',j===ci));};
    const reset=()=>{clearInterval(window.__hero);window.__hero=setInterval(()=>show(ci+1),5500);};
    dt.forEach(d=>d.addEventListener('click',e=>{e.preventDefault();show(+d.dataset.i);reset();}));
    reset();
  }
  setActive('/');
}

function viewAll(){
  const items=DATA.products;
  $('#view').innerHTML=`<div class="wrap">
    <div class="crumb"><a href="#/">Início</a> / Todas as camisetas</div>
    <div class="shead"><h2>Todas as camisetas</h2><span class="cnt">${items.length} modelos no acervo</span></div>
    <div class="grid">${items.map(card).join('')}</div>
  </div>${footer()}`;
  setActive('/todas');
}

function viewSection(section){
  const title=section==='times'?'Times':'Seleções';
  const g=groupsOf(section);
  const keys=Object.keys(g).sort((a,b)=>a.localeCompare(b,'pt'));
  const blocks=keys.map(t=>`
    <div class="gblock">
      <div class="gbar"><h3>${t}</h3><a href="#/${section}/${slugify(t)}">Ver ${g[t].length} →</a></div>
      <div class="grid">${g[t].map(card).join('')}</div>
    </div>`).join('');
  $('#view').innerHTML=`<div class="wrap">
    <div class="crumb"><a href="#/">Início</a> / ${title}</div>
    <div class="shead"><h2>${title}</h2><span class="cnt">${keys.length} ${section==='times'?'clubes':'seleções'} · ${DATA.products.filter(p=>p.section===section).length} modelos</span></div>
    ${blocks}
  </div>${footer()}`;
  setActive('/'+section);
}

function viewGroup(section,tslug){
  const team=TEAMSLUG[tslug];
  const items=DATA.products.filter(p=>p.section===section&&p.tslug===tslug);
  if(!items.length) return viewSection(section);
  const title=section==='times'?'Times':'Seleções';
  $('#view').innerHTML=`<div class="wrap">
    <div class="crumb"><a href="#/">Início</a> / <a href="#/${section}">${title}</a> / ${team}</div>
    <div class="shead"><h2>${team}</h2><span class="cnt">${items.length} ${items.length>1?'modelos':'modelo'}</span></div>
    <div class="grid">${items.map(card).join('')}</div>
  </div>${footer()}`;
  setActive('/'+section);
}

function viewProduct(slug){
  const p=DATA.products.find(x=>x.slug===slug);
  if(!p) return viewHome();
  const secTitle=p.section==='times'?'Times':'Seleções';
  const thumbs=p.img.map((s,i)=>`<img data-i="${i}" class="${i?'':'on'}" src="${s}" alt="vista ${i+1}">`).join('');
  const sizes=DATA.sizes.map(s=>`<button data-sz="${s}">${s}</button>`).join('');
  const parc=`ou ${PARC(p.price)}`;
  const c=CMP(p), off=OFF(p);
  $('#view').innerHTML=`<div class="wrap">
    <div class="crumb"><a href="#/">Início</a> / <a href="#/${p.section}">${secTitle}</a> / <a href="#/${p.section}/${p.tslug}">${p.team}</a></div>
    <div class="pdp">
      <div class="gallery">
        <div class="thumbs">${thumbs}</div>
        <div class="main"><img id="pmain" src="${p.img[0]}" alt="${p.player} ${p.team}"></div>
      </div>
      <div class="pinfo">
        <div class="pteam">${p.team}${p.variant?' · '+p.variant:''}</div>
        <h1>${p.player}${p.number?' #'+p.number:''}</h1>
        <div class="pyear">${YR(p.year)||'—'}</div>
        <div class="price">${c>p.price?`<s class="cmp">${BRL(c)}</s>`:''}${BRL(p.price)}${off?`<span class="offb">${off}% OFF</span>`:''}</div>
        <div class="parc">${parc}</div>
        <div class="sz-label"><span>Tamanho</span><span id="szhint" style="color:var(--muted);font-weight:500">Selecione</span></div>
        <div class="sizes">${sizes}</div>
        <button class="btn btn-dark" id="addBtn" disabled>Adicionar à sacola</button>
        <div class="frete-note">⚡ Enviamos para todo o Brasil. <b style="margin-left:4px">Frete grátis acima de ${BRL(DATA.frete.gratis_acima)}.</b></div>
        <div class="acc">
          <details open><summary>Descrição</summary><div class="body">
            Camisa retrô ${p.player}, ${p.team}, temporada ${YR(p.year)}${p.variant?' ('+p.variant+')':''}. Tecido leve e respirável, escudo e patrocínios fiéis à época. Edição colecionável.
          </div></details>
          <details><summary>Tamanhos e medidas</summary><div class="body">
            Disponível em ${DATA.sizes.join(', ')}. Modelagem padrão adulto. Em dúvida entre dois tamanhos, recomendamos o maior. Dúvidas: <a href="#/suporte">suporte</a>.
          </div></details>
          <details><summary>Entrega e trocas</summary><div class="body">
            Enviamos para todo o Brasil. Frete grátis acima de ${BRL(DATA.frete.gratis_acima)}; abaixo disso, o valor é calculado no checkout. Trocas em até 7 dias após o recebimento.
          </div></details>
        </div>
      </div>
    </div>
  </div>${footer()}`;
  let size=null;
  $$('.gallery .thumbs img').forEach(t=>t.addEventListener('mouseenter',()=>{
    $('#pmain').src=p.img[+t.dataset.i];
    $$('.gallery .thumbs img').forEach(x=>x.classList.toggle('on',x===t));
  }));
  $$('.sizes button').forEach(b=>b.addEventListener('click',()=>{
    size=b.dataset.sz; $$('.sizes button').forEach(x=>x.classList.toggle('on',x===b));
    $('#szhint').textContent=size; $('#addBtn').disabled=false;
  }));
  $('#addBtn').addEventListener('click',()=>{ if(!size)return; addToCart(p,size); });
  setActive('/'+p.section);
}

/* ---------------- cart ---------------- */
function addToCart(p,size){
  const key=p.slug+'_'+size;
  const ex=CART.find(i=>i.key===key);
  if(ex) ex.qty++; else CART.push({key,slug:p.slug,player:p.player,sub:subOf(p),size,
    price:p.price,thumb:p.thumb,qty:1});
  save(); toast('Adicionado à sacola'); openCart();
}
function renderCart(){
  const n=CART.reduce((s,i)=>s+i.qty,0);
  $('#cartCountTop').textContent=n; $('#cartCountSide').textContent=n;
  const box=$('#cartItems'), foot=$('#cartFoot');
  if(!CART.length){ box.innerHTML='<div class="cart-empty">Sua sacola está vazia.</div>'; foot.innerHTML=''; return; }
  box.innerHTML=CART.map(i=>`<div class="citem">
    <img src="${i.thumb}" alt="">
    <div><div class="ci-pl">${i.player}</div><div class="ci-sb">${i.sub}</div>
      <div class="ci-sz">Tam: <b>${i.size}</b> · Qtd: ${i.qty}</div>
      <div class="ci-rm" data-rm="${i.key}">remover</div></div>
    <div class="ci-pr">${BRL(i.price*i.qty)}</div></div>`).join('');
  const sub=CART.reduce((s,i)=>s+i.price*i.qty,0);
  const free=sub>=DATA.frete.gratis_acima;
  const falta=DATA.frete.gratis_acima-sub;
  foot.innerHTML=`
    <div class="row"><span>Subtotal</span><span>${BRL(sub)}</span></div>
    <div class="row"><span>Frete</span><span>${free?'Grátis':'Calculado no checkout'}</span></div>
    ${!free?`<div class="frete-bar">Faltam <b>${BRL(falta)}</b> para frete grátis.</div>`:'<div class="frete-bar"><b>Você ganhou frete grátis! 🎉</b></div>'}
    <div class="row tot"><span>Total</span><span>${BRL(sub)}</span></div>
    <div class="cart-parc">em até ${PARC(sub)}</div>
    <button class="btn btn-dark" id="checkoutBtn">Finalizar compra</button>`;
  $$('#cartItems [data-rm]').forEach(x=>x.addEventListener('click',()=>{
    CART=CART.filter(i=>i.key!==x.dataset.rm); save();
  }));
  $('#checkoutBtn').addEventListener('click',()=>{ closeCart(); location.hash='#/checkout'; });
}

/* ---------------- checkout (dados de entrega) ---------------- */
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const onlyDigits=s=>(s||'').replace(/\D/g,'');
function viewCheckout(){
  if(!CART.length){ location.hash='#/'; return; }
  const sub=CART.reduce((s,i)=>s+i.price*i.qty,0);
  const free=sub>=DATA.frete.gratis_acima;
  const itens=CART.map(i=>`<div class="co-item"><span>${i.qty}× ${i.player}${i.size?' · '+i.size:''}</span><b>${BRL(i.price*i.qty)}</b></div>`).join('');
  $('#view').innerHTML=`<div class="wrap">
    <div class="crumb"><a href="#/">Início</a> / Finalizar compra</div>
    <div class="shead"><h2>Dados de entrega</h2></div>
    <div class="co">
      <form class="co-form" id="coForm" novalidate>
        <p class="co-hint">Preencha em português. Esses dados são usados para enviar a sua camisa e emitir o pedido.</p>
        <label>Destinatário (nome completo)<input name="recipient" autocomplete="name" required></label>
        <div class="co-row">
          <label>CPF<input name="cpf" inputmode="numeric" placeholder="000.000.000-00" required></label>
          <label>Telefone / WhatsApp<input name="phone" inputmode="tel" placeholder="(00) 00000-0000" required></label>
        </div>
        <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
        <div class="co-row">
          <label>CEP<input name="cep" inputmode="numeric" placeholder="00000-000" required></label>
          <label>Estado<select name="state" required><option value="">UF</option>${UFS.map(u=>`<option>${u}</option>`).join('')}</select></label>
        </div>
        <label>Cidade<input name="city" autocomplete="address-level2" required></label>
        <label>Endereço (rua, número, complemento, bairro)<input name="address" autocomplete="street-address" required></label>
        <div class="co-err" id="coErr" hidden></div>
        <button type="submit" class="btn btn-dark" id="coSubmit">Ir para o pagamento</button>
        <div class="co-safe">🔒 Pagamento processado pelo Mercado Pago. Não armazenamos dados de cartão.</div>
      </form>
      <aside class="co-summary">
        <h3>Seu pedido</h3>
        ${itens}
        <div class="co-line"><span>Subtotal</span><span>${BRL(sub)}</span></div>
        <div class="co-line"><span>Frete</span><span>${free?'Grátis':'Calculado no pagamento'}</span></div>
        <div class="co-line co-tot"><span>Total</span><span>${BRL(sub)}</span></div>
        <div class="co-parc">em até ${PARC(sub)}</div>
      </aside>
    </div>
  </div>${footer()}`;
  $('#coForm').addEventListener('submit',submitCheckout);
  setActive('/checkout');
}
function submitCheckout(e){
  e.preventDefault();
  const f=e.target, g=n=>f.elements[n].value.trim();
  const customer={recipient:g('recipient'),cpf:g('cpf'),phone:g('phone'),email:g('email'),
    cep:g('cep'),state:g('state'),city:g('city'),address:g('address')};
  const err=$('#coErr'); const fail=m=>{err.textContent=m;err.hidden=false;err.scrollIntoView({block:'center'});};
  if(Object.values(customer).some(v=>!v)) return fail('Preencha todos os campos.');
  if(onlyDigits(customer.cpf).length!==11) return fail('CPF inválido (11 dígitos).');
  if(onlyDigits(customer.cep).length!==8) return fail('CEP inválido (8 dígitos).');
  if(!/^\S+@\S+\.\S+$/.test(customer.email)) return fail('E-mail inválido.');
  err.hidden=true;
  const sub=CART.reduce((s,i)=>s+i.price*i.qty,0);
  const frete=sub>=DATA.frete.gratis_acima?0:DATA.frete.valor;
  const btn=$('#coSubmit'); btn.textContent='Gerando pagamento...'; btn.disabled=true;
  fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({items:CART,frete,customer})})
    .then(r=>r.json())
    .then(d=>{ if(d.init_point) location.href=d.init_point;
      else throw new Error(d.error||'sem init_point'); })
    .catch(()=>{ btn.textContent='Ir para o pagamento'; btn.disabled=false;
      fail('Pagamento disponível após conectar o Mercado Pago. Tente novamente em instantes.'); });
}

/* ---------------- ui chrome ---------------- */
function openCart(){$('#cart').classList.add('open');$('#scrimCart').classList.add('on');}
function closeCart(){$('#cart').classList.remove('open');$('#scrimCart').classList.remove('on');}
function openNav(){$('#sidebar').classList.add('open');$('#scrim').classList.add('on');}
function closeNav(){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('on');}
let tt;
function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;
  document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(tt);tt=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),400)},2200);}
['#cartToggle','#cartToggle2'].forEach(s=>$(s)&&$(s).addEventListener('click',openCart));
$('#cartClose').addEventListener('click',closeCart);
$('#scrimCart').addEventListener('click',closeCart);
$('#navToggle').addEventListener('click',openNav);
$('#scrim').addEventListener('click',closeNav);

/* WhatsApp flutuante — preencha WAPP com o número (só dígitos, DDI 55) quando a conta estiver pronta */
const WAPP=''; // ex: '5531991234567'
(()=>{const el=$('#wapp');if(!el||!WAPP)return;
  const msg=encodeURIComponent('Olá! Vim pela loja Retrô em Campo e quero tirar uma dúvida.');
  el.href=`https://wa.me/${WAPP}?text=${msg}`;el.hidden=false;})();

/* ---------------- footer + docs ---------------- */
function footer(){
  return `<footer class="foot">
    <div>© ${new Date().getFullYear()} Retrô em Campo — Camisas de futebol retrô</div>
    <div style="display:flex;gap:18px">
      <a href="#/suporte">Suporte</a><a href="#/termos">Termos</a>
      <a href="#/privacidade">Privacidade</a></div>
  </footer>`;
}
function viewDoc(which){
  $('#view').innerHTML=`<div class="wrap"><div class="doc">${DOCS[which]}</div></div>${footer()}`;
  setActive('/'+which);
}
const EMAIL='retroemcampo@gmail.com';
const DOCS={
  suporte:`<h1>Suporte</h1><p class="upd">Estamos aqui para ajudar.</p>
    <div class="support-card"><div>📧</div><div><div class="big">${EMAIL}</div>
    <div style="color:var(--muted);font-size:.85rem">Resposta em até 24h úteis.</div></div></div>
    <h2>Como podemos ajudar</h2>
    <ul><li>Dúvidas sobre tamanhos e medidas</li><li>Status e prazo do seu pedido</li>
    <li>Trocas e devoluções (até 7 dias após o recebimento)</li><li>Disponibilidade de modelos</li></ul>
    <h2>Pedidos</h2><p>Para falar sobre um pedido, envie o número do pedido e o e-mail da compra para
    <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
    <h2>Trocas e devoluções</h2><p>Você tem até 7 dias corridos após o recebimento para solicitar
    troca ou devolução, com a peça sem uso e na embalagem original. Escreva para
    <a href="mailto:${EMAIL}">${EMAIL}</a> que orientamos o passo a passo.</p>`,
  termos:`<h1>Termos e condições</h1><p class="upd">Última atualização: ${new Date().toLocaleDateString('pt-BR')}</p>
    <p>Bem-vindo à Retrô em Campo. Ao acessar e comprar em nossa loja, você concorda com os termos abaixo.</p>
    <h2>1. A loja</h2><p>A Retrô em Campo comercializa camisas de futebol retrô colecionáveis. As imagens
    são ilustrativas; pode haver pequena variação de cor conforme a tela do dispositivo.</p>
    <h2>2. Pedidos e pagamento</h2><p>Os preços estão em reais (BRL) e podem ser alterados sem aviso prévio.
    O pagamento é processado por meio do Mercado Pago. O pedido é confirmado após a aprovação do pagamento.</p>
    <h2>3. Frete e entrega</h2><p>O frete é de ${'R$ 22,00'} para todo o Brasil, gratuito para compras acima de
    R$ 499,00. Os prazos de entrega variam conforme a região e a transportadora.</p>
    <h2>4. Trocas e devoluções</h2><p>Conforme o Código de Defesa do Consumidor, você pode solicitar troca ou
    devolução em até 7 dias corridos após o recebimento, com a peça sem uso e na embalagem original.</p>
    <h2>5. Propriedade intelectual</h2><p>As marcas e escudos eventualmente exibidos pertencem aos seus
    respectivos titulares. Os produtos são itens colecionáveis inspirados em peças clássicas.</p>
    <h2>6. Contato</h2><p>Dúvidas sobre estes termos: <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
    <p style="color:var(--muted);font-size:.8rem">Razão social e CNPJ: [A PREENCHER].</p>`,
  privacidade:`<h1>Política de privacidade</h1><p class="upd">Última atualização: ${new Date().toLocaleDateString('pt-BR')}</p>
    <p>Sua privacidade é importante. Esta política explica como tratamos seus dados, em conformidade com a
    Lei Geral de Proteção de Dados (LGPD).</p>
    <h2>1. Dados que coletamos</h2><ul><li>Dados de contato e entrega (nome, e-mail, endereço, telefone);</li>
    <li>Dados do pedido e do pagamento (processados pelo Mercado Pago);</li>
    <li>Dados de navegação (cookies e métricas de uso).</li></ul>
    <h2>2. Como usamos</h2><p>Para processar pedidos, realizar entregas, dar suporte e melhorar a loja.
    Não vendemos seus dados a terceiros.</p>
    <h2>3. Pagamento</h2><p>Os dados de pagamento são tratados diretamente pelo Mercado Pago, conforme a
    política de privacidade da plataforma. Não armazenamos dados completos de cartão.</p>
    <h2>4. Seus direitos</h2><p>Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer
    momento escrevendo para <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
    <h2>5. Cookies</h2><p>Usamos cookies para lembrar sua sacola e medir o uso do site. Você pode desativá-los
    nas configurações do navegador.</p>
    <h2>6. Contato</h2><p>Encarregado de dados: <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>`
};
