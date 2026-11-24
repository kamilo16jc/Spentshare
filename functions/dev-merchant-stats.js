// SOLO EMULADOR (nunca se despliega): estadísticas de comercios para armar el catálogo
// de logos de la app. Corre el emulador de funciones contra el proyecto real (solo lectura):
//   firebase emulators:exec --only functions --project spendshare-ed3fa "node tools/merchant-stats.mjs"
// Devuelve solo conteos por comercio / descripción / categoría (nada de montos ni personas).
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// SOLO EMULADOR: estado de lo automático (gastos fijos, gastos que anotaron, cobros automáticos)
// para diagnosticar. Solo lectura.
exports.devAutoStatus = onRequest({ region: 'us-east1' }, async (req, res) => {
  const db = admin.firestore();
  const ts = v => (v && v.toDate ? v.toDate().toISOString() : v || null);
  const [rules, allExp, acs, reqs] = await Promise.all([
    db.collectionGroup('recurring').get(),
    db.collectionGroup('expenses').get(),
    db.collectionGroup('autoCharges').get(),
    db.collectionGroup('paymentRequests').get(),
  ]);
  const since = Date.now() - 3 * 86400000;
  const recent = d => { const c = d.data().createdAt; return c && c.toMillis && c.toMillis() > since; };
  const recExp = { docs: allExp.docs.filter(d => d.data().recurringId || recent(d)) };
  const autoReqs = { docs: reqs.docs.filter(d => d.data().auto || recent(d)) };
  const groups = {};
  for (const d of [...rules.docs, ...recExp.docs, ...acs.docs]) {
    const g = d.ref.parent.parent.id;
    if (!groups[g]) { const gd = (await db.doc(`groups/${g}`).get()).data() || {}; groups[g] = { name: gd.name, members: gd.memberUids || [], currency: gd.currency }; }
  }
  res.json({
    groups,
    rules: await Promise.all(rules.docs.map(async d => {
      const r = d.data(), g = d.ref.parent.parent.id, dev = global.__ssDev;
      // cuánto le debe hoy cada participante a quien paga (lo que el cobro puede pedir como máximo)
      let owes = null;
      if (dev && groups[g]) { const ex = await dev.loadExpenses(g); owes = {}; (r.splitUids || []).filter(u => u !== r.payerUid).forEach(u => { owes[u] = Math.round(dev.pairNet(ex, u, r.payerUid, groups[g].members) * 100) / 100; }); }
      return { id: d.id, group: g, description: r.description, amount: r.amount, payerUid: r.payerUid, createdByUid: r.createdByUid, splitUids: r.splitUids, sendCharge: r.sendCharge, active: r.active, frequency: r.frequency, day: r.day, merchantId: r.merchantId || null, nextRunAt: ts(r.nextRunAt), lastRunAt: ts(r.lastRunAt), runs: r.runs, createdAt: ts(r.createdAt), owes };
    })),
    recurringExpenses: recExp.docs.map(d => { const e = d.data(); return { id: d.id, group: d.ref.parent.parent.id, description: e.description, amount: e.amount, paidByUid: e.paidByUid, createdByUid: e.createdByUid, splitUids: e.splitUids, split: e.split, splitWithUid: e.splitWithUid || null, notify: e.notify, type: e.type, recurringId: e.recurringId || null, requestId: e.requestId || null, createdAt: ts(e.createdAt), spentAt: ts(e.spentAt), merchant: e.merchant || null }; }),
    autoCharges: acs.docs.map(d => { const a = d.data(); return { uid: d.id, group: d.ref.parent.parent.id, enabled: a.enabled, mode: a.mode || 'balance', recurringIds: a.recurringIds || [], frequency: a.frequency, day: a.day, lastRunKey: a.lastRunKey || null }; }),
    autoRequests: autoReqs.docs.map(d => { const r = d.data(); return { id: d.id, group: d.ref.parent.parent.id, number: r.number, fromUid: r.fromUid, toUid: r.toUid, amount: r.amount, status: r.status, auto: !!r.auto, scope: r.scope || null, about: r.about || null, createdAt: ts(r.createdAt), items: (r.items || []).length }; }),
    people: await (async () => {
      const uids = [...new Set(Object.values(groups).flatMap(g => g.members))];
      const out = {};
      for (const u of uids) { const p = (await db.doc(`users/${u}`).get()).data() || {}; out[u] = { name: p.name || '', hasEmail: !!p.email, lang: p.lang || null }; }
      return out;
    })(),
  });
});

exports.devMerchantStats = onRequest({ region: 'us-east1' }, async (req, res) => {
  const db = admin.firestore();
  const [cacheSnap, expSnap] = await Promise.all([
    db.collection('aiCache').get(),
    db.collectionGroup('expenses').select('description', 'category', 'logoDomain', 'merchant', 'type').get(),
  ]);
  const cache = {};
  cacheSnap.forEach(d => { cache[d.id] = d.data(); });

  const byDesc = {}, byMerchant = {}, byCat = {};
  let expenses = 0, settles = 0;
  expSnap.forEach(d => {
    const e = d.data();
    if (e.type === 'settle') { settles++; return; }
    expenses++;
    const key = norm(e.description);
    const c = cache[key] || {};
    const domain = (e.logoDomain || c.domain || '').toLowerCase();
    const merchant = e.merchant || c.merchant || '';
    const cat = e.category || c.category || 'other';
    byCat[cat] = (byCat[cat] || 0) + 1;
    const dd = byDesc[key] = byDesc[key] || { key, text: String(e.description || '').slice(0, 60), count: 0, merchant, domain, category: cat };
    dd.count++;
    if (domain || merchant) {
      const mk = domain || norm(merchant);
      const m = byMerchant[mk] = byMerchant[mk] || { merchant, domain, count: 0, categories: {}, descriptions: {} };
      m.count++;
      m.categories[cat] = (m.categories[cat] || 0) + 1;
      m.descriptions[key] = (m.descriptions[key] || 0) + 1;
    }
  });
  const sort = o => Object.values(o).sort((a, b) => b.count - a.count);
  res.json({
    totals: { expenses, settles, aiCache: cacheSnap.size, distinctDescriptions: Object.keys(byDesc).length, merchants: Object.keys(byMerchant).length },
    byCategory: byCat,
    merchants: sort(byMerchant).map(m => ({ ...m, descriptions: Object.entries(m.descriptions).sort((a, b) => b[1] - a[1]).slice(0, 8) })),
    descriptions: sort(byDesc).slice(0, 150),
    aiCache: Object.entries(cache).map(([k, v]) => ({ key: k, merchant: v.merchant || '', domain: v.domain || '', category: v.category || '', emoji: v.emoji || '' })),
  });
});
