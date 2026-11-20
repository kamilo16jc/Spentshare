// Revisa que cada t('clave') de la app exista en español y en inglés.
// Uso: node tools/check-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const files = ['core.js', 'data.js', 'views.js', 'sheets.js', 'app.js'].map(f => path.join(root, 'js', f));
const ctx = { localStorage: { getItem: () => null }, navigator: { language: 'es' }, document: { documentElement: {} }, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'i18n.js'), 'utf8') + '\nthis.TX = TX;', ctx);
const TX = ctx.TX;

const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
}
// claves armadas con variables
['cat.', 'method.', 'theme.', 'cover.', 'nav.'].forEach(() => {});
const dyn = [
  ...Object.keys(TX.es).filter(k => /^(cat|theme|cover|nav|method|pay\.ph)\./.test(k)),
];
dyn.forEach(k => used.add(k));
let bad = 0;
for (const k of [...used].sort()) {
  for (const l of ['es', 'en']) if (!(k in TX[l])) { console.log(`falta ${l}: ${k}`); bad++; }
}
const unused = Object.keys(TX.es).filter(k => !used.has(k));
console.log(`${used.size} claves usadas · ${bad} faltantes · ${unused.length} sin usar${unused.length ? ': ' + unused.join(', ') : ''}`);
const onlyEs = Object.keys(TX.es).filter(k => !(k in TX.en)), onlyEn = Object.keys(TX.en).filter(k => !(k in TX.es));
if (onlyEs.length || onlyEn.length) console.log('solo es:', onlyEs.join(', '), '| solo en:', onlyEn.join(', '));
process.exit(bad ? 1 : 0);
