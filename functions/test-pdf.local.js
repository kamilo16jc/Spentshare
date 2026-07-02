// Local-only harness: renders buildMonthlyPdf with sample data → test-output.pdf
// Run: node test-pdf.local.js   (not deployed; mocks firebase deps)
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  + '\nmodule.exports.__test = { buildMonthlyPdf };';

const mocks = {
  'firebase-functions/v2/firestore': { onDocumentCreated: () => ({}), onDocumentDeleted: () => ({}) },
  'firebase-functions/v2/scheduler': { onSchedule: () => ({}) },
  'firebase-functions/v2/https': { onCall: () => ({}), HttpsError: class extends Error {} },
  'firebase-functions/params': { defineSecret: () => ({ value: () => '' }) },
  'firebase-functions/v2': { setGlobalOptions: () => {} },
  'firebase-admin': { initializeApp: () => {}, firestore: () => ({}) },
  'resend': { Resend: class {} },
};
const fakeRequire = (id) => mocks[id] || require(path.join(__dirname, 'node_modules', id));

const m = { exports: {} };
new Function('require', 'module', 'exports', src)(fakeRequire, m, m.exports);
const { buildMonthlyPdf } = m.exports.__test;

const members = [
  { uid: 'u1', name: 'Julián Agudelo 😎' },
  { uid: 'u2', name: 'María Peña' },
  { uid: 'u3', name: 'Camilo' },
];
const expenses = [
  { amount: 152.5, description: '🛒 Groceries at Walmart', category: 'food', paidByUid: 'u1', split: 'all' },
  { amount: 89000, description: 'Uber al aeropuerto ✈️', category: 'transport', paidByUid: 'u2', split: 'two', splitWithUid: 'u1' },
  { amount: 45, description: 'Netflix + Spotify', category: 'entertainment', paidByUid: 'u3', split: 'all' },
  { amount: 230, description: 'Cena cumpleaños de María 🎉🎂', category: 'food', paidByUid: 'u1', split: 'all' },
  { amount: 60, description: 'Farmacia — medicinas', category: 'health', paidByUid: 'u2', split: 'solo' },
  { amount: 15, description: 'Pago parcial', type: 'settle', paidByUid: 'u3', settledToUid: 'u1' },
];
const totals = { u1: 382.5, u2: 89060, u3: 45 };
const catTotals = { food: 382.5, transport: 89000, entertainment: 45, health: 60 };
const debts = [
  { from: { uid: 'u3', name: 'Camilo' }, to: { uid: 'u1', name: 'Julián Agudelo 😎' }, amount: 112.5 },
  { from: { uid: 'u2', name: 'María Peña' }, to: { uid: 'u1', name: 'Julián Agudelo 😎' }, amount: 43.17 },
];

buildMonthlyPdf({
  group: { id: 'g1', name: 'Casa Melrose 🏠', emoji: '🏠', currency: 'USD' },
  members, expenses, monthLabel: 'Junio 2026', totals, catTotals, debts,
}).then(buf => {
  fs.writeFileSync(path.join(__dirname, 'test-output.pdf'), buf);
  console.log('OK', buf.length, 'bytes');
}).catch(e => { console.error(e); process.exit(1); });
