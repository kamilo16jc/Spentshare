// SOLO EMULADOR (nunca se despliega): estadísticas de comercios para armar el catálogo
// de logos de la app. Corre el emulador de funciones contra el proyecto real (solo lectura):
//   firebase emulators:exec --only functions --project spendshare-ed3fa "node tools/merchant-stats.mjs"
// Devuelve solo conteos por comercio / descripción / categoría (nada de montos ni personas).
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

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
