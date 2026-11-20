// SpentShare — end-to-end test of the automatic emails against the LOCAL emulators.
//
//   firebase emulators:exec --project demo-spentshare --only auth,firestore,functions \
//     "node tools/seed-emulator.mjs && node tools/test-emails.mjs"
//
// Writes expenses/settles with the admin SDK (the triggers fire), calls the callables over
// HTTP with real Auth-emulator ID tokens, then reads functions/.outbox/ (where sendMail puts
// every email under the emulator) and checks recipients, languages and subjects.
// Also checks a few Firestore rules through the emulator's REST API.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_PASSWORD, PROJECT_ID, USERS, GROUPS } from './seed-emulator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTBOX = path.join(ROOT, 'functions', '.outbox');
const require = createRequire(path.join(ROOT, 'functions', 'package.json'));
const admin = require('firebase-admin');
const db = admin.firestore(admin.app());   // initialized (emulator-only) by seed-emulator.mjs
const { FieldValue } = admin.firestore;

const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FN_HOST = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const REGION = 'us-east1';
const { ana, camilo, sara } = USERS;
const APTO = GROUPS.apto;
const TRIP = GROUPS.trip;

// ───────────────────────── tiny test kit ─────────────────────────
let passed = 0;
let failed = 0;
function check(cond, msg, detail) {
  if (cond) { passed++; console.log(`  PASS  ${msg}`); }
  else { failed++; console.log(`  FAIL  ${msg}${detail !== undefined ? `  ->  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
  return !!cond;
}
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 60000, every = 300 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

// outbox file -> {file, html, kind, to, subject, lang, ...meta}
function readOutbox() {
  if (!fs.existsSync(OUTBOX)) return [];
  return fs.readdirSync(OUTBOX).filter((f) => f.endsWith('.html')).sort().map((file) => {
    const html = fs.readFileSync(path.join(OUTBOX, file), 'utf8');
    const m = html.match(/^<!--\r?\n([\s\S]*?)\r?\n-->/);
    const meta = {};
    if (m) {
      m[1].split(/\r?\n/).forEach((line) => {
        const i = line.indexOf(':');
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
    }
    return { file, html, ...meta };
  });
}

// waits until `count` mails match, then a bit longer to make sure no extra one shows up
async function mails(filter, count, { settle = 2500 } = {}) {
  await waitFor(() => readOutbox().filter(filter).length >= count);
  await sleep(settle);
  return readOutbox().filter(filter);
}

async function signIn(email) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function callFn(name, data, token) {
  const r = await fetch(`http://${FN_HOST}/${PROJECT_ID}/${REGION}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, result: j.result, error: j.error };
}

// Firestore REST as a signed-in user (rules apply) -> HTTP status
async function fsRest(method, docPath, token, fields) {
  const r = await fetch(`http://${FS_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: fields ? JSON.stringify({ fields }) : undefined,
  });
  return r.status;
}

// Independent pairwise calc (splitUids + legacy split) to cross-check the functions
function owes(expenses, a, b, members) {
  let net = 0;
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (e.type === 'settle') {
      if (e.paidByUid === a && e.settledToUid === b) net -= amt;
      if (e.paidByUid === b && e.settledToUid === a) net += amt;
      continue;
    }
    const sh = {};
    if (Array.isArray(e.splitUids) && e.splitUids.length) e.splitUids.forEach((u) => { sh[u] = amt / e.splitUids.length; });
    else if (e.split === 'all') members.forEach((u) => { sh[u] = amt / members.length; });
    else if (e.split === 'two') { const p = e.splitWithUid || members.find((u) => u !== e.paidByUid); sh[p] = amt / 2; }
    else if (e.split === 'full' && e.splitWithUid) sh[e.splitWithUid] = amt;
    if (e.paidByUid === b && a !== b) net += sh[a] || 0;
    if (e.paidByUid === a && a !== b) net -= sh[b] || 0;
  }
  return Math.round(net * 100) / 100;
}
async function groupExpenses(groupId) {
  return (await db.collection(`groups/${groupId}/expenses`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
}

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toList = (ms) => ms.map((m) => `${m.to} [${m.lang}] ${m.subject}`);

// ───────────────────────── tests ─────────────────────────
async function main() {
  const t0 = Date.now();
  const tok = {
    ana: await signIn(ana.email),
    camilo: await signIn(camilo.email),
    sara: await signIn(sara.email),
  };

  section('Seed triggers (expenses + settle written by seed-emulator.mjs)');
  const s01 = await waitFor(async () => {
    const d = (await db.doc(`groups/${APTO}/expenses/s01`).get()).data();
    return d && d.receiptNo ? d : null;
  }, { timeout: 90000 });
  check(s01 && /^R-\d{4}-0001$/.test(s01.receiptNo), 'seed settle s01 got receipt number R-YYYY-0001', s01 && s01.receiptNo);
  const e01 = await mails((m) => m.kind === 'expense' && m.expense === 'e01', 2);
  check(e01.length === 2, 'e01 (rent, logged by Ana) -> 2 emails', toList(e01));
  check(!e01.some((m) => m.to === ana.email), 'e01: no email to Ana (who logged it)');
  const e06 = readOutbox().filter((m) => m.expense === 'e06');
  check(e06.length === 0, 'e06 (solo Netflix) -> no email');
  const s01m = await mails((m) => m.kind === 'receipt' && m.settle === 's01', 2);
  check(s01m.length === 2, 's01 -> receipts to payer + payee only', toList(s01m));

  section('New shared expense (splitUids, logged by the payer)');
  await db.doc(`groups/${APTO}/expenses/t_pizza`).set({
    type: 'expense', amount: 45.9, description: "Pizza Domino's", category: 'food',
    paidBy: camilo.name, paidByUid: camilo.uid, splitUids: [ana.uid, camilo.uid, sara.uid],
    createdByUid: camilo.uid, createdAt: FieldValue.serverTimestamp(),
  });
  const pz = await mails((m) => m.kind === 'expense' && m.expense === 't_pizza', 2);
  check(pz.length === 2, 'pizza -> 2 emails (Ana + Sara)', toList(pz));
  check(!pz.some((m) => m.to === camilo.email), 'pizza: none to Camilo (creator & payer)');
  const pzAna = pz.find((m) => m.to === ana.email);
  const pzSara = pz.find((m) => m.to === sara.email);
  check(pzAna && pzAna.lang === 'en' && pzAna.subject === "Camilo added “Pizza Domino's” · your share $15.30", 'Ana gets it in English with her share', pzAna && pzAna.subject);
  check(pzAna && /<html lang="en"/.test(pzAna.html) && pzAna.html.includes('between everyone (3)'), 'Ana: html lang=en, "between everyone (3)"');
  check(pzSara && pzSara.lang === 'es' && pzSara.subject === "Camilo agregó “Pizza Domino's” · tu parte $15.30", 'Sara gets it in Spanish', pzSara && pzSara.subject);

  section('Expense logged by someone else than the payer (payer gets the "you paid" email)');
  await db.doc(`groups/${APTO}/expenses/t_laundry`).set({
    type: 'expense', amount: 24, description: 'Lavandería', category: 'home',
    paidBy: sara.name, paidByUid: sara.uid, splitUids: [ana.uid, sara.uid],
    createdByUid: ana.uid, createdAt: FieldValue.serverTimestamp(),
  });
  const ld = await mails((m) => m.kind === 'expense' && m.expense === 't_laundry', 1);
  check(ld.length === 1 && ld[0].to === sara.email, 'laundry -> only Sara (payer); Ana logged it', toList(ld));
  check(ld[0] && ld[0].subject === 'Ana anotó “Lavandería”, que pagaste tú · te deben $12.00', 'Sara: payer subject in Spanish', ld[0] && ld[0].subject);

  section('Legacy split "full" + custom split (payer not included)');
  await db.doc(`groups/${APTO}/expenses/t_cinema`).set({
    type: 'expense', amount: 60, description: 'Entradas de cine', category: 'entertainment',
    paidBy: ana.name, paidByUid: ana.uid, split: 'full', splitWith: camilo.name, splitWithUid: camilo.uid,
    createdByUid: ana.uid, createdAt: FieldValue.serverTimestamp(),
  });
  const cn = await mails((m) => m.kind === 'expense' && m.expense === 't_cinema', 1);
  check(cn.length === 1 && cn[0].to === camilo.email && cn[0].lang === 'es', 'cinema (full) -> only Camilo, in Spanish', toList(cn));
  check(cn[0] && cn[0].subject.endsWith('tu parte $60.00') && cn[0].html.includes('todo a cargo de Camilo'), 'Camilo owes the whole $60', cn[0] && cn[0].subject);
  const e08 = readOutbox().filter((m) => m.expense === 'e08');
  check(e08.length === 2 && !e08.some((m) => m.to === sara.email), 'seed e08 (Sara paid for Ana+Camilo) -> Ana + Camilo only', toList(e08));
  const e08Ana = e08.find((m) => m.to === ana.email);
  const e08Cam = e08.find((m) => m.to === camilo.email);
  check(e08Ana && e08Ana.html.includes('between 2') && e08Cam && e08Cam.html.includes('entre 2'), 'custom split label: "between 2" (en) / "entre 2" (es)');

  section('sendPaymentRequest (Ana asks Camilo) — invoice to the debtor');
  const exp1 = await groupExpenses(APTO);
  const members = [ana.uid, camilo.uid, sara.uid];
  const expected = owes(exp1, camilo.uid, ana.uid, members);
  console.log(`  (independent calc: Camilo owes Ana ${money(expected)})`);
  const r1 = await callFn('sendPaymentRequest', { groupId: APTO, debtorUid: camilo.uid, note: 'Hola Cami, te paso lo de noviembre 🙌', dueDays: 7 }, tok.ana);
  check(r1.result && r1.result.ok, 'callable ok', r1.error || r1.result);
  const req1 = r1.result || {};
  check(/^F-\d{4}-0001$/.test(req1.number || ''), 'number F-YYYY-0001', req1.number);
  check(Math.abs((req1.amount || 0) - expected) < 0.011, `amount = real current debt (${money(expected)})`, req1.amount);
  check(req1.dueAt && Math.abs(new Date(req1.dueAt) - Date.now() - 7 * 86400000) < 120000, 'dueAt = now + 7 days', req1.dueAt);
  const inv1 = await mails((m) => m.kind === 'invoice' && m.request === req1.requestId, 1);
  check(inv1.length === 1 && inv1[0].to === camilo.email && inv1[0].lang === 'es', 'invoice -> Camilo, in Spanish', toList(inv1));
  check(inv1[0] && inv1[0].subject.startsWith(`Ana te envió un cobro de ${money(expected)} · vence el `), 'invoice subject', inv1[0] && inv1[0].subject);
  check(inv1[0] && inv1[0].html.includes(`?pagar=${req1.requestId}`), 'pay link uses the request doc id (?pagar=<id>)');
  check(inv1[0] && inv1[0].html.includes('venmo.com/ana-gomez') && inv1[0].html.includes('Zelle'), 'invoice shows Ana\'s pay methods (Venmo + Zelle)');
  const d1 = (await db.doc(`groups/${APTO}/paymentRequests/${req1.requestId}`).get()).data() || {};
  check(d1.status === 'pending' && d1.fromUid === ana.uid && d1.toUid === camilo.uid && d1.paidAmount === 0 && d1.currency === 'USD',
    'request doc: pending, from Ana to Camilo, paidAmount 0', { status: d1.status, paidAmount: d1.paidAmount });
  const itemIds = (d1.items || []).map((i) => `${i.expenseId}:${i.paidBy}`);
  check(JSON.stringify(itemIds) === JSON.stringify(['e01:from', 'e02:to', 'e04:from', 't_pizza:to', 't_cinema:from']),
    'items = expenses behind the debt (settles skipped)', itemIds);

  section('A new request to the same person cancels the pending one');
  const r2 = await callFn('sendPaymentRequest', { groupId: APTO, debtorUid: camilo.uid }, tok.ana);
  const req2 = r2.result || {};
  check(/^F-\d{4}-0002$/.test(req2.number || ''), 'second request F-YYYY-0002', r2.error || req2.number);
  const d1b = (await db.doc(`groups/${APTO}/paymentRequests/${req1.requestId}`).get()).data() || {};
  check(d1b.status === 'cancelled', 'first request is now cancelled', d1b.status);
  await mails((m) => m.kind === 'invoice' && m.request === req2.requestId, 1, { settle: 500 });
  const notCreditor = await callFn('cancelPaymentRequest', { groupId: APTO, requestId: req2.requestId }, tok.camilo);
  check(notCreditor.error && notCreditor.error.status === 'PERMISSION_DENIED', 'debtor cannot cancel it', notCreditor.error || notCreditor.result);

  section('Partial settle linked by requestId -> receipts (Camilo es / Ana en)');
  await db.doc(`groups/${APTO}/expenses/t_settle1`).set({
    type: 'settle', amount: 50, description: 'Abono', paidBy: camilo.name, paidByUid: camilo.uid,
    settledTo: ana.name, settledToUid: ana.uid, method: 'venmo', ...(req2.requestId ? { requestId: req2.requestId } : {}),
    createdByUid: camilo.uid, createdAt: FieldValue.serverTimestamp(),
  });
  const rc1 = await mails((m) => m.kind === 'receipt' && m.settle === 't_settle1', 2);
  const rcCam = rc1.find((m) => m.to === camilo.email);
  const rcAna = rc1.find((m) => m.to === ana.email);
  check(rc1.length === 2, 'two receipts (payer + payee), nobody else', toList(rc1));
  check(rcCam && rcCam.lang === 'es' && rcCam.viewer === 'payer' && rcCam.subject === 'Recibo: le pagaste $50.00 a Ana', 'Camilo (payer) in Spanish', rcCam && rcCam.subject);
  check(rcAna && rcAna.lang === 'en' && rcAna.viewer === 'payee' && /^Camilo paid you \$50\.00 · Receipt R-\d{4}-0002$/.test(rcAna.subject), 'Ana (payee) in English', rcAna && rcAna.subject);
  check(rcAna && rcAna.html.includes(req2.number) && rcAna.html.includes('PARTIAL') && rcAna.html.includes('Venmo'), 'receipt shows the request number, PARTIAL stamp, method');
  const st1 = (await db.doc(`groups/${APTO}/expenses/t_settle1`).get()).data() || {};
  check(/^R-\d{4}-0002$/.test(st1.receiptNo || ''), 'settle doc got receiptNo', st1.receiptNo);
  const d2 = (await db.doc(`groups/${APTO}/paymentRequests/${req2.requestId}`).get()).data() || {};
  check(d2.status === 'pending' && d2.paidAmount === 50 && (d2.settleIds || []).includes('t_settle1'), 'request: paidAmount 50, still pending', { status: d2.status, paidAmount: d2.paidAmount });

  section('Settle the rest WITHOUT requestId -> links to the latest pending request, marks it paid');
  const rest = Math.round((req2.amount - 50) * 100) / 100;
  await db.doc(`groups/${APTO}/expenses/t_settle2`).set({
    type: 'settle', amount: rest, description: 'Pago', paidBy: camilo.name, paidByUid: camilo.uid,
    settledTo: ana.name, settledToUid: ana.uid, method: 'zelle',
    createdByUid: camilo.uid, createdAt: FieldValue.serverTimestamp(),
  });
  const rc2 = await mails((m) => m.kind === 'receipt' && m.settle === 't_settle2', 2);
  check(rc2.length === 2, 'two receipts', toList(rc2));
  const rc2Ana = rc2.find((m) => m.to === ana.email);
  const rc2Cam = rc2.find((m) => m.to === camilo.email);
  check(rc2Ana && rc2Ana.html.includes('>PAID<') && rc2Ana.html.includes('all square'), 'Ana: PAID stamp, "all square"');
  check(rc2Cam && rc2Cam.html.includes('>PAGADO<') && rc2Cam.html.includes('están a mano'), 'Camilo: PAGADO stamp, "están a mano"');
  const st2 = (await db.doc(`groups/${APTO}/expenses/t_settle2`).get()).data() || {};
  check(st2.requestId === req2.requestId, 'settle doc got the linked requestId', st2.requestId);
  const d2b = (await db.doc(`groups/${APTO}/paymentRequests/${req2.requestId}`).get()).data() || {};
  check(d2b.status === 'paid' && d2b.paidAt && Math.abs(d2b.paidAmount - req2.amount) < 0.011, 'request is paid (paidAt set)', { status: d2b.status, paidAmount: d2b.paidAmount });
  const noDebt = await callFn('sendPaymentRequest', { groupId: APTO, debtorUid: camilo.uid }, tok.ana);
  check(noDebt.error && noDebt.error.status === 'FAILED_PRECONDITION' && noDebt.error.message === 'no-debt', 'asking again -> failed-precondition no-debt', noDebt.error || noDebt.result);

  section('COP invoice in English (Camilo asks Ana in "Viaje a Cartagena")');
  const tripExp = await groupExpenses(TRIP);
  const copExpected = owes(tripExp, ana.uid, camilo.uid, [ana.uid, camilo.uid]);
  const r3 = await callFn('sendPaymentRequest', { groupId: TRIP, debtorUid: ana.uid, dueDays: 99 }, tok.camilo);
  const req3 = r3.result || {};
  check(req3.ok && req3.amount === copExpected, `amount ${copExpected} COP`, r3.error || req3.amount);
  check(req3.dueAt && Math.abs(new Date(req3.dueAt) - Date.now() - 60 * 86400000) < 120000, 'dueDays clamped to 60');
  const inv3 = await mails((m) => m.kind === 'invoice' && m.request === req3.requestId, 1);
  const copFmt = '$' + String(copExpected).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  check(inv3[0] && inv3[0].to === ana.email && inv3[0].lang === 'en' && inv3[0].subject.startsWith(`Camilo sent you a payment request for ${copFmt}`), 'Ana gets it in English, COP format', inv3[0] && inv3[0].subject);
  check(inv3[0] && inv3[0].html.includes('Nequi') && inv3[0].html.includes('Copy details'), 'shows Camilo\'s Nequi / Bre-B with "Copy details"');
  const cancel3 = await callFn('cancelPaymentRequest', { groupId: TRIP, requestId: req3.requestId }, tok.camilo);
  const d3 = (await db.doc(`groups/${TRIP}/paymentRequests/${req3.requestId}`).get()).data() || {};
  check(cancel3.result && cancel3.result.ok && d3.status === 'cancelled', 'creditor cancels it', cancel3.error || d3.status);

  section('Overdue reminder (Ana asks Sara, due today)');
  const saraExpected = owes(await groupExpenses(APTO), sara.uid, ana.uid, members);
  const r4 = await callFn('sendPaymentRequest', { groupId: APTO, debtorUid: sara.uid, dueDays: 0, note: '¿Me pasas lo del arriendo?' }, tok.ana);
  const req4 = r4.result || {};
  check(req4.ok && Math.abs(req4.amount - saraExpected) < 0.011, `request to Sara for ${money(saraExpected)}`, r4.error || req4.amount);
  await mails((m) => m.kind === 'invoice' && m.request === req4.requestId, 1, { settle: 300 });
  const run1 = await callFn('devRunPaymentReminders', { now: new Date(Date.now() + 60000).toISOString() }, tok.ana);
  check(run1.result && run1.result.sent === 1, 'reminder run sends exactly 1', run1.error || run1.result);
  const rem = await mails((m) => m.kind === 'reminder', 1);
  check(rem.length === 1 && rem[0].to === sara.email && rem[0].lang === 'es', 'reminder -> Sara, in Spanish', toList(rem));
  check(rem[0] && rem[0].subject.startsWith(`Recordatorio · Ana te envió un cobro de ${money(saraExpected)}`), 'subject "Recordatorio · ..."', rem[0] && rem[0].subject);
  check(rem[0] && rem[0].html.includes('Ana te recuerda un cobro') && rem[0].html.includes('Vencido · venció el'), 'eyebrow + "Vencido · venció el ..." pill');
  const d4 = (await db.doc(`groups/${APTO}/paymentRequests/${req4.requestId}`).get()).data() || {};
  check(!!d4.remindedAt, 'remindedAt set');
  const run2 = await callFn('devRunPaymentReminders', { now: new Date(Date.now() + 60000).toISOString() }, tok.ana);
  check(run2.result && run2.result.sent === 0, 'second run sends nothing', run2.error || run2.result);

  section('sendGroupInvite (new look, language + isUser)');
  const inv = await callFn('sendGroupInvite', { groupId: TRIP, toEmail: 'Sara@SpentShare.test', note: '¡Vente al viaje!' }, tok.ana);
  check(inv.result && inv.result.ok && inv.result.isUser === true && inv.result.lang === 'es', 'existing user (Sara): isUser, her language es', inv.error || inv.result);
  const invNew = await callFn('sendGroupInvite', { groupId: TRIP, toEmail: 'nuevo.amigo@spentshare.test' }, tok.ana);
  check(invNew.result && invNew.result.ok && invNew.result.isUser === false && invNew.result.lang === 'en', 'new address: not a user, inviter\'s language (Ana: en)', invNew.error || invNew.result);
  const already = await callFn('sendGroupInvite', { groupId: TRIP, toEmail: camilo.email }, tok.ana);
  check(already.result && already.result.ok === false && already.result.reason === 'already-member', 'member -> already-member', already.error || already.result);
  const invMails = await mails((m) => m.kind === 'invite', 2);
  const invSara = invMails.find((m) => m.to.toLowerCase() === sara.email);
  const invNewM = invMails.find((m) => m.to === 'nuevo.amigo@spentshare.test');
  check(invMails.length === 2, 'two invite emails', toList(invMails));
  check(invSara && invSara.lang === 'es' && invSara.isUser === 'yes' && invSara.subject === 'Ana te invitó a “Viaje a Cartagena” en SpentShare'
    && invSara.html.includes('Toca el botón, inicia sesión') && invSara.html.includes('?unirse=CT-9R2W'), 'Sara: Spanish, "already have an account" wording, join link', invSara && invSara.subject);
  check(invNewM && invNewM.lang === 'en' && invNewM.isUser === 'no' && invNewM.subject === 'Ana invited you to “Viaje a Cartagena” on SpentShare'
    && invNewM.html.includes('If you don’t have an account yet'), 'new address: English, "create your account" wording', invNewM && invNewM.subject);

  section('Firestore rules (REST as signed-in users)');
  check(await fsRest('GET', `groups/${APTO}/paymentRequests/${req2.requestId}`, tok.camilo) === 200, 'member reads a payment request');
  check(await fsRest('PATCH', `groups/${APTO}/paymentRequests/hack`, tok.camilo, { amount: { integerValue: '1' } }) === 403, 'member cannot write paymentRequests');
  check(await fsRest('PATCH', `groups/${APTO}/members/${camilo.uid}`, tok.camilo, {
    payMethods: { arrayValue: { values: [{ mapValue: { fields: { type: { stringValue: 'zelle' }, value: { stringValue: 'camilo@spentshare.test' } } } }] } },
  }) === 200, 'member writes their own members/{uid}');
  check(await fsRest('PATCH', `groups/${APTO}/members/${ana.uid}`, tok.camilo, { payMethods: { arrayValue: {} } }) === 403, 'member cannot write someone else\'s members/{uid}');
  check(await fsRest('GET', `groups/${TRIP}/expenses/c01`, tok.sara) === 403, 'non-member cannot read expenses');
  check(await fsRest('PATCH', `groups/${TRIP}/budgets/hack`, tok.sara, { name: { stringValue: 'x' } }) === 403, 'non-member cannot write budgets');
  check(await fsRest('PATCH', `groups/${APTO}/budgets/b02`, tok.sara, { name: { stringValue: 'Ocio' } }) === 200, 'member writes budgets');
  check(await fsRest('GET', `groups/${TRIP}`, tok.sara) === 200, 'any signed-in user reads a group doc (join by code)');

  section('Outbox');
  const all = readOutbox();
  const byKind = all.reduce((o, m) => { o[m.kind] = (o[m.kind] || 0) + 1; return o; }, {});
  console.log(`  ${all.length} emails in functions/.outbox: ${JSON.stringify(byKind)}`);
  all.forEach((m) => console.log(`    ${m.kind.padEnd(8)} ${String(m.to).padEnd(28)} ${String(m.lang).padEnd(3)} ${m.subject}`));

  console.log(`\n${passed} passed, ${failed} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return failed;
}

main().then((f) => process.exit(f ? 1 : 0)).catch((err) => { console.error(err); process.exit(1); });
