// SpentShare — núcleo: estado, utilidades, formatos, avatares y cálculo de cuentas.
// Scripts clásicos con alcance global (como el resto del proyecto).
'use strict';

// ───────────────────────── estado ─────────────────────────
const S = {
  page: 'boot',            // boot | auth | home | activity | stats | groups
  user: null,              // usuario de Firebase
  me: null,                // users/{uid}
  groups: [],              // mis grupos
  gid: null,               // grupo abierto
  group: null,
  members: [],             // [{uid, name, email, avatar, lang}]
  meta: {},                // uid -> groups/{g}/members/{uid} (payMethods)
  expenses: null,          // null = cargando
  budgets: [],
  requests: [],            // cobros pendientes del grupo
  groupNets: {},           // gid -> mi saldo en ese grupo (para la pantalla de grupos)
  authMode: 'login',
  motion: true,
  act: { cat: 'all', person: 'all', query: '', period: 'month', month: null, day: null, from: null, to: null },
  st: { period: 'month', bar: null, cat: null },
  pendingReceipt: null,    // datos de un recibo escaneado o de la IA, para el gasto que se está creando
};

// ───────────────────────── utilidades ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icon = (name, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '?';
const uid = () => S.user && S.user.uid;
const wait = ms => new Promise(r => setTimeout(r, ms));

// ───────────────────────── dinero ─────────────────────────
const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', decimals: 2, thousandsSep: ',', decimalSep: '.', flag: '🇺🇸' },
  COP: { code: 'COP', symbol: '$', decimals: 0, thousandsSep: '.', decimalSep: ',', flag: '🇨🇴' },
};
function cur() { return (S.group && S.group.currency) || 'USD'; }
function money(amount, code) {
  const c = CURRENCIES[code || cur()] || CURRENCIES.USD;
  const n = Math.abs(Number(amount) || 0);
  const [i, d] = n.toFixed(c.decimals).split('.');
  return c.symbol + i.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousandsSep) + (d ? c.decimalSep + d : '');
}
const signedMoney = (n, code) => (n < -0.005 ? '−' : '') + money(n, code);
// "45,5" / "45.50" / "1.200.000" -> número, según la moneda
function parseAmount(str, code) {
  let s = String(str || '').trim().replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const c = CURRENCIES[code || cur()] || CURRENCIES.USD;
  if (c.decimals === 0) return Number(s.replace(/[.,]/g, ''));
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    return Number(s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1));
  }
  return Number(s.replace(/[.,]/g, ''));
}
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

// ───────────────────────── fechas ─────────────────────────
function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  return new Date(v);
}
// Fecha del gasto: la que eligió la persona, o cuando se anotó (null = recién creado: hoy)
function expDate(e) { return toDate(e.spentAt) || toDate(e.createdAt) || new Date(); }
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
function fmtDay(d) { return L().fmtDay(d.getDate(), L().monthsShort[d.getMonth()]); }
function fmtLong(d, year = true) { return L().fmtLong(d.getDate(), L().months[d.getMonth()], year ? d.getFullYear() : ''); }
function dayLabel(d) {
  const now = new Date();
  if (sameDay(d, now)) return t('today');
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return t('yesterday');
  return fmtLong(d, d.getFullYear() !== now.getFullYear());
}

// ───────────────────────── avatares ─────────────────────────
const AVATAR_CLASSES = ['', 'camilo', 'leo', 'sara', 'mateo'];
function nameHash(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function memberOf(id) { return S.members.find(m => m.uid === id) || null; }
function nameOf(id, fallback) { const m = memberOf(id); return (m && m.name) || fallback || '?'; }
function avatar(person, cls = '') {
  const p = typeof person === 'string' ? (memberOf(person) || { name: person }) : (person || {});
  const name = p.name || p.email || '?';
  const photo = p.avatar && String(p.avatar).startsWith('data:') ? p.avatar : '';
  const tone = AVATAR_CLASSES[nameHash(p.uid || name) % AVATAR_CLASSES.length];
  if (photo) return `<span class="avatar photo ${cls}" style="background-image:url('${photo}')" aria-label="${esc(name)}"></span>`;
  return `<span class="avatar ${tone} ${cls}" aria-label="${esc(name)}">${esc((name.trim()[0] || '?').toUpperCase())}</span>`;
}
const stack = (people, max = 3) => `<span class="stack">${people.slice(0, max).map(p => avatar(p)).join('')}</span>`;

// ───────────────────────── categorías ─────────────────────────
// Cinco familias de color del diseño; cada categoría con su ícono
const CATS = {
  food: { icon: 'food', tone: 'food' }, drinks: { icon: 'glass', tone: 'food' }, pets: { icon: 'paw', tone: 'food' },
  shopping: { icon: 'shop', tone: 'shop' }, gifts: { icon: 'gift', tone: 'shop' }, kids: { icon: 'smile', tone: 'shop' },
  transport: { icon: 'car', tone: 'transport' }, travel: { icon: 'plane', tone: 'transport' }, health: { icon: 'heart', tone: 'transport' },
  home: { icon: 'home', tone: 'home' }, utilities: { icon: 'bolt', tone: 'home' }, education: { icon: 'book', tone: 'home' },
  other: { icon: 'wallet', tone: 'other' }, entertainment: { icon: 'ticket', tone: 'other' }, personalcare: { icon: 'scissors', tone: 'other' },
};
const CAT_ORDER = ['food', 'shopping', 'transport', 'home', 'utilities', 'drinks', 'travel', 'health', 'entertainment', 'personalcare', 'pets', 'kids', 'education', 'gifts', 'other'];
const catName = k => t('cat.' + (CATS[k] ? k : 'other'));
function categoryIcon(k) {
  const c = CATS[k] || CATS.other;
  return `<span class="category-icon ${c.tone}">${icon(c.icon)}</span>`;
}
// Ícono del gasto: logo de la tienda (si la IA lo encontró) encima del ícono de categoría
function expenseIcon(e) {
  if (e.type === 'settle') return `<span class="category-icon transport">${icon('check')}</span>`;
  const base = categoryIcon(e.category);
  if (!e.logoDomain) return base;
  const src = 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(e.logoDomain) + '.ico';
  return `<span class="expense-logo-wrap">${base}<img class="expense-logo" src="${src}" alt="" loading="lazy" onerror="this.remove()"></span>`;
}
// Detección rápida de categoría mientras se escribe (la IA la afina después en el servidor)
const CAT_WORDS = {
  food: 'mercado supermercado super comida cena almuerzo desayuno restaurante pizza hamburguesa tacos sushi pan cafe café panaderia grocery groceries dinner lunch breakfast restaurant food burger coffee bakery walmart costco aldi kroger exito éxito d1 ara jumbo carulla olimpica panda dunkin starbucks mcdonald chipotle domino',
  transport: 'uber lyft taxi gasolina combustible parqueadero peaje bus metro tren vuelo didi cabify gas fuel parking toll train flight transmilenio',
  utilities: 'luz agua internet wifi celular telefono teléfono gas arriendo renta servicios factura electric electricity water phone rent bill netflix spotify subscription suscripcion',
  health: 'farmacia medicina medico médico doctor hospital dentista gimnasio gym pharmacy medicine clinic drogueria droguería cvs walgreens',
  entertainment: 'cine pelicula película concierto teatro juego partido entradas boletas movie cinema concert theater ticket tickets game',
  drinks: 'cerveza vino trago bar licor cervezas beer wine drinks cocktail tequila aguardiente',
  home: 'casa mueble muebles ferreteria ferretería limpieza aseo hogar home depot ikea furniture cleaning hardware',
  travel: 'hotel airbnb hostal viaje vacaciones maleta booking trip vacation',
  shopping: 'ropa zapatos tienda compras amazon target zara shein clothes shoes shopping mall',
  pets: 'veterinario mascota perro gato concentrado vet pet dog cat',
  education: 'colegio universidad curso libro libros clase matricula matrícula school course book tuition',
  gifts: 'regalo regalos cumpleaños flores gift gifts birthday flowers',
  kids: 'bebe bebé pañales juguete juguetes niños baby diapers toy toys',
  personalcare: 'peluqueria peluquería barberia barbería uñas spa masaje maquillaje haircut barber nails massage makeup',
};
function guessCategory(text) {
  const words = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/);
  for (const [k, list] of Object.entries(CAT_WORDS)) {
    const set = list.normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ');
    if (words.some(w => w.length > 1 && set.includes(w))) return k;
  }
  return null;
}

// ───────────────────────── formas de pago ("Cómo me pagan") ─────────────────────────
// Igual que PAY_METHODS de functions/emails/templates.js
const PAY = {
  venmo: { name: 'Venmo', mark: 'V', colors: ['#E4EDFE', '#4B72B9'], usd: true,
    link: (v, amt, note) => `https://venmo.com/${encodeURIComponent(String(v).replace(/^@/, ''))}?txn=pay${amt ? `&amount=${amt}` : ''}&note=${encodeURIComponent(note || 'SpentShare')}` },
  paypal: { name: 'PayPal', mark: 'P', colors: ['#EAE5FF', '#7851D2'], usd: true,
    link: (v, amt) => `https://paypal.me/${encodeURIComponent(String(v).replace(/^@/, ''))}${amt ? `/${amt}USD` : ''}` },
  cashapp: { name: 'Cash App', mark: '$', colors: ['#DFF1E9', '#3C856B'], usd: true,
    link: (v, amt) => `https://cash.app/$${encodeURIComponent(String(v).replace(/^\$/, ''))}${amt ? `/${amt}` : ''}` },
  zelle: { name: 'Zelle', mark: 'Z', colors: ['#EAE3FF', '#6941F5'], usd: true },
  nequi: { name: 'Nequi', mark: 'N', colors: ['#F7E3ED', '#AD577F'], cop: true },
  breb: { nameKey: 'pay.breb', mark: 'B', colors: ['#FFF0DF', '#A7651D'], cop: true },
};
const PAY_ORDER = ['zelle', 'venmo', 'paypal', 'cashapp', 'nequi', 'breb'];
const payName = k => (PAY[k] && (PAY[k].nameKey ? t(PAY[k].nameKey) : PAY[k].name)) || t('method.' + k);
function payMark(k) {
  const p = PAY[k]; if (!p) return '';
  return `<span class="pay-mark" style="background:${p.colors[0]};color:${p.colors[1]}">${esc(p.mark)}</span>`;
}
const payMethodsOf = id => ((S.meta[id] && S.meta[id].payMethods) || []).filter(m => m && m.value && PAY[m.type]);

// ───────────────────────── cálculo de cuentas ─────────────────────────
const memberUids = () => (S.group && S.group.memberUids) || S.members.map(m => m.uid);

// Cuánto le toca a cada quien de un gasto: {uid: parte}
// splitUids (nuevo) = partes iguales entre esas personas; si no, los tipos de siempre.
function shares(e, uids = memberUids()) {
  const amt = Number(e.amount) || 0, out = {};
  if (e.type === 'settle') return out;
  if (Array.isArray(e.splitUids) && e.splitUids.length) {
    e.splitUids.forEach(u => { out[u] = (out[u] || 0) + amt / e.splitUids.length; });
    return out;
  }
  const payer = e.paidByUid;
  if (e.split === 'all' || !e.split) uids.forEach(u => { out[u] = amt / Math.max(uids.length, 1); });
  else if (e.split === 'two') {
    const partner = e.splitWithUid || uids.find(u => u !== payer);
    out[payer] = amt / 2; if (partner) out[partner] = (out[partner] || 0) + amt / 2;
  } else if (e.split === 'full') { if (e.splitWithUid) out[e.splitWithUid] = amt; }
  else out[payer] = amt; // solo
  return out;
}

// Neto por pares: net[a][b] > 0 => a le debe a b (sin simplificar deudas, como siempre)
function pairNets(expenses = S.expenses || [], uids = memberUids()) {
  const net = {};
  const add = (a, b, v) => {
    if (a === b || !a || !b) return;
    (net[a] = net[a] || {})[b] = ((net[a] || {})[b] || 0) + v;
    (net[b] = net[b] || {})[a] = ((net[b] || {})[a] || 0) - v;
  };
  expenses.forEach(e => {
    if (e.type === 'settle') { add(e.paidByUid, e.settledToUid, -(Number(e.amount) || 0)); return; }
    const sh = shares(e, uids);
    Object.entries(sh).forEach(([u, s]) => add(u, e.paidByUid, s));
  });
  return net;
}
// Mis cuentas con cada persona: [{uid, amount}] amount > 0 => yo le debo; < 0 => me debe
function myDebts(expenses, me = uid()) {
  const net = pairNets(expenses);
  return Object.entries(net[me] || {})
    .map(([u, v]) => ({ uid: u, amount: round2(v) }))
    .filter(d => Math.abs(d.amount) >= 0.01)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
// Saldo de alguien en el grupo: > 0 le deben, < 0 debe
function netOf(id, expenses) {
  const net = pairNets(expenses);
  return round2(-Object.values(net[id] || {}).reduce((s, v) => s + v, 0));
}
const pairOwes = (a, b, expenses) => round2(((pairNets(expenses)[a] || {})[b]) || 0);

// Gastos (sin pagos) entre dos fechas
function spending(expenses, from, to) {
  return (expenses || []).filter(e => e.type !== 'settle').filter(e => { const d = expDate(e); return d >= from && d < to; });
}
const total = list => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
function monthRange(d = new Date(), offset = 0) {
  return [new Date(d.getFullYear(), d.getMonth() + offset, 1), new Date(d.getFullYear(), d.getMonth() + offset + 1, 1)];
}
// Lo que se gastó este mes en las categorías de un presupuesto
function budgetSpent(b, expenses = S.expenses) {
  const [from, to] = monthRange();
  const cats = new Set(b.categories || []);
  return total(spending(expenses, from, to).filter(e => !cats.size || cats.has(e.category)));
}
// Cobro pendiente entre dos personas (de quien cobra a quien debe)
const pendingRequest = (fromUid, toUid) => S.requests.find(r => r.status === 'pending' && r.fromUid === fromUid && r.toUid === toUid) || null;

// ───────────────────────── personalidad del grupo (diseño final) ─────────────────────────
const THEMES = [
  { id: 'violet', bg: '#EEE7FC', ink: '#6C49B7', accent: '#6941F5' },
  { id: 'mint', bg: '#E1F1E9', ink: '#377761', accent: '#28765A' },
  { id: 'rose', bg: '#F9E3ED', ink: '#A65B7B', accent: '#AC4775' },
  { id: 'peach', bg: '#FFF0DF', ink: '#956332', accent: '#A75B2C' },
  { id: 'lime', bg: '#EFF5D8', ink: '#667D2D', accent: '#627D29' },
  { id: 'blue', bg: '#E5EDFD', ink: '#4C6FAD', accent: '#3865B8' },
];
const COVERS = ['waves', 'orbit', 'blocks'];
const GROUP_EMOJIS = ['✨', '🏡', '✈️', '🍸', '🏖️', '🎮', '🌿', '☕'];
const themeFor = g => THEMES.find(x => x.id === (g && g.theme)) || THEMES[0];
const cover = g => `<span class="abstract-cover cover-${COVERS.includes(g && g.cover) ? g.cover : 'waves'}" aria-hidden="true"><i></i><i></i><i></i></span>`;
function applyGroupTheme(el = $('#app')) {
  const th = themeFor(S.group);
  [el, $('.sheet')].forEach(x => {
    if (!x) return;
    x.style.setProperty('--group-accent', th.accent);
    x.style.setProperty('--group-soft', th.bg);
    x.style.setProperty('--group-ink', th.ink);
  });
}
const groupContext = () => S.group ? `<span class="group-context-badge"><span aria-hidden="true">${esc(S.group.emoji || '✨')}</span>${esc(S.group.name)}</span>` : '';
const canAnimate = () => S.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reparto al centavo para mostrar (el total siempre cuadra): [{uid, amount}]
function allocateShares(amount, uids) {
  const cents = Math.round((Number.isFinite(amount) ? amount : 0) * 100);
  const base = uids.length ? Math.floor(cents / uids.length) : 0, rest = uids.length ? cents % uids.length : 0;
  return uids.map((u, i) => ({ uid: u, amount: (base + (i < rest ? 1 : 0)) / 100 }));
}
// Colores de la dona y de los detalles por categoría (por orden de tamaño)
const CHART_COLORS = ['#6941F5', '#A88DE6', '#B8D753', '#E4A5C5', '#8EAFE6', '#E8B77D', '#5FAE8E', '#C7B4F2'];
const CHART_SOFT = ['#EEE7FC', '#EFE8FB', '#EDF4D9', '#F8E5EE', '#E7EEFC', '#FFF0DF', '#E1F1E9', '#F3EDFD'];

// ───────────────────────── imágenes ─────────────────────────
function downscaleImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const k = Math.min(1, maxSide / Math.max(w, h));
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}
