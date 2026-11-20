// SpentShare — datos: Firestore, Auth y Cloud Functions.
// Todo lo que lee o guarda la app pasa por aquí; las pantallas solo leen S.
'use strict';

let groupUnsubs = [];
function stopGroupListeners() { groupUnsubs.forEach(u => { try { u(); } catch (e) {} }); groupUnsubs = []; }
const db = () => window._db;
const col = path => window._col(db(), path);
const ref = (...p) => window._docRef(db(), ...p);
const fn = async (name, data) => { const r = await window._callFn(name, data); return (r && r.data) || r; };

// ───────────────────────── sesión ─────────────────────────
async function loadMe() {
  const id = uid(); if (!id) return;
  try {
    const d = await window._getDoc(ref('users', id));
    S.me = { uid: id, email: S.user.email, name: S.user.displayName || '', ...(d.exists() ? d.data() : {}) };
  } catch (e) { S.me = { uid: id, email: S.user.email, name: S.user.displayName || '' }; }
  if (!S.me.name) S.me.name = (S.user.email || '').split('@')[0];
}

// ───────────────────────── grupos ─────────────────────────
async function loadGroups() {
  try {
    const snap = await window._getDocs(window._query(col('groups'), window._where('memberUids', 'array-contains', uid())));
    S.groups = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)));
  } catch (e) { console.error('loadGroups', e); S.groups = []; }
}

async function loadMembers(uids) {
  const docs = await Promise.all(uids.map(u => window._getDoc(ref('users', u)).catch(() => null)));
  const emails = (S.group && S.group.memberEmails) || [];
  return uids.map((u, i) => {
    const d = docs[i];
    if (d && d.exists()) return { uid: u, ...d.data() };
    const em = emails[i] || '';
    return { uid: u, name: em ? em.split('@')[0] : '?', email: em };
  });
}

// Abre un grupo y escucha en vivo: grupo, gastos, presupuestos, cobros y "Cómo me pagan"
function openGroup(gid) {
  stopGroupListeners();
  const g = S.groups.find(x => x.id === gid);
  if (!g) return;
  S.gid = gid; S.group = g;
  S.expenses = null; S.budgets = []; S.requests = []; S.meta = {}; S.members = [];
  S.act = { cat: 'all', person: 'all', query: '', period: 'all' };
  S.st = { period: 'month', bar: null };
  try { localStorage.setItem('ss_group', gid); } catch (e) {}
  let memberKey = '';
  groupUnsubs.push(window._onSnap(ref('groups', gid), snap => {
    if (!snap.exists()) { leftGroup(gid); return; }
    S.group = { id: gid, ...snap.data() };
    const i = S.groups.findIndex(x => x.id === gid); if (i >= 0) S.groups[i] = S.group;
    const key = (S.group.memberUids || []).join(',');
    if (key !== memberKey) {
      memberKey = key;
      loadMembers(S.group.memberUids || []).then(list => { if (S.gid === gid) { S.members = list; refresh(); } });
    }
    refresh();
  }, err => console.error('group listener', err)));
  groupUnsubs.push(window._onSnap(window._query(col(`groups/${gid}/expenses`), window._orderBy('createdAt', 'desc')), snap => {
    S.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    S.groupNets[gid] = netOf(uid(), S.expenses);
    refresh();
  }, err => { console.error('expenses listener', err); S.expenses = S.expenses || []; refresh(); }));
  groupUnsubs.push(window._onSnap(col(`groups/${gid}/budgets`), snap => {
    S.budgets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
    refresh();
  }, err => console.error('budgets listener', err)));
  groupUnsubs.push(window._onSnap(window._query(col(`groups/${gid}/paymentRequests`), window._where('status', '==', 'pending')), snap => {
    S.requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refresh();
  }, () => { S.requests = []; }));
  groupUnsubs.push(window._onSnap(col(`groups/${gid}/members`), snap => {
    S.meta = {}; snap.docs.forEach(d => { S.meta[d.id] = d.data(); });
    refresh();
  }, () => {}));
}

function leftGroup(gid) {
  S.groups = S.groups.filter(g => g.id !== gid);
  if (S.gid === gid) { stopGroupListeners(); S.gid = null; S.group = null; S.expenses = null; }
  try { if (localStorage.getItem('ss_group') === gid) localStorage.removeItem('ss_group'); } catch (e) {}
  go('groups');
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = n => Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
  return pick(2) + '-' + pick(4);
}

async function createGroupDoc({ name, emoji, currency, theme, cover: cv }) {
  const id = uid();
  const data = {
    name, emoji, currency, theme, cover: cv, memberUids: [id], memberEmails: [S.user.email],
    inviteCode: genCode(), createdBy: id, createdAt: window._srvTs(),
  };
  const r = await window._addDoc(col('groups'), data);
  S.groups.unshift({ id: r.id, ...data, createdAt: new Date() });
  await copyMyPayMethods(r.id);
  return r.id;
}

async function updateGroupDesign(gid, { name, emoji, theme, cover: cv }) {
  await window._setDoc(ref('groups', gid), { name, emoji, theme, cover: cv }, { merge: true });
}

async function findGroupByCode(code) {
  const snap = await window._getDocs(window._query(col('groups'), window._where('inviteCode', '==', String(code).trim().toUpperCase())));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function joinByCode(code) {
  const g = await findGroupByCode(code);
  if (!g) return null;
  if (!(g.memberUids || []).includes(uid())) {
    await window._setDoc(ref('groups', g.id), {
      memberUids: window._arrayUnion(uid()), memberEmails: window._arrayUnion(S.user.email),
    }, { merge: true });
    g.memberUids = [...(g.memberUids || []), uid()];
  }
  if (!S.groups.find(x => x.id === g.id)) S.groups.unshift(g);
  await copyMyPayMethods(g.id);
  return g;
}

async function deleteGroupDocs(gid) {
  for (const sub of ['expenses', 'budgets']) {
    const snap = await window._getDocs(col(`groups/${gid}/${sub}`));
    await Promise.all(snap.docs.map(d => window._delDoc(ref(`groups/${gid}/${sub}`, d.id))));
  }
  await window._delDoc(ref('groups', gid));
}

// Mi saldo en cada grupo (para la pantalla de grupos)
async function loadGroupNets() {
  await Promise.all(S.groups.map(async g => {
    if (g.id === S.gid && S.expenses) { S.groupNets[g.id] = netOf(uid(), S.expenses); return; }
    try {
      const snap = await window._getDocs(col(`groups/${g.id}/expenses`));
      const list = snap.docs.map(d => d.data());
      const net = pairNets(list, g.memberUids || []);
      S.groupNets[g.id] = round2(-Object.values(net[uid()] || {}).reduce((s, v) => s + v, 0));
    } catch (e) {}
  }));
}

// ───────────────────────── gastos y pagos ─────────────────────────
async function addExpenseDoc({ amount, description, category, payerUid, splitUids, date }) {
  const uids = memberUids();
  const set = new Set(splitUids);
  let split = 'custom', splitWithUid = null;
  if (splitUids.length === uids.length && uids.every(u => set.has(u))) split = 'all';
  else if (splitUids.length === 1 && splitUids[0] === payerUid) split = 'solo';
  else if (splitUids.length === 1) { split = 'full'; splitWithUid = splitUids[0]; }
  else if (splitUids.length === 2 && set.has(payerUid)) { split = 'two'; splitWithUid = splitUids.find(u => u !== payerUid); }
  const d = new Date(date || new Date()); if (!sameDay(d, new Date())) d.setHours(12, 0, 0, 0);
  const data = {
    type: 'expense', amount: round2(amount), description, category,
    paidBy: nameOf(payerUid), paidByUid: payerUid,
    split, splitWithUid, splitWith: splitWithUid ? nameOf(splitWithUid) : null, splitUids,
    createdByUid: uid(), createdAt: window._srvTs(), spentAt: window._Timestamp.fromDate(d),
  };
  // Si vino de un recibo escaneado o de la IA, el logo ya está: el servidor no repite la consulta
  const r = S.pendingReceipt;
  if (r && r.merchant && description === r.merchant) Object.assign(data, { logoDomain: r.logoDomain || '', logoEmoji: r.logoEmoji || '', merchant: r.merchant, aiEnriched: true });
  S.pendingReceipt = null;
  return window._addDoc(col(`groups/${S.gid}/expenses`), data);
}

// Pago: from le paga a to (normalmente from soy yo; "ya me pagó" lo registra quien recibe)
async function addSettleDoc({ fromUid, toUid, amount, method, requestId }) {
  const data = {
    type: 'settle', amount: round2(amount),
    description: t('settleDesc', firstName(nameOf(fromUid)), firstName(nameOf(toUid))),
    paidBy: nameOf(fromUid), paidByUid: fromUid, settledTo: nameOf(toUid), settledToUid: toUid,
    method: method || 'other', createdByUid: uid(), createdAt: window._srvTs(),
    spentAt: window._Timestamp.fromDate(new Date()),
  };
  if (requestId) data.requestId = requestId;
  return window._addDoc(col(`groups/${S.gid}/expenses`), data);
}

const deleteExpenseDoc = id => window._delDoc(ref(`groups/${S.gid}/expenses`, id));

// ───────────────────────── cobros ─────────────────────────
const sendRequest = (debtorUid, note, dueDays) => fn('sendPaymentRequest', { groupId: S.gid, debtorUid, note: note || '', dueDays });
const cancelRequest = requestId => fn('cancelPaymentRequest', { groupId: S.gid, requestId });

// Busca un cobro o un gasto por id en mis grupos (los enlaces del correo solo traen el id)
async function findInMyGroups(sub, id) {
  for (const g of S.groups) {
    try {
      const d = await window._getDoc(ref(`groups/${g.id}/${sub}`, id));
      if (d.exists()) return { gid: g.id, doc: { id: d.id, ...d.data() } };
    } catch (e) {}
  }
  return null;
}

// ───────────────────────── perfil ─────────────────────────
async function saveName(name) {
  await window._setDoc(ref('users', uid()), { name }, { merge: true });
  await window._setDisplayName(name).catch(() => {});
  S.me.name = name;
  const m = memberOf(uid()); if (m) m.name = name;
}
async function saveAvatar(dataUrl) {
  await window._setDoc(ref('users', uid()), { avatar: dataUrl }, { merge: true });
  S.me.avatar = dataUrl;
  const m = memberOf(uid()); if (m) m.avatar = dataUrl;
}

// "Cómo me pagan": se guarda en cada grupo (solo lo leen los miembros, por las reglas)
function myPayMethods() {
  const here = S.meta[uid()] && S.meta[uid()].payMethods;
  if (here) return here;
  try { return JSON.parse(localStorage.getItem('ss_pay') || '[]'); } catch (e) { return []; }
}
async function savePayMethods(list) {
  const clean = list.filter(m => m && PAY[m.type] && String(m.value || '').trim()).map(m => ({ type: m.type, value: String(m.value).trim() }));
  try { localStorage.setItem('ss_pay', JSON.stringify(clean)); } catch (e) {}
  await Promise.all(S.groups.map(g => window._setDoc(ref(`groups/${g.id}/members`, uid()), { payMethods: clean, updatedAt: window._srvTs() }, { merge: true })));
  if (S.gid) S.meta[uid()] = { ...(S.meta[uid()] || {}), payMethods: clean };
}
async function copyMyPayMethods(gid) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('ss_pay') || '[]'); } catch (e) {}
  if (!list.length) {
    for (const g of S.groups) {
      if (g.id === gid) continue;
      try { const d = await window._getDoc(ref(`groups/${g.id}/members`, uid())); if (d.exists() && (d.data().payMethods || []).length) { list = d.data().payMethods; break; } } catch (e) {}
    }
  }
  if (list.length) await window._setDoc(ref(`groups/${gid}/members`, uid()), { payMethods: list, updatedAt: window._srvTs() }, { merge: true }).catch(() => {});
}

// ───────────────────────── invitaciones ─────────────────────────
const sendInviteEmail = (email, note) => fn('sendGroupInvite', { groupId: S.gid, toEmail: email, note: note || '' });
function inviteLink(g = S.group) {
  const q = new URLSearchParams({ unirse: g.inviteCode || '', g: g.name || '', e: g.emoji || '', t: g.theme || 'violet', f: firstName(S.me && S.me.name), n: String((g.memberUids || []).length || 1) });
  return 'https://spentshare.com/?' + q.toString();
}

// ───────────────────────── IA (Claude, en el servidor) ─────────────────────────
const aiParseExpense = text => fn('parseExpense', { text, members: S.members.map(m => ({ uid: m.uid, name: m.name })), currency: cur() });
const aiScanReceipt = base64 => fn('scanReceipt', { imageBase64: base64, mediaType: 'image/jpeg' });
async function aiCreateBudget(text) {
  const d = await fn('parseBudget', { text, currency: cur() });
  if (!d || !d.found || !(d.amount > 0)) return null;
  await window._addDoc(col(`groups/${S.gid}/budgets`), {
    name: d.name, categories: d.categories || [], amount: d.amount, emoji: d.emoji || '',
    period: 'month', createdByUid: uid(), createdAt: window._srvTs(),
  });
  return d;
}
const deleteBudgetDoc = id => window._delDoc(ref(`groups/${S.gid}/budgets`, id));
