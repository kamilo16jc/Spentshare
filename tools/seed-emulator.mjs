// SpentShare — seed the LOCAL Firebase emulators with test data.
//
//   firebase emulators:exec --project demo-spentshare --only auth,firestore,functions "node tools/seed-emulator.mjs"
//   (or, with the emulators already running:  node tools/seed-emulator.mjs)
//
// Only talks to the emulators (127.0.0.1) of the demo-spentshare project — "demo-" projects
// can never reach production. Re-runnable: it wipes the emulator's Auth + Firestore data and
// functions/.outbox/ first, then writes everything with fixed ids.
//
// Note: the expenses/settles below fire the onExpenseCreate trigger, so the outbox fills with
// their emails too (handy as previews).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Password for the 3 test users. Only valid on the local Auth emulator.
export const TEST_PASSWORD = 'ss-emu-gWJa2fVw';

export const PROJECT_ID = 'demo-spentshare';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'functions', 'package.json'));

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env[k])) {
    console.error(`Refusing to run: ${k}=${process.env[k]} is not a local emulator.`);
    process.exit(1);
  }
}

const admin = require('firebase-admin');
const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore(app);
const auth = admin.auth(app);
const { Timestamp } = admin.firestore;

// ───────────────────────── fixed data ─────────────────────────
export const USERS = {
  ana:    { uid: 'u_ana',    name: 'Ana Gómez',   email: 'ana@spentshare.test',    lang: 'en' },
  camilo: { uid: 'u_camilo', name: 'Camilo Ríos', email: 'camilo@spentshare.test', lang: 'es' },
  sara:   { uid: 'u_sara',   name: 'Sara Díaz',   email: 'sara@spentshare.test',   lang: 'es' },
};
export const GROUPS = { apto: 'g_apto302', trip: 'g_cartagena' };
const { ana, camilo, sara } = USERS;

// a day of the current month at hh:mm (America/Chicago-ish, local time of the machine)
function day(d, hh = 19, mm = 30) {
  const now = new Date();
  const dd = Math.min(d, now.getDate());
  return Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), dd, hh, mm));
}

const exp = (o) => ({ type: 'expense', category: 'other', ...o });
const by = (u) => ({ paidBy: u.name, paidByUid: u.uid });

const APTO_EXPENSES = {
  e01: exp({ amount: 1800, description: 'Arriendo noviembre', category: 'home', ...by(ana),
    splitUids: [ana.uid, camilo.uid, sara.uid], createdByUid: ana.uid, createdAt: day(1, 9, 10) }),
  e02: exp({ amount: 142.36, description: 'Mercado Walmart', category: 'food', ...by(camilo),
    split: 'all', createdByUid: camilo.uid, createdAt: day(3) }),
  e03: exp({ amount: 79.99, description: 'Internet Spectrum', category: 'utilities', ...by(sara),
    splitUids: [ana.uid, camilo.uid, sara.uid], createdByUid: sara.uid, createdAt: day(5, 8, 0) }),
  e04: exp({ amount: 38.5, description: 'Uber al aeropuerto', category: 'transport', ...by(ana),
    split: 'two', splitWith: camilo.name, splitWithUid: camilo.uid, createdByUid: ana.uid, createdAt: day(8, 6, 45) }),
  e05: exp({ amount: 96.4, description: 'Cena en Olive Garden', category: 'food', ...by(camilo),
    splitUids: [camilo.uid, sara.uid], createdByUid: camilo.uid, createdAt: day(10, 9, 0), spentAt: day(9, 21, 0) }),
  e06: exp({ amount: 22.99, description: 'Netflix', category: 'entertainment', ...by(sara),
    split: 'solo', createdByUid: sara.uid, createdAt: day(12) }),
  e07: exp({ amount: 31.2, description: 'Farmacia CVS', category: 'health', ...by(ana),
    split: 'full', splitWith: sara.name, splitWithUid: sara.uid, createdByUid: ana.uid, createdAt: day(14) }),
  e08: exp({ amount: 54.75, description: 'Productos de limpieza Target', category: 'home', ...by(sara),
    splitUids: [ana.uid, camilo.uid], createdByUid: sara.uid, createdAt: day(16, 17, 20) }),
  s01: { type: 'settle', amount: 300, description: 'Camilo le pagó a Ana', ...by(camilo),
    settledTo: ana.name, settledToUid: ana.uid, method: 'zelle', createdByUid: camilo.uid, createdAt: day(15, 12, 0) },
};

const TRIP_EXPENSES = {
  c01: exp({ amount: 1450000, description: 'Hotel Caribe', category: 'travel', ...by(camilo),
    splitUids: [ana.uid, camilo.uid], createdByUid: camilo.uid, createdAt: day(2, 15, 0) }),
  c02: exp({ amount: 380000, description: 'Lancha a Islas del Rosario', category: 'travel', ...by(ana),
    split: 'two', splitWith: camilo.name, splitWithUid: camilo.uid, createdByUid: ana.uid, createdAt: day(3, 8, 30) }),
  c03: exp({ amount: 265000, description: 'Cena en La Cevichería', category: 'food', ...by(camilo),
    splitUids: [ana.uid, camilo.uid], createdByUid: camilo.uid, createdAt: day(3, 21, 15) }),
  c04: exp({ amount: 35000, description: 'Taxi al centro histórico', category: 'transport', ...by(ana),
    split: 'full', splitWith: camilo.name, splitWithUid: camilo.uid, createdByUid: ana.uid, createdAt: day(4, 11, 0) }),
};

// ───────────────────────── run ─────────────────────────
async function clearEmulators() {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const r1 = await fetch(`http://${fsHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  const r2 = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  if (!r1.ok || !r2.ok) throw new Error(`Could not clear the emulators (${r1.status}/${r2.status}) — are they running?`);
  const outbox = path.join(ROOT, 'functions', '.outbox');
  fs.rmSync(outbox, { recursive: true, force: true });
}

async function seed() {
  await clearEmulators();

  for (const u of Object.values(USERS)) {
    await auth.createUser({ uid: u.uid, email: u.email, password: TEST_PASSWORD, displayName: u.name, emailVerified: true });
    await db.doc(`users/${u.uid}`).set({
      name: u.name, email: u.email, lang: u.lang, avatar: '', updatedAt: Timestamp.now(),
    });
  }

  const members3 = [ana, camilo, sara];
  await db.doc(`groups/${GROUPS.apto}`).set({
    name: 'Apartamento 302', emoji: '🏠', currency: 'USD',
    memberUids: members3.map((u) => u.uid), memberEmails: members3.map((u) => u.email),
    inviteCode: 'KM-7H4Q', createdBy: ana.uid, createdAt: day(1, 9, 0),
    theme: 'violet', cover: 'waves',
  });
  await db.doc(`groups/${GROUPS.apto}/members/${ana.uid}`).set({
    payMethods: [{ type: 'zelle', value: 'ana@spentshare.test' }, { type: 'venmo', value: '@ana-gomez' }],
    updatedAt: Timestamp.now(),
  });
  await db.doc(`groups/${GROUPS.apto}/budgets/b01`).set({
    name: 'Comida', categories: ['food', 'drinks'], amount: 600, emoji: '🛒', period: 'month',
    createdByUid: ana.uid, createdAt: day(1, 9, 30),
  });

  const members2 = [ana, camilo];
  await db.doc(`groups/${GROUPS.trip}`).set({
    name: 'Viaje a Cartagena', emoji: '🏖️', currency: 'COP',
    memberUids: members2.map((u) => u.uid), memberEmails: members2.map((u) => u.email),
    inviteCode: 'CT-9R2W', createdBy: camilo.uid, createdAt: day(2, 14, 0),
    theme: 'mint', cover: 'orbit',
  });
  await db.doc(`groups/${GROUPS.trip}/members/${camilo.uid}`).set({
    payMethods: [{ type: 'nequi', value: '300 555 0142' }, { type: 'breb', value: '@camilorios' }],
    updatedAt: Timestamp.now(),
  });

  // expenses last (they fire the email trigger)
  const batch = db.batch();
  Object.entries(APTO_EXPENSES).forEach(([id, e]) => batch.set(db.doc(`groups/${GROUPS.apto}/expenses/${id}`), e));
  Object.entries(TRIP_EXPENSES).forEach(([id, e]) => batch.set(db.doc(`groups/${GROUPS.trip}/expenses/${id}`), e));
  await batch.commit();

  console.log('\nSeeded the local emulators (project demo-spentshare):');
  console.log(`  Groups: "Apartamento 302" (${GROUPS.apto}, USD, ${Object.keys(APTO_EXPENSES).length} movements)`
    + ` · "Viaje a Cartagena" (${GROUPS.trip}, COP, ${Object.keys(TRIP_EXPENSES).length} expenses)`);
  console.log('  Logins (Auth emulator):');
  Object.values(USERS).forEach((u) => console.log(`    ${u.email.padEnd(24)} ${TEST_PASSWORD}   ${u.name} · lang ${u.lang}`));
  console.log('  Emulator UI: http://127.0.0.1:4000\n');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  seed().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
