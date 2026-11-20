// Pide las estadísticas de comercios al emulador de funciones (ver functions/dev-merchant-stats.js)
// y las guarda en el archivo que se pase como argumento.
import fs from 'node:fs';
const out = process.argv[2] || 'merchant-stats.json';
const r = await fetch('http://127.0.0.1:5001/spendshare-ed3fa/us-east1/devMerchantStats');
const text = await r.text();
if (!r.ok) { console.error('HTTP', r.status, text.slice(0, 500)); process.exit(1); }
fs.writeFileSync(out, text);
const j = JSON.parse(text);
console.log('totales', JSON.stringify(j.totals));
