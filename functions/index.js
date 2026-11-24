// Spentshare — Cloud Functions (emails via Resend, payment requests, AI helpers)
// Triggers:
//  - onExpenseCreate:  new expense -> "gasto compartido" email to each participant
//                      (not to whoever logged it); new settle -> receipt number,
//                      links the payment request it pays, receipt to payer + payee
//  - onExpenseDelete:  notify group members when someone deletes an expense
//  - monthlySummary:   scheduled on the 1st of each month, sends per-group PDF recap
//  - paymentReminders: daily, one reminder per overdue payment request
//  - autoBilling:      daily 08:00 Chicago — recurring fixed expenses (groups/{g}/recurring)
//                      and automatic periodic charges of the balance (groups/{g}/autoCharges)
// Callables:
//  - sendPaymentRequest / cancelPaymentRequest ("cobros"), sendGroupInvite
//  - enrichExpense / scanReceipt / parseExpense / parseBudget (Claude)
//
// Local testing: with the Firebase emulators (FUNCTIONS_EMULATOR === 'true') no email
// is sent and no AI is called — every email is written to functions/.outbox/ instead.

const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const emails = require('./emails/templates');
const merchants = require('./merchants');
const push = require('./push');                  // notificaciones al teléfono (Web Push)          // generated catalog (tools/build_merchants.py)
const billingDates = require('./billing-dates');   // Chicago calendar for autoBilling

admin.initializeApp();
const db = admin.firestore();
// (from the submodule: the emulator's proxied admin.firestore namespace lacks Timestamp)
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

setGlobalOptions({ region: 'us-east1', maxInstances: 10 });

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const FROM = 'SpentShare <noreply@spentshare.com>';
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const TIME_ZONE = 'America/Chicago';   // same zone the email templates use
const EPS = 0.01;                      // amounts below a cent count as zero

// Model used to categorize expenses & detect the store logo.
// claude-opus-5 is the default; for this high-volume classification task you
// can switch to 'claude-haiku-4-5' (much cheaper, plenty capable) if desired.
const AI_MODEL = 'claude-opus-5';

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

const CAT_EMOJI = {
  food: '🛒', transport: '🚗', utilities: '💡', health: '💊',
  entertainment: '🎬', home: '🏠', education: '📚', other: '📦',
  travel: '✈️', shopping: '👗', pets: '🐾', drinks: '🍺',
  personalcare: '💇', kids: '👶', gifts: '🎁',
};

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Category names for the PDF — the built-in PDF fonts (Helvetica) can't
// render emoji, they come out as garbage glyphs
const CAT_NAME_ES = {
  food: 'Comida', transport: 'Transporte', utilities: 'Servicios', health: 'Salud',
  entertainment: 'Ocio', home: 'Casa', education: 'Educación', other: 'Otro',
  travel: 'Viajes', shopping: 'Compras', pets: 'Mascotas', drinks: 'Bebidas',
  personalcare: 'Cuidado personal', kids: 'Niños', gifts: 'Regalos',
};

// Strip anything outside Latin-1 (emoji, symbols) — Helvetica only covers Latin-1.
// Keeps accents (á é ñ ü) intact.
function pdfSafe(s) {
  return String(s == null ? '' : s)
    .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^ -~À-ÿ¡¿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CURRENCIES = {
  USD: { symbol: '$', decimals: 2, thousandsSep: ',', decimalSep: '.' },
  COP: { symbol: '$', decimals: 0, thousandsSep: '.', decimalSep: ',' },
};

function fmtMoney(amount, code) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const n = Math.abs(Number(amount) || 0);
  const fixed = n.toFixed(c.decimals);
  const [intPart, decPart] = fixed.split('.');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousandsSep);
  return c.symbol + intFmt + (decPart ? c.decimalSep + decPart : '');
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Firestore Timestamp | Date | ISO string | millis -> Date (or null)
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000);
  return null;
}
const millis = (v) => { const d = toDate(v); return d ? d.getTime() : 0; };

// The date the user picked for the expense (spentAt), else when it was logged
function expenseDate(e) {
  return toDate(e.spentAt) || toDate(e.createdAt) || new Date();
}

function yearInTz(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric' }).format(date || new Date());
}

// 'R' + 2026 + 17 -> 'R-2026-0017'
function docNumber(prefix, date, n) {
  return `${prefix}-${yearInTz(date)}-${String(n).padStart(4, '0')}`;
}

// ───────────────────────────────────────────────────────────
// Shared debt calculation (emails, payment requests, monthly PDF)
//
// Balances are PAIRWISE (no debt simplification), same as the app:
//  - expense: every participant other than the payer owes their share to the payer
//      · NEW `splitUids`: uids that share the amount equally (payer may or may not be in it)
//      · legacy `split`: 'all' (every member, amount/memberCount), 'two' (splitWithUid or
//        first other member, half), 'full' (splitWithUid owes all), 'solo'/other (nobody)
//  - settle of X from P to R: what P owes R goes down by X
// ───────────────────────────────────────────────────────────

// splitUids -> the label the email uses
function splitTypeFor(uids, payer, members) {
  const set = new Set(uids);
  if (members.length && set.size === members.length && members.every((u) => set.has(u))) return 'all';
  if (set.size === 1) return set.has(payer) ? 'solo' : 'full';
  if (set.size === 2 && set.has(payer)) return 'two';
  return 'custom';
}

/**
 * Who takes part in an expense and how much each one's part is.
 * @returns {{payer: string|null, shares: Object<string, number>, splitType: string}}
 *   shares: uid -> share of EVERY participant (the payer too when they take part).
 *   Debts are the shares of everyone but the payer.
 */
function expenseShares(e, memberUids) {
  const amount = Number(e.amount) || 0;
  const payer = e.paidByUid || null;
  const members = memberUids || [];
  const shares = {};

  if (Array.isArray(e.splitUids) && e.splitUids.filter(Boolean).length) {
    const uids = [...new Set(e.splitUids.filter(Boolean))];
    const each = amount / uids.length;
    uids.forEach((u) => { shares[u] = each; });
    return { payer, shares, splitType: splitTypeFor(uids, payer, members) };
  }

  // Legacy docs — exactly like the app's old calc: the payer and the debtors must be members
  const solo = () => { if (payer) shares[payer] = amount; return { payer, shares, splitType: 'solo' }; };
  if (!payer || !members.includes(payer)) return solo();

  if (e.split === 'all') {
    const others = members.filter((u) => u !== payer);
    if (!others.length) return solo();
    const each = amount / (others.length + 1);
    shares[payer] = each;
    others.forEach((u) => { shares[u] = each; });
    return { payer, shares, splitType: 'all' };
  }
  if (e.split === 'two') {
    const partner = e.splitWithUid || members.find((u) => u !== payer);
    if (!partner || partner === payer || !members.includes(partner)) return solo();
    shares[payer] = amount / 2;
    shares[partner] = amount / 2;
    return { payer, shares, splitType: 'two' };
  }
  if (e.split === 'full') {
    const partner = e.splitWithUid;
    if (!partner || partner === payer || !members.includes(partner)) return solo();
    shares[partner] = amount;
    return { payer, shares, splitType: 'full' };
  }
  return solo();   // 'solo', legacy 'custom' without splitUids, missing split
}

// Debt edges of one movement: [{debtor, creditor, amount}] ("debtor owes creditor amount")
function debtEdges(e, memberUids) {
  const amount = Number(e.amount) || 0;
  if (e.type === 'settle') {
    // P paid R: P owes R less == R owes P more
    if (!e.paidByUid || !e.settledToUid || e.paidByUid === e.settledToUid || !amount) return [];
    return [{ debtor: e.settledToUid, creditor: e.paidByUid, amount }];
  }
  const { payer, shares } = expenseShares(e, memberUids);
  if (!payer) return [];
  return Object.keys(shares)
    .filter((u) => u !== payer && shares[u] > 0)
    .map((u) => ({ debtor: u, creditor: payer, amount: shares[u] }));
}

// How much one movement changes "a owes b" (negative: b owes a)
function pairContribution(e, a, b, memberUids) {
  let c = 0;
  debtEdges(e, memberUids).forEach((x) => {
    if (x.debtor === a && x.creditor === b) c += x.amount;
    else if (x.debtor === b && x.creditor === a) c -= x.amount;
  });
  return c;
}

// Net that a owes b over a list of movements (> 0: a owes b · < 0: b owes a)
function pairNet(expenses, a, b, memberUids) {
  return (expenses || []).reduce((s, e) => s + pairContribution(e, a, b, memberUids), 0);
}

// net[a][b] = what a owes b, only between the given members
function netMatrix(memberUids, expenses) {
  const net = {};
  memberUids.forEach((a) => { net[a] = {}; memberUids.forEach((b) => { net[a][b] = 0; }); });
  (expenses || []).forEach((e) => {
    debtEdges(e, memberUids).forEach((x) => {
      if (!net[x.debtor] || !net[x.creditor] || x.debtor === x.creditor) return;
      net[x.debtor][x.creditor] += x.amount;
      net[x.creditor][x.debtor] -= x.amount;
    });
  });
  return net;
}

// ───────────────────────────────────────────────────────────
// Data loading
// ───────────────────────────────────────────────────────────

async function loadGroup(groupId) {
  const snap = await db.doc(`groups/${groupId}`).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function loadExpenses(groupId) {
  const snap = await db.collection(`groups/${groupId}/expenses`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// uid -> {uid, name, email, lang}. hints: uid -> name written on the expense doc
async function loadPeople(group, uids, hints = {}) {
  const list = [...new Set((uids || []).filter(Boolean))];
  const snaps = list.length ? await db.getAll(...list.map((u) => db.doc(`users/${u}`))) : [];
  const memberUids = (group && group.memberUids) || [];
  const memberEmails = (group && group.memberEmails) || [];
  const out = {};
  list.forEach((uid, i) => {
    const d = snaps[i] && snaps[i].exists ? snaps[i].data() : {};
    const idx = memberUids.indexOf(uid);
    const email = String(d.email || (idx >= 0 ? memberEmails[idx] : '') || '').trim();
    const name = String(d.name || hints[uid] || (email ? email.split('@')[0] : '') || '?').trim();
    out[uid] = { uid, name, email, lang: emails.pickLang(d.lang) };
  });
  return out;
}

// "Cómo me pagan" of a member: groups/{g}/members/{uid}.payMethods
async function loadPayMethods(groupId, uid) {
  if (!uid) return [];
  const snap = await db.doc(`groups/${groupId}/members/${uid}`).get();
  const list = snap.exists ? snap.data().payMethods : null;
  return Array.isArray(list)
    ? list.filter((m) => m && typeof m.value === 'string' && m.value.trim())
      .map((m) => ({ type: String(m.type || 'other'), value: m.value.trim() }))
    : [];
}

// ───────────────────────────────────────────────────────────
// sendMail — EVERY email goes through here.
// Emulator: nothing is sent; the HTML lands in functions/.outbox/ (+ a log line).
// ───────────────────────────────────────────────────────────

function outboxComment(fields) {
  const clean = (v) => String(v == null ? '' : v).replace(/--/g, '- -').replace(/\r?\n/g, ' ');
  return `<!--\n${Object.entries(fields).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `  ${k}: ${clean(v)}`).join('\n')}\n-->\n`;
}

async function sendMail({ kind, to, subject, html, text, lang, attachments, meta }) {
  const recipients = (Array.isArray(to) ? to : [to])
    .filter((e) => typeof e === 'string' && e.includes('@'));
  if (!recipients.length) return { ok: false, reason: 'no-recipient' };

  if (IS_EMULATOR) {
    try {
      const dir = path.join(__dirname, '.outbox');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '');
      const slug = recipients[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      let base = `${stamp}-${kind}-${slug}`;
      for (let n = 2; fs.existsSync(path.join(dir, `${base}.html`)); n++) base = `${stamp}-${kind}-${slug}-${n}`;
      const files = (attachments || []).map((a) => {
        const name = `${base}-${String(a.filename || 'attachment').replace(/[^\w.-]+/g, '_')}`;
        fs.writeFileSync(path.join(dir, name), Buffer.from(a.content, 'base64'));
        return name;
      });
      const head = outboxComment({
        kind, to: recipients.join(', '), subject, lang, ...(meta || {}),
        attachments: files.join(', '),
      });
      fs.writeFileSync(path.join(dir, `${base}.html`), head + html, 'utf8');
      console.log(`[outbox] ${kind} -> ${recipients.join(', ')} [${lang || '-'}] "${subject}" (${base}.html)`);
      return { ok: true, file: `${base}.html` };
    } catch (err) {
      console.error('sendMail outbox error', err);
      return { ok: false, error: err };
    }
  }

  try {
    const resend = new Resend(RESEND_API_KEY.value());
    const res = await resend.emails.send({
      from: FROM, to: recipients, subject, html, text,
      reply_to: 'noreply@spentshare.com',
      ...(attachments && attachments.length ? { attachments } : {}),
    });
    if (res && res.error) {
      console.error(`sendMail ${kind} resend error`, res.error);
      return { ok: false, error: res.error };
    }
    return { ok: true, id: res && res.data && res.data.id };
  } catch (err) {
    console.error(`sendMail ${kind} error`, err);
    return { ok: false, error: err };
  }
}

// ───────────────────────────────────────────────────────────
// Trigger: onExpenseCreate (expenses AND settles)
// ───────────────────────────────────────────────────────────
exports.onExpenseCreate = onDocumentCreated(
  { document: 'groups/{groupId}/expenses/{expenseId}', secrets: [RESEND_API_KEY, push.VAPID_PRIVATE_KEY] },
  async (event) => {
    const snap = event.data;
    const data = snap && snap.data();
    if (!data) return;
    const { groupId, expenseId } = event.params;
    try {
      if (data.type === 'settle') await handleSettleCreated(groupId, expenseId, snap.ref, data);
      else await handleExpenseCreated(groupId, expenseId, data);
    } catch (err) {
      console.error(`onExpenseCreate ${groupId}/${expenseId} error`, err);
    }
  }
);

// New shared expense -> one email per participant (and the payer), never to who logged it
async function handleExpenseCreated(groupId, expenseId, data) {
  // notify:false = a recurring expense that sends its own charge; notifyUids = the participants who
  // can't be charged (they don't owe the payer) and still get the shared-expense email
  const onlyUids = data.notify === false ? (Array.isArray(data.notifyUids) ? data.notifyUids : []) : null;
  if (onlyUids && !onlyUids.length) return;
  const amount = Number(data.amount) || 0;
  const payerUid = data.paidByUid;
  if (!payerUid || !(amount > 0)) return;

  const group = await loadGroup(groupId);
  if (!group) return;
  const members = group.memberUids || [];
  const { shares, splitType } = expenseShares(data, members);
  const debtors = Object.keys(shares).filter((u) => u !== payerUid && shares[u] > 0);
  if (!debtors.length) return;   // solo: nobody owes anything

  const creatorUid = data.createdByUid || null;
  const recipientUids = [payerUid, ...debtors].filter((u) => u !== creatorUid && (!onlyUids || onlyUids.includes(u)));
  if (!recipientUids.length) return;

  const [people, expenses, payTo] = await Promise.all([
    loadPeople(group, [payerUid, ...debtors, creatorUid], { [payerUid]: data.paidBy }),
    loadExpenses(groupId),
    loadPayMethods(groupId, payerUid),
  ]);
  const others = expenses.filter((e) => e.id !== expenseId);   // "before" = without this expense
  const currency = group.currency || 'USD';
  const payer = people[payerUid];
  const addedBy = creatorUid && people[creatorUid] ? people[creatorUid] : payer;
  // payer row first (even with share 0), then everyone who owes a part
  const splits = [payerUid, ...debtors].map((u) => ({
    uid: u, name: people[u].name, share: round2(shares[u] || 0), isPayer: u === payerUid,
  }));

  for (const uid of recipientUids) {
    const p = people[uid];
    if (!p) continue;
    const T = push.pushText(p.lang);
    const owedToPayer = debtors.reduce((s, u) => s + (shares[u] || 0), 0);
    await push.sendPush(db, uid, {
      title: T.expense(push.firstName(addedBy.name), data.description || ''),
      body: uid === payerUid ? T.owedToYou(emails.fmtMoney(owedToPayer, currency), group.name || '') : T.yourShare(emails.fmtMoney(shares[uid] || 0, currency), group.name || ''),
      url: `./?gasto=${encodeURIComponent(expenseId)}`, tag: `exp-${expenseId}`,
    }, { kind: 'expense', group: groupId, expense: expenseId });
    if (!p.email) continue;
    const before = uid === payerUid ? 0 : pairNet(others, uid, payerUid, members);
    const after = uid === payerUid ? 0 : before + pairContribution(data, uid, payerUid, members);
    const mail = emails.renderExpense({
      lang: p.lang, currency, group: { name: group.name || '' }, expenseId,
      date: expenseDate(data), description: data.description || '', category: data.category || 'other',
      logo: logoUrlFor(data), note: noteOf(data),
      total: amount, paidBy: { name: payer.name, uid: payerUid }, addedBy: { name: addedBy.name },
      splitType,
      splits: splits.map((s) => ({ name: s.name, share: s.share, isPayer: s.isPayer, isYou: s.uid === uid })),
      balanceBefore: round2(before), balanceAfter: round2(after), payTo,
    });
    await sendMail({
      kind: 'expense', to: p.email, lang: mail.lang, ...mail,
      meta: { group: groupId, expense: expenseId, uid, viewer: uid === payerUid ? 'payer' : 'participant' },
    });
  }
}

// New settle -> receipt number (R-YYYY-NNNN), link to the payment request it pays,
// receipt to the payer and to the payee (nobody else)
async function handleSettleCreated(groupId, settleId, settleRef, data) {
  const payerUid = data.paidByUid;
  const payeeUid = data.settledToUid;
  const amount = Number(data.amount) || 0;
  if (!payerUid || !payeeUid || payerUid === payeeUid || !(amount > 0)) return;

  const groupRef = db.doc(`groups/${groupId}`);
  const reqCol = groupRef.collection('paymentRequests');
  const settleDate = toDate(data.createdAt) || new Date();

  // One transaction: receipt number + linking the request. Re-runs are safe:
  // an existing receiptNo is reused and a request already holding this settle isn't paid twice.
  const link = await db.runTransaction(async (tx) => {
    const [settleSnap, groupSnap] = await tx.getAll(settleRef, groupRef);
    if (!settleSnap.exists || !groupSnap.exists) return null;
    const s = settleSnap.data();
    const g = groupSnap.data();

    let reqSnap = null;
    if (s.requestId) {
      const r = await tx.get(reqCol.doc(String(s.requestId)));
      if (r.exists) {
        const rd = r.data();
        const already = (rd.settleIds || []).includes(settleId);
        if (already || (rd.status === 'pending' && rd.fromUid === payeeUid && rd.toUid === payerUid)) reqSnap = r;
      }
    }
    if (!reqSnap) {
      // most recent pending request from the payee to the payer
      const q = await tx.get(reqCol.where('fromUid', '==', payeeUid).where('toUid', '==', payerUid).where('status', '==', 'pending'));
      reqSnap = q.docs.sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt))[0] || null;
    }

    const settleUpdate = {};
    let receiptNo = s.receiptNo;
    if (!receiptNo) {
      const n = Number((g.seq && g.seq.receipt) || 0) + 1;
      receiptNo = docNumber('R', settleDate, n);
      tx.update(groupRef, { 'seq.receipt': n });
      settleUpdate.receiptNo = receiptNo;
    }

    let request = null;
    if (reqSnap) {
      const rd = reqSnap.data();
      request = { id: reqSnap.id, ...rd };
      if (!(rd.settleIds || []).includes(settleId)) {
        const paidAmount = round2(Number(rd.paidAmount || 0) + amount);
        const upd = { paidAmount, settleIds: FieldValue.arrayUnion(settleId) };
        if (paidAmount >= Number(rd.amount || 0) - EPS) {
          upd.status = 'paid';
          upd.paidAt = FieldValue.serverTimestamp();
        }
        tx.update(reqSnap.ref, upd);
        request.paidAmount = paidAmount;
        request.status = upd.status || rd.status;
      }
      if (s.requestId !== reqSnap.id) settleUpdate.requestId = reqSnap.id;
    }
    if (Object.keys(settleUpdate).length) tx.update(settleRef, settleUpdate);
    return { receiptNo, request, group: { id: groupId, ...g } };
  });
  if (!link) return;

  const group = link.group;
  const members = group.memberUids || [];
  const recorderUid = data.createdByUid || payerUid;
  const [people, expenses] = await Promise.all([
    loadPeople(group, [payerUid, payeeUid, recorderUid], { [payerUid]: data.paidBy, [payeeUid]: data.settledTo }),
    loadExpenses(groupId),
  ]);
  // what the payer owes the payee, before and after this payment
  const before = pairNet(expenses.filter((e) => e.id !== settleId), payerUid, payeeUid, members);
  const after = before - amount;
  const currency = group.currency || 'USD';

  if (recorderUid !== payeeUid && people[payeeUid]) {
    const T = push.pushText(people[payeeUid].lang);
    await push.sendPush(db, payeeUid, {
      title: T.paid(push.firstName(people[payerUid].name), emails.fmtMoney(amount, currency)),
      body: T.paidBody(group.name || ''), url: './', tag: `settle-${settleId}`,
    }, { kind: 'settle', group: groupId, settle: settleId });
  }
  for (const [viewer, uid] of [['payer', payerUid], ['payee', payeeUid]]) {
    const p = people[uid];
    if (!p || !p.email) continue;
    const mail = emails.renderReceipt({
      lang: p.lang, receiptNo: link.receiptNo, date: settleDate, currency, amount,
      group: { name: group.name || '' },
      payer: { name: people[payerUid].name }, payee: { name: people[payeeUid].name },
      recordedBy: { name: (people[recorderUid] || people[payerUid]).name },
      viewer, method: data.method || '',
      balanceBefore: round2(before), balanceAfter: round2(after),
      invoiceNo: link.request ? link.request.number : undefined,
    });
    await sendMail({
      kind: 'receipt', to: p.email, lang: mail.lang, ...mail,
      meta: { group: groupId, settle: settleId, uid, viewer, receiptNo: link.receiptNo, request: link.request ? link.request.id : '' },
    });
  }
}

// ───────────────────────────────────────────────────────────
// Old-style email shell (invite, delete, monthly summary)
// ───────────────────────────────────────────────────────────
async function getGroupRecipients(groupId, excludeUid) {
  const groupSnap = await db.doc(`groups/${groupId}`).get();
  if (!groupSnap.exists) return { group: null, recipients: [] };
  const group = { id: groupSnap.id, ...groupSnap.data() };
  const uids = group.memberUids || [];
  const emails = group.memberEmails || [];
  const recipients = [];
  uids.forEach((uid, i) => {
    if (uid === excludeUid) return;
    const email = emails[i];
    if (email && email.includes('@')) recipients.push(email);
  });
  return { group, recipients };
}

function baseEmailShell(innerHtml) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:20px;padding:32px 28px;box-shadow:0 4px 20px rgba(0,0,0,0.06)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#ff6b35,#f7931e);display:inline-flex;align-items:center;justify-content:center;font-size:20px">💰</div>
        <div style="font-size:20px;font-weight:900">Spent<span style="color:#ff6b35">Share</span></div>
      </div>
      ${innerHtml}
    </div>
    <div style="text-align:center;color:#aaa;font-size:11px;margin-top:16px">
      SpentShare · <a href="https://spentshare.com" style="color:#aaa">spentshare.com</a><br>
      Recibís este correo porque sos miembro del grupo.
    </div>
  </div>
</body></html>`;
}

// ───────────────────────────────────────────────────────────
// Trigger: onExpenseDelete
// ───────────────────────────────────────────────────────────
exports.onExpenseDelete = onDocumentDeleted(
  { document: 'groups/{groupId}/expenses/{expenseId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { groupId } = event.params;

    const { group, recipients } = await getGroupRecipients(groupId, null); // notify everyone
    if (!group || recipients.length === 0) return;

    const amount = Number(data.amount || 0);
    const catEmoji = CAT_EMOJI[data.category] || '📦';
    const paidBy = data.paidBy || 'Alguien';
    const isSettle = data.type === 'settle';
    const currency = group.currency || 'USD';
    const amtFmt = fmtMoney(amount, currency);

    const subject = `🗑️ Se eliminó un ${isSettle ? 'pago' : 'gasto'} en ${group.name}`;

    const html = baseEmailShell(`
      <div style="font-size:13px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">
        Registro eliminado
      </div>
      <div style="font-size:22px;font-weight:900;margin-bottom:18px">${group.emoji || '🏠'} ${group.name}</div>
      <div style="background:#fff5f5;border-radius:14px;padding:20px;margin-bottom:18px;border-left:4px solid #f56565">
        <div style="font-size:24px;font-weight:900;color:#f56565;text-decoration:line-through">${amtFmt} <span style="font-size:12px;color:#888;font-weight:600">${currency}</span></div>
        <div style="font-size:14px;margin-top:6px">${catEmoji} ${data.description || ''}</div>
        <div style="font-size:13px;color:#555;margin-top:10px">
          <strong>Había pagado:</strong> ${paidBy}
        </div>
      </div>
      <div style="font-size:13px;color:#555;line-height:1.5">
        Las deudas se recalcularon automáticamente. Revisá el grupo si querés ver el balance actualizado.
      </div>
      <br>
      <a href="https://spentshare.com" style="display:inline-block;background:#ff6b35;color:white;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:700;font-size:14px">
        Abrir SpentShare →
      </a>
    `);

    const text = `Se eliminó "${data.description}" (${amtFmt} ${currency}) de ${group.name}. Las deudas se recalcularon.`;

    await sendMail({ kind: 'deleted', to: recipients, subject, html, text, lang: 'es', meta: { group: groupId } });
  }
);

// ───────────────────────────────────────────────────────────
// PDF generation (in-memory buffer)
// ───────────────────────────────────────────────────────────
function buildMonthlyPdf({ group, members, expenses, monthLabel, totals, catTotals, debts }) {
  const currency = group.currency || 'USD';
  const fm = (n) => fmtMoney(n, currency);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const LEFT = 50, RIGHT_X = 380, RIGHT_W = 182, ROW_H = 18;

    const ensureSpace = (needed = ROW_H) => {
      if (doc.y + needed > 720) doc.addPage();
    };

    const sectionTitle = (txt) => {
      ensureSpace(40);
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text(txt, LEFT);
      const y = doc.y + 3;
      doc.moveTo(LEFT, y).lineTo(562, y).lineWidth(0.7).strokeColor('#e5ddd3').stroke();
      doc.y = y + 8;
    };

    // Two-column row: label left, amount right-aligned
    const row = (label, value, { valueColor = '#555', bold = false } = {}) => {
      ensureSpace();
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5)
        .fillColor('#1a1a2e')
        .text(label, LEFT, y, { width: 320, height: ROW_H, ellipsis: true, lineBreak: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5)
        .fillColor(valueColor)
        .text(value, RIGHT_X, y, { width: RIGHT_W, align: 'right', lineBreak: false });
      doc.y = y + ROW_H;
    };

    // ── Header ──
    doc.font('Helvetica-Bold').fontSize(26).fillColor('#ff6b35').text('SpentShare', LEFT, 50);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#1a1a2e').text(pdfSafe(group.name) || 'Grupo', LEFT);
    doc.font('Helvetica').fontSize(10).fillColor('#888')
      .text(`Resumen mensual - ${monthLabel} - Moneda: ${currency}`, LEFT);

    // ── Total box ──
    const total = expenses.filter(e => e.type !== 'settle').reduce((s, e) => s + Number(e.amount || 0), 0);
    doc.moveDown(1);
    const boxY = doc.y;
    doc.roundedRect(LEFT, boxY, 512, 64, 10).fillColor('#fff5f0').fill();
    doc.font('Helvetica').fontSize(9).fillColor('#888')
      .text('TOTAL DEL MES', LEFT + 18, boxY + 12, { characterSpacing: 1.5 });
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#ff6b35')
      .text(`${fm(total)} ${currency}`, LEFT + 18, boxY + 26);
    doc.font('Helvetica').fontSize(9).fillColor('#888')
      .text(`${expenses.length} movimientos registrados`, RIGHT_X - 60, boxY + 38, { width: RIGHT_W + 42, align: 'right' });
    doc.y = boxY + 74;

    // ── By member ──
    sectionTitle('Pagado por miembro');
    members.forEach(m => {
      const paid = totals[m.uid] || 0;
      const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
      row(pdfSafe(m.name) || '?', `${fm(paid)}  (${pct}%)`);
    });

    // ── By category ──
    sectionTitle('Por categoría');
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length === 0) {
      doc.font('Helvetica').fontSize(10.5).fillColor('#888').text('Sin datos', LEFT);
    } else {
      sortedCats.forEach(([cat, amt]) => {
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        row(CAT_NAME_ES[cat] || pdfSafe(cat) || 'Otro', `${fm(amt)}  (${pct}%)`);
      });
    }

    // ── Debts ──
    sectionTitle('Deudas pendientes');
    if (debts.length === 0) {
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#3ecf8e').text('Todas las cuentas al día', LEFT);
      doc.moveDown(0.3);
    } else {
      debts.forEach(d => {
        row(
          `${pdfSafe(d.from.name) || '?'}  le debe a  ${pdfSafe(d.to.name) || '?'}`,
          fm(d.amount),
          { valueColor: '#f56565', bold: true }
        );
      });
    }

    // ── Top 5 ──
    const top5 = [...expenses]
      .filter(e => e.type !== 'settle')
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 5);
    if (top5.length) {
      sectionTitle('Top 5 gastos del mes');
      top5.forEach((e, i) => {
        const cat = CAT_NAME_ES[e.category] ? ` - ${CAT_NAME_ES[e.category]}` : '';
        row(`${i + 1}. ${pdfSafe(e.description) || 'Gasto'}${cat}`, fm(Number(e.amount || 0)));
      });
    }

    // ── Footer ──
    doc.moveDown(2);
    ensureSpace(30);
    doc.font('Helvetica').fontSize(8.5).fillColor('#aaa')
      .text('Generado automáticamente por SpentShare - spentshare.com', LEFT, doc.y, { width: 512, align: 'center' });
    doc.end();
  });
}


function calcDebtsForMonth(members, expenses) {
  const uids = members.map(m => m.uid);
  const net = netMatrix(uids, expenses);
  const debts = [];
  const processed = new Set();
  members.forEach(a => members.forEach(b => {
    if (a.uid === b.uid) return;
    const key = [a.uid, b.uid].sort().join('-');
    if (processed.has(key)) return; processed.add(key);
    const owes = net[a.uid]?.[b.uid] || 0;
    if (Math.abs(owes) < 0.01) return;
    if (owes > 0) debts.push({ from: a, to: b, amount: owes });
    else          debts.push({ from: b, to: a, amount: -owes });
  }));
  return debts;
}


// ───────────────────────────────────────────────────────────
// Callable: sendGroupInvite — from the app's "Invite a friend" button
// {groupId, toEmail, note?}. The email's button goes to https://spentshare.com/?unirse=<code>
// ───────────────────────────────────────────────────────────

// users doc for an email (stored lowercase by the app; also tries the exact value)
async function findUserByEmail(email) {
  const raw = String(email || '').trim();
  const variants = [...new Set([raw.toLowerCase(), raw])].filter(Boolean);
  for (const v of variants) {
    const snap = await db.collection('users').where('email', '==', v).limit(1).get();
    if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}

exports.sendGroupInvite = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }
    const uid = request.auth.uid;
    const { groupId, note } = request.data || {};
    const toEmail = typeof (request.data || {}).toEmail === 'string' ? request.data.toEmail.trim() : '';
    if (!groupId || typeof groupId !== 'string' || !toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      throw new HttpsError('invalid-argument', 'groupId and valid toEmail required');
    }

    const group = await loadGroup(groupId);
    if (!group) {
      throw new HttpsError('not-found', 'Group not found');
    }
    const memberUids = group.memberUids || [];
    if (!memberUids.includes(uid)) {
      throw new HttpsError('permission-denied', 'Not a member of this group');
    }

    // Don't invite people who are already in the group
    const existingEmails = (group.memberEmails || []).map(e => (e || '').toLowerCase());
    if (existingEmails.includes(toEmail.toLowerCase())) {
      return { ok: false, reason: 'already-member' };
    }
    const invitee = await findUserByEmail(toEmail);
    if (invitee && memberUids.includes(invitee.uid)) {
      return { ok: false, reason: 'already-member' };
    }

    const people = await loadPeople(group, [uid, ...memberUids]);
    const inviterDoc = await db.doc(`users/${uid}`).get();
    const inviterLang = inviterDoc.exists ? inviterDoc.data().lang : null;
    const inviter = {
      name: people[uid].name !== '?' ? people[uid].name : (request.auth.token.email || 'SpentShare').split('@')[0],
      email: people[uid].email || request.auth.token.email || '',
    };
    // the language of who receives it if they already have an account, else the inviter's
    const lang = emails.pickLang(invitee && invitee.lang ? invitee.lang : inviterLang);

    const mail = emails.renderInvite({
      lang,
      inviter,
      group: { name: group.name || '', emoji: group.emoji || '', currency: group.currency || 'USD', theme: group.theme || 'violet' },
      members: memberUids.map((u) => ({ name: people[u].name })),
      code: group.inviteCode || '',
      note: typeof note === 'string' ? note.trim().slice(0, 300) : '',
      isUser: !!invitee,
    });

    const sent = await sendMail({
      kind: 'invite', to: toEmail, lang: mail.lang, ...mail,
      meta: { group: groupId, from: uid, isUser: invitee ? 'yes' : 'no', joinUrl: mail.joinUrl },
    });
    if (!sent.ok) throw new HttpsError('internal', 'Email send failed');
    return { ok: true, isUser: !!invitee, lang: mail.lang };
  }
);

// ───────────────────────────────────────────────────────────
// Scheduled: monthlySummary — 1st of each month, 09:00 local (America/Mexico_City)
// ───────────────────────────────────────────────────────────
exports.monthlySummary = onSchedule(
  {
    schedule: '0 9 1 * *',
    timeZone: 'America/Mexico_City',
    secrets: [RESEND_API_KEY],
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {

    // Previous month range
    const now = new Date();
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1); // first of this month
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthLabel = `${MONTHS_ES[prevMonthStart.getMonth()]} ${prevMonthStart.getFullYear()}`;

    const groupsSnap = await db.collection('groups').get();
    for (const gDoc of groupsSnap.docs) {
      try {
        const group = { id: gDoc.id, ...gDoc.data() };
        const memberUids = group.memberUids || [];
        const memberEmails = group.memberEmails || [];
        if (memberUids.length === 0) continue;

        const memberDocs = await Promise.all(memberUids.map(uid => db.doc(`users/${uid}`).get()));
        const members = memberUids.map((uid, i) => {
          const d = memberDocs[i];
          if (d.exists) return { uid, ...d.data() };
          const em = memberEmails[i] || '';
          return { uid, email: em, name: em ? em.split('@')[0] : 'Member' };
        });

        const expSnap = await db
          .collection(`groups/${group.id}/expenses`)
          .where('createdAt', '>=', prevMonthStart)
          .where('createdAt', '<', prevMonthEnd)
          .get();

        const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (expenses.length === 0) continue; // don't spam for empty months

        const totals = {};
        members.forEach(m => totals[m.uid] = 0);
        const catTotals = {};
        expenses.filter(e => e.type !== 'settle').forEach(e => {
          totals[e.paidByUid] = (totals[e.paidByUid] || 0) + Number(e.amount || 0);
          const c = e.category || 'other';
          catTotals[c] = (catTotals[c] || 0) + Number(e.amount || 0);
        });

        const debts = calcDebtsForMonth(members, expenses);

        const pdfBuffer = await buildMonthlyPdf({
          group, members, expenses, monthLabel, totals, catTotals, debts,
        });

        const recipients = memberEmails.filter(e => e && e.includes('@'));
        if (recipients.length === 0) continue;

        const total = expenses.filter(e => e.type !== 'settle').reduce((s, e) => s + Number(e.amount || 0), 0);
        const currency = group.currency || 'USD';
        const totalFmt = fmtMoney(total, currency);

        const html = baseEmailShell(`
          <div style="font-size:13px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">
            Resumen mensual
          </div>
          <div style="font-size:22px;font-weight:900;margin-bottom:4px">${group.emoji || '🏠'} ${group.name}</div>
          <div style="font-size:14px;color:#555;margin-bottom:20px">${monthLabel}</div>
          <div style="background:#f0fdf8;border-radius:14px;padding:20px;margin-bottom:18px;border-left:4px solid #3ecf8e">
            <div style="font-size:13px;color:#555">Total del mes</div>
            <div style="font-size:30px;font-weight:900;color:#1a1a2e">${totalFmt} <span style="font-size:13px;color:#888;font-weight:600">${currency}</span></div>
            <div style="font-size:13px;color:#555;margin-top:6px">${expenses.length} movimientos</div>
          </div>
          <div style="font-size:13px;color:#555;line-height:1.6">
            Adjuntamos un PDF con el detalle completo: gastos por miembro, por categoría, deudas pendientes y top 5 del mes.
          </div>
          <br>
          <a href="https://spentshare.com" style="display:inline-block;background:#ff6b35;color:white;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:700;font-size:14px">
            Abrir SpentShare →
          </a>
        `);

        await sendMail({
          kind: 'monthly',
          to: recipients,
          subject: `📈 Resumen de ${group.name} — ${monthLabel}`,
          html,
          text: `Resumen mensual de ${group.name} (${monthLabel}). Total: ${totalFmt} ${currency}. PDF adjunto.`,
          lang: 'es',
          meta: { group: group.id },
          attachments: [
            {
              filename: `spentshare-${group.id}-${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth()+1).padStart(2,'0')}.pdf`,
              content: pdfBuffer.toString('base64'),
            },
          ],
        });
      } catch (err) {
        console.error(`monthlySummary group ${gDoc.id} error`, err);
      }
    }
  }
);

// ───────────────────────────────────────────────────────────
// Payment requests ("cobros"): groups/{g}/paymentRequests/{r}
// Written ONLY here (admin SDK); the app just reads them.
// ───────────────────────────────────────────────────────────

/**
 * The expenses behind what `debtorUid` owes `creditorUid`: walks every movement in the
 * order it was logged, tracking the pair's running net, and keeps what happened after the
 * last moment the debtor owed nothing. Settles move the net but are not listed.
 *  - creditor paid, debtor takes part -> paidBy 'from', share = debtor's part
 *  - debtor paid, creditor takes part -> paidBy 'to',   share = creditor's part (a credit)
 */
function buildRequestItems(expenses, creditorUid, debtorUid, memberUids) {
  const sorted = (expenses || []).slice().sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
  let running = 0;
  let items = [];
  sorted.forEach((e) => {
    const c = pairContribution(e, debtorUid, creditorUid, memberUids);
    if (Math.abs(c) < 1e-9) return;
    running += c;
    if (e.type !== 'settle') {
      const { shares } = expenseShares(e, memberUids);
      const base = {
        expenseId: e.id, date: expenseDate(e), description: String(e.description || ''),
        category: e.category || 'other', logo: logoUrlFor(e), total: round2(e.amount),
      };
      if (e.paidByUid === creditorUid && shares[debtorUid] > 0) {
        items.push({ ...base, paidBy: 'from', share: round2(shares[debtorUid]) });
      } else if (e.paidByUid === debtorUid && shares[creditorUid] > 0) {
        items.push({ ...base, paidBy: 'to', share: round2(shares[creditorUid]) });
      }
    }
    if (running <= EPS) items = [];   // all square (or the other way round): start over
  });
  return items;
}

// What the scoped expenses alone add up to (to know if older debt was carried into the request)
function freshAmount(items, expenseIds) {
  const ids = new Set(expenseIds);
  return items.filter((i) => ids.has(i.expenseId)).reduce((s, i) => s + (i.paidBy === 'to' ? -i.share : i.share), 0);
}

// Items for a charge limited to some expenses (a fixed expense): what the debtor owes on each one
function buildScopedItems(expenses, expenseIds, creditorUid, debtorUid, memberUids) {
  const ids = new Set(expenseIds);
  return (expenses || []).filter((e) => ids.has(e.id) && e.type !== 'settle' && e.paidByUid === creditorUid).map((e) => {
    const { shares } = expenseShares(e, memberUids);
    return {
      expenseId: e.id, date: expenseDate(e), description: String(e.description || ''),
      category: e.category || 'other', logo: logoUrlFor(e), total: round2(e.amount),
      paidBy: 'from', share: round2(shares[debtorUid] || 0),
    };
  }).filter((i) => i.share > 0);
}

// Firestore items (Timestamps) -> template items (Dates)
function itemsForTemplate(items) {
  return (items || []).map((i) => ({ ...i, date: toDate(i.date) || new Date() }));
}

/**
 * Creates a payment request ("cobro") from `creditorUid` to `debtorUid` for what the
 * debtor owes right now, and emails the invoice to the debtor (in their language, with
 * the creditor's "Cómo me pagan"). Cancels the creditor's pending request to the same
 * debtor. Used by the sendPaymentRequest callable and by autoBilling (auto: true).
 * Throws HttpsError: not-found, permission-denied, invalid-argument, failed-precondition 'no-debt'.
 * @returns {{ok, requestId, number, amount, dueAt (ISO), emailed}}
 */
async function createPaymentRequest({ groupId, creditorUid, debtorUid, note, dueDays, auto = false, now = new Date(), scope = null }) {
  if (!groupId || typeof groupId !== 'string' || !debtorUid || typeof debtorUid !== 'string' || !creditorUid) {
    throw new HttpsError('invalid-argument', 'groupId and debtorUid required');
  }
  if (debtorUid === creditorUid) throw new HttpsError('invalid-argument', 'self-request');

  const groupRef = db.doc(`groups/${groupId}`);
  const group = await loadGroup(groupId);
  if (!group) throw new HttpsError('not-found', 'Group not found');
  const members = group.memberUids || [];
  if (!members.includes(creditorUid)) throw new HttpsError('permission-denied', 'Not a member of this group');
  if (!members.includes(debtorUid)) throw new HttpsError('invalid-argument', 'debtor-not-member');

  let days = Number(dueDays);
  if (dueDays == null || !Number.isFinite(days)) days = 7;
  days = Math.min(60, Math.max(0, Math.round(days)));
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';

  const expenses = await loadExpenses(groupId);
  const debt = round2(pairNet(expenses, debtorUid, creditorUid, members));
  if (debt < EPS) throw new HttpsError('failed-precondition', 'no-debt');
  let amount = debt;
  let items;
  const scoped = !!(scope && Array.isArray(scope.expenseIds) && scope.expenseIds.length);
  if (scoped) {
    // Charge for these expenses only (e.g. this month's Netflix), plus what is still unpaid on the
    // request it replaces (so nothing is lost when the old one is cancelled); never more than the debt.
    const pendingSnap = await groupRef.collection('paymentRequests')
      .where('fromUid', '==', creditorUid).where('toUid', '==', debtorUid).where('status', '==', 'pending').get();
    let carry = 0;
    const carried = [];
    pendingSnap.docs.forEach((d) => {
      const r = d.data();
      carry += Math.max(0, Number(r.amount || 0) - Number(r.paidAmount || 0));
      (r.items || []).forEach((i) => carried.push({ ...i, date: toDate(i.date) || now }));
    });
    const fresh = buildScopedItems(expenses, scope.expenseIds, creditorUid, debtorUid, members)
      .filter((i) => !carried.some((c) => c.expenseId === i.expenseId));
    const freshTotal = fresh.reduce((s, i) => s + (i.paidBy === 'to' ? -i.share : i.share), 0);
    items = [...carried, ...fresh];
    amount = round2(Math.min(debt, carry + freshTotal));
    if (amount < EPS) throw new HttpsError('failed-precondition', 'no-debt');
  } else {
    items = buildRequestItems(expenses, creditorUid, debtorUid, members);
  }
  // withPending: the request also carries what was still unpaid ("Netflix y lo pendiente")
  const about = scoped && scope.about && scope.about.name
    ? { name: String(scope.about.name).slice(0, 80), logo: String(scope.about.logo || ''), withPending: items.length > scope.expenseIds.length || amount > freshAmount(items, scope.expenseIds) + EPS } : null;

  const dueAt = new Date(now.getTime() + days * 86400000);
  const currency = group.currency || 'USD';
  const reqCol = groupRef.collection('paymentRequests');
  const newRef = reqCol.doc();

  // number + cancel the previous pending request(s) for this pair + the new doc, atomically
  const number = await db.runTransaction(async (tx) => {
    const g = await tx.get(groupRef);
    const pending = await tx.get(reqCol.where('fromUid', '==', creditorUid).where('toUid', '==', debtorUid).where('status', '==', 'pending'));
    const n = Number((((g.data() || {}).seq) || {}).request || 0) + 1;
    const num = docNumber('F', now, n);
    pending.docs.forEach((d) => tx.update(d.ref, { status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() }));
    tx.update(groupRef, { 'seq.request': n });
    tx.set(newRef, {
      number: num, fromUid: creditorUid, toUid: debtorUid, amount, currency, note: cleanNote,
      dueAt: Timestamp.fromDate(dueAt), createdAt: FieldValue.serverTimestamp(),
      status: 'pending', paidAmount: 0, paidAt: null, settleIds: [],
      items: items.map((i) => ({ ...i, date: Timestamp.fromDate(i.date) })),
      remindedAt: null,
      ...(auto ? { auto: true } : {}),
      ...(scoped ? { scope: 'fixed', expenseIds: scope.expenseIds.slice(0, 20) } : {}),
      ...(about ? { about } : {}),
    });
    return num;
  });

  const [people, payTo] = await Promise.all([
    loadPeople(group, [creditorUid, debtorUid]),
    loadPayMethods(groupId, creditorUid),
  ]);
  const creditor = people[creditorUid];
  const debtor = people[debtorUid];
  let emailed = false;
  if (debtor.email) {
    const mail = emails.renderInvoice({
      lang: debtor.lang, invoiceNo: number, requestId: newRef.id, issuedAt: now, dueAt,
      currency, group: { name: group.name || '' },
      from: { name: creditor.name, email: creditor.email }, to: { name: debtor.name },
      note: cleanNote, items, amount, payTo, auto: !!auto, about,
    });
    const sent = await sendMail({
      kind: 'invoice', to: debtor.email, lang: mail.lang, ...mail,
      meta: { group: groupId, request: newRef.id, number, uid: debtorUid, auto: auto ? 'yes' : '' },
    });
    emailed = !!sent.ok;
  }
  const T = push.pushText(debtor.lang);
  const amt = emails.fmtMoney(amount, currency);
  const aboutName = about ? (about.withPending ? emails.andPending(debtor.lang, about.name) : about.name) : '';
  await push.sendPush(db, debtorUid, {
    title: about ? T.requestAbout(push.firstName(creditor.name), aboutName, amt) : T.request(push.firstName(creditor.name), amt),
    body: T.due(group.name || '', push.shortDate(debtor.lang, dueAt)),
    url: `./?pagar=${encodeURIComponent(newRef.id)}`, tag: `req-${newRef.id}`,
  }, { kind: 'invoice', group: groupId, request: newRef.id, auto: auto ? 'yes' : '' });
  return { ok: true, requestId: newRef.id, number, amount, dueAt: dueAt.toISOString(), emailed };
}

// Callable: the creditor (caller) asks `debtorUid` for what they owe right now.
exports.sendPaymentRequest = onCall(
  { secrets: [RESEND_API_KEY, push.VAPID_PRIVATE_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    const { groupId, debtorUid, note, dueDays } = req.data || {};
    return createPaymentRequest({ groupId, creditorUid: req.auth.uid, debtorUid, note, dueDays });
  }
);

// Callable: only the creditor can cancel their own pending request
// Callable: "Enviar prueba" en el perfil — una notificación a todos mis teléfonos
exports.sendTestPush = onCall(
  { secrets: [push.VAPID_PRIVATE_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    const u = await db.doc(`users/${req.auth.uid}`).get();
    const T = push.pushText(emails.pickLang(u.exists ? u.data().lang : 'es'));
    return push.sendPush(db, req.auth.uid, { title: T.testTitle, body: T.testBody, url: './', tag: 'test' }, { kind: 'test' });
  },
);

exports.cancelPaymentRequest = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
  const { groupId, requestId } = req.data || {};
  if (!groupId || typeof groupId !== 'string' || !requestId || typeof requestId !== 'string') {
    throw new HttpsError('invalid-argument', 'groupId and requestId required');
  }
  const ref = db.doc(`groups/${groupId}/paymentRequests/${requestId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Request not found');
    const r = snap.data();
    if (r.fromUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Only who sent the request can cancel it');
    if (r.status === 'cancelled') return { ok: true, status: 'cancelled' };
    if (r.status !== 'pending') throw new HttpsError('failed-precondition', 'not-pending');
    tx.update(ref, { status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
    return { ok: true, status: 'cancelled' };
  });
});

// One reminder per overdue request: pending, dueAt <= now, not reminded yet.
// Uses the collection-group index paymentRequests (status ASC, dueAt ASC).
async function runPaymentReminders(now = new Date()) {
  const snap = await db.collectionGroup('paymentRequests')
    .where('status', '==', 'pending')
    .where('dueAt', '<=', Timestamp.fromDate(now))
    .get();
  const result = { checked: snap.size, sent: 0, skipped: 0, failed: 0 };
  for (const doc of snap.docs) {
    const r = doc.data();
    const remaining = round2(Number(r.amount || 0) - Number(r.paidAmount || 0));
    if (r.remindedAt || remaining < EPS) { result.skipped++; continue; }
    try {
      const groupId = doc.ref.parent.parent.id;
      const group = await loadGroup(groupId);
      if (!group) { result.skipped++; continue; }
      const [people, payTo] = await Promise.all([
        loadPeople(group, [r.fromUid, r.toUid]),
        loadPayMethods(groupId, r.fromUid),
      ]);
      const creditor = people[r.fromUid];
      const debtor = people[r.toUid];
      if (!debtor || !debtor.email) { result.skipped++; continue; }
      const mail = emails.renderInvoice({
        reminder: true,
        lang: debtor.lang, invoiceNo: r.number, requestId: doc.id,
        issuedAt: toDate(r.createdAt) || now, dueAt: toDate(r.dueAt),
        currency: r.currency || group.currency || 'USD', group: { name: group.name || '' },
        from: { name: creditor.name, email: creditor.email }, to: { name: debtor.name },
        note: r.note || '', items: itemsForTemplate(r.items), amount: remaining, payTo, auto: !!r.auto, about: r.about || null,
      });
      const sent = await sendMail({
        kind: 'reminder', to: debtor.email, lang: mail.lang, ...mail,
        meta: { group: groupId, request: doc.id, number: r.number, uid: r.toUid },
      });
      if (!sent.ok) { result.failed++; continue; }   // try again tomorrow
      const T = push.pushText(debtor.lang);
      await push.sendPush(db, r.toUid, {
        title: T.overdue(push.firstName(creditor.name)),
        body: T.overdueBody(emails.fmtMoney(remaining, r.currency || group.currency || 'USD'), group.name || ''),
        url: `./?pagar=${encodeURIComponent(doc.id)}`, tag: `req-${doc.id}`,
      }, { kind: 'reminder', group: groupId, request: doc.id });
      await doc.ref.update({ remindedAt: FieldValue.serverTimestamp() });
      result.sent++;
    } catch (err) {
      result.failed++;
      console.error(`paymentReminders ${doc.ref.path} error`, err);
    }
  }
  return result;
}

exports.paymentReminders = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'America/Chicago',
    secrets: [RESEND_API_KEY, push.VAPID_PRIVATE_KEY],
    timeoutSeconds: 300,
  },
  async () => {
    const result = await runPaymentReminders(new Date());
    console.log('paymentReminders', JSON.stringify(result));
  }
);

// Emulator only (never deployed): run the reminders now, from tools/test-emails.mjs
if (IS_EMULATOR) {
  exports.devRunPaymentReminders = onCall(async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    const at = req.data && req.data.now ? new Date(req.data.now) : new Date();
    return runPaymentReminders(isNaN(at) ? new Date() : at);
  });
}

// ───────────────────────────────────────────────────────────
// autoBilling — daily 08:00 America/Chicago
//  a) recurring fixed expenses:  groups/{g}/recurring/{id}         (active, nextRunAt <= now)
//  b) automatic balance charges: groups/{g}/autoCharges/{creditor} (enabled, due today)
// Recurring runs first, so today's fixed expense counts in the balances and the charges it
// sends count as "pending" for (b).
// ───────────────────────────────────────────────────────────

// Logo of what the expense is, for the emails: the app's own copy for catalog merchants
// (https://spentshare.com/logos/<id>.png); for a domain the AI found, Google's favicon (PNG).
// '' when there is nothing to show (the email falls back to the category color).
function logoUrlFor(e) {
  if (!e || e.type === 'settle') return '';
  const m = (e.logoDomain && merchants.byDomain(e.logoDomain)) || merchants.find(e.merchant || e.description || '');
  if (m && m.logo) return `https://spentshare.com/logos/${m.id}.png`;
  const domain = String(e.logoDomain || (m && m.domain) || '').trim().toLowerCase();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  return '';
}
// Optional comment on an expense (recurring expenses carry the rule's note)
const noteOf = (e) => (typeof (e && e.note) === 'string' ? e.note.trim().slice(0, 300) : '');

// Merchant-catalog fields for a description (no AI): null when the catalog doesn't know it
function catalogFields(description) {
  const m = merchants.find(description);
  if (!m) return null;
  return { merchant: m.name, logoDomain: m.domain || '', logoEmoji: m.emoji || '', cat: m.cat || null };
}

async function runRecurringRule(doc, now, result, getGroup) {
  const rule = doc.data();
  const ruleRef = doc.ref;
  const groupId = ruleRef.parent.parent.id;
  // a rule that can no longer run is switched off (active:false) instead of retried every day
  const deactivate = async (reason) => {
    result.deactivated++;
    console.warn(`autoBilling: recurring ${ruleRef.path} deactivated (${reason})`);
    await ruleRef.update({ active: false, deactivatedReason: reason }).catch(() => {});
  };
  const group = await getGroup(groupId);
  if (!group) return deactivate('group-deleted');
  const members = group.memberUids || [];
  const payerUid = rule.payerUid;
  if (!payerUid || !members.includes(payerUid)) return deactivate('payer-left');
  const splitUids = [...new Set((Array.isArray(rule.splitUids) ? rule.splitUids : []).filter((u) => members.includes(u)))];
  if (!splitUids.length) return deactivate('nobody-left');
  const amount = round2(rule.amount);
  const next = billingDates.nextOccurrence(rule, now);
  if (!(amount > 0) || !next) {
    result.skipped++;
    console.warn(`autoBilling: recurring ${ruleRef.path} skipped (invalid amount or frequency)`);
    return;
  }

  // one expense per occurrence: the id carries the occurrence's Chicago date
  const occurrence = toDate(rule.nextRunAt) || now;
  const expenseId = `rec_${doc.id}_${billingDates.compactKey(occurrence)}`;
  const expRef = db.doc(`groups/${groupId}/expenses/${expenseId}`);
  const people = await loadPeople(group, [payerUid, ...splitUids]);
  const splitType = splitTypeFor(splitUids, payerUid, members);
  const others = splitUids.filter((u) => u !== payerUid);
  const partner = splitType === 'two' || splitType === 'full' ? others[0] : null;
  const description = String(rule.description || '').trim().slice(0, 80) || 'Gasto fijo';
  // The payer's automatic request may be set to charge this fixed expense ("Gastos fijos" mode):
  // then each participant gets a request for their share of it (not the whole balance)
  const acSnap = await db.doc(`groups/${groupId}/autoCharges/${payerUid}`).get();
  const ac = acSnap.exists ? acSnap.data() : null;
  const viaAuto = !!(ac && ac.enabled === true && ac.mode === 'fixed' && Array.isArray(ac.recurringIds) && ac.recurringIds.includes(doc.id));

  // "¿De qué es?" (merchantId) wins; otherwise the catalog is matched by the description
  const picked = rule.merchantId ? merchants.LIST.find((m) => m.id === rule.merchantId) : null;
  const cat = picked
    ? { merchant: picked.name, logoDomain: picked.domain || '', logoEmoji: picked.emoji || '', cat: picked.cat || null }
    : catalogFields(description);
  const expense = {
    type: 'expense', amount, description,
    category: rule.category || (cat && cat.cat) || 'other',
    paidBy: people[payerUid].name, paidByUid: payerUid,
    splitUids, split: splitType,
    ...(partner ? { splitWithUid: partner, splitWith: people[partner].name } : {}),
    createdByUid: rule.createdByUid || payerUid,
    createdAt: FieldValue.serverTimestamp(),
    spentAt: Timestamp.fromDate(now),
    recurringId: doc.id,
    ...(noteOf(rule) ? { note: noteOf(rule) } : {}),
    notify: !(rule.sendCharge || viaAuto),   // with a charge, the invoice replaces the shared-expense email
    ...(cat ? { merchant: cat.merchant, logoDomain: cat.logoDomain, logoEmoji: cat.logoEmoji, aiEnriched: true } : {}),
  };
  // With a charge, the invoice replaces the shared-expense email — but only for who will actually
  // owe the payer after this expense. Someone the payer owes money to can't be charged (the share is
  // subtracted from what the payer owes them), so they get the usual shared-expense email instead of
  // nothing at all. (Bug of 22 Nov: Apple cloud in Zorras reached nobody.)
  if (rule.sendCharge || viaAuto) {
    const { shares: sh } = expenseShares(expense, members);
    const after = [...(await loadExpenses(groupId)), expense];
    const notifyUids = others.filter((u) => (sh[u] || 0) >= EPS && round2(pairNet(after, u, payerUid, members)) < EPS);
    if (notifyUids.length) expense.notifyUids = notifyUids;
  }

  // expense + advancing the rule in one transaction: retries never duplicate the expense
  const created = await db.runTransaction(async (tx) => {
    const [r, ex] = await tx.getAll(ruleRef, expRef);
    const rd = r.exists ? r.data() : null;
    if (!rd || rd.active !== true || millis(rd.nextRunAt) > now.getTime()) return null;   // changed meanwhile
    const advance = { nextRunAt: Timestamp.fromDate(next), lastRunAt: FieldValue.serverTimestamp() };
    if (ex.exists) {
      tx.update(ruleRef, advance);
      return false;
    }
    tx.update(ruleRef, { ...advance, runs: FieldValue.increment(1) });
    tx.create(expRef, expense);
    return true;
  });
  if (!created) { result.skipped++; return; }
  result.created++;

  if (viaAuto) {
    const { shares } = expenseShares(expense, members);
    const about = { name: description, logo: logoUrlFor(expense) };
    const acNote = typeof ac.note === 'string' && ac.note.trim() ? ac.note : noteOf(rule);
    for (const debtorUid of others) {
      if ((shares[debtorUid] || 0) < EPS) continue;   // the minimum only applies to whole-balance requests
      try {
        await createPaymentRequest({
          groupId, creditorUid: payerUid, debtorUid, note: acNote, dueDays: ac.dueDays, auto: true, now,
          scope: { expenseIds: [expenseId], about },
        });
        result.charges++;
      } catch (err) {
        if (err && err.message === 'no-debt') continue;   // already square with the payer
        result.failed++;
        console.error(`autoBilling: fixed charge for ${expRef.path} -> ${debtorUid} error`, err);
      }
    }
  } else if (rule.sendCharge) {
    const expenses = await loadExpenses(groupId);
    for (const debtorUid of others) {
      if (round2(pairNet(expenses, debtorUid, payerUid, members)) < EPS) continue;
      try {
        await createPaymentRequest({
          groupId, creditorUid: payerUid, debtorUid, note: noteOf(rule), dueDays: rule.dueDays, auto: true, now,
        });
        result.charges++;
      } catch (err) {
        result.failed++;
        console.error(`autoBilling: charge for ${expRef.path} -> ${debtorUid} error`, err);
      }
    }
  }
}

async function runAutoChargeSettings(doc, now, todayKey, result, getGroup) {
  const s = doc.data();
  const creditorUid = doc.id;   // doc id = the creditor's uid
  const groupId = doc.ref.parent.parent.id;
  const group = await getGroup(groupId);
  const members = group ? group.memberUids || [] : [];
  if (!group || !members.includes(creditorUid)) {
    // group deleted or the creditor left: switch it off
    result.deactivated++;
    console.warn(`autoBilling: autoCharges ${doc.ref.path} disabled (${group ? 'creditor-left' : 'group-deleted'})`);
    await doc.ref.update({ enabled: false }).catch(() => {});
    return;
  }
  if (s.mode === 'fixed') { result.fixedMode = (result.fixedMode || 0) + 1; return; }   // charged when each fixed expense is added
  if (!billingDates.isDueToday(s, now)) { result.notDue++; return; }
  if (s.lastRunKey === todayKey) { result.alreadyRan++; return; }

  const [expenses, pendingSnap] = await Promise.all([
    loadExpenses(groupId),
    db.collection(`groups/${groupId}/paymentRequests`)
      .where('fromUid', '==', creditorUid).where('status', '==', 'pending').get(),
  ]);
  const pendingTo = new Set(pendingSnap.docs.map((d) => d.data().toUid));
  const threshold = Math.max(Number(s.minAmount) || 0, EPS);
  for (const debtorUid of members) {
    if (debtorUid === creditorUid) continue;
    const debt = round2(pairNet(expenses, debtorUid, creditorUid, members));
    if (debt + 1e-9 < threshold) { if (debt >= EPS) result.belowMin++; continue; }
    if (pendingTo.has(debtorUid)) { result.hasPending++; continue; }
    try {
      await createPaymentRequest({
        groupId, creditorUid, debtorUid, note: s.note, dueDays: s.dueDays, auto: true, now,
      });
      result.requests++;
    } catch (err) {
      result.failed++;
      console.error(`autoBilling: auto charge ${doc.ref.path} -> ${debtorUid} error`, err);
    }
  }
  await doc.ref.set({ lastRunKey: todayKey, lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
  result.ran++;
}

async function runAutoBilling(now = new Date()) {
  const today = billingDates.dayKey(now);
  const recurring = { checked: 0, created: 0, skipped: 0, deactivated: 0, charges: 0, failed: 0 };
  const auto = { checked: 0, ran: 0, notDue: 0, alreadyRan: 0, requests: 0, belowMin: 0, hasPending: 0, deactivated: 0, failed: 0 };
  // group docs, read once per run (null = deleted)
  const groups = new Map();
  const getGroup = async (id) => {
    if (!groups.has(id)) groups.set(id, await loadGroup(id));
    return groups.get(id);
  };

  // index: recurring (active ASC, nextRunAt ASC), collection group
  const recSnap = await db.collectionGroup('recurring')
    .where('active', '==', true).where('nextRunAt', '<=', Timestamp.fromDate(now)).get();
  recurring.checked = recSnap.size;
  for (const doc of recSnap.docs) {
    try { await runRecurringRule(doc, now, recurring, getGroup); } catch (err) {
      recurring.failed++;
      console.error(`autoBilling: recurring ${doc.ref.path} error`, err);
    }
  }

  // index: autoCharges.enabled, collection-group scope (fieldOverrides)
  const autoSnap = await db.collectionGroup('autoCharges').where('enabled', '==', true).get();
  auto.checked = autoSnap.size;
  for (const doc of autoSnap.docs) {
    try { await runAutoChargeSettings(doc, now, today, auto, getGroup); } catch (err) {
      auto.failed++;
      console.error(`autoBilling: autoCharges ${doc.ref.path} error`, err);
    }
  }
  return { today, recurring, auto };
}

exports.autoBilling = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'America/Chicago',
    secrets: [RESEND_API_KEY, push.VAPID_PRIVATE_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const result = await runAutoBilling(new Date());
    console.log('autoBilling', JSON.stringify(result));
  }
);

// Emulator only (never deployed): run autoBilling now (or at {now}), from tools/test-emails.mjs
if (IS_EMULATOR) {
  exports.devRunAutoBilling = onCall({ timeoutSeconds: 300 }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    const at = req.data && req.data.now ? new Date(req.data.now) : new Date();
    return runAutoBilling(isNaN(at) ? new Date() : at);
  });
}

// ───────────────────────────────────────────────────────────
// AI: categorize an expense + detect the store logo (Claude)
// ───────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = Object.keys(CAT_EMOJI); // reuse the app's category set

async function analyzeExpenseDescription(description) {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: { type: 'string', enum: EXPENSE_CATEGORIES,
        description: 'Best-fitting expense category from the list.' },
      merchant: { type: 'string',
        description: 'Clean store/brand name, e.g. "Amazon", "Éxito", "Uber". Empty string if no identifiable store.' },
      domain: { type: 'string',
        description: 'Primary web domain of the store for fetching its logo, e.g. "amazon.com". Empty string if it is not a real, recognizable brand.' },
      emoji: { type: 'string',
        description: 'A single emoji that best represents this expense (fallback when there is no store logo).' },
    },
    required: ['category', 'merchant', 'domain', 'emoji'],
  };

  const resp = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' }, // structured output constrains the result; keep it fast & cheap
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content:
        'You categorize expenses for a shared-expenses app used mainly in Colombia / Latin America. ' +
        'Descriptions are short and may be in Spanish or English (a store name, a product, or a note). ' +
        'Return: the best category; the store/brand name if identifiable; its primary web domain so we can fetch its logo ' +
        '(empty string when it is NOT a real recognizable brand — e.g. "cena", "arriendo", "regalo a Ana", "mercado"); ' +
        'and one emoji that represents the expense.\n\n' +
        `Expense description: "${description}"`,
    }],
  });

  const textBlock = resp.content.find((b) => b.type === 'text');
  const out = JSON.parse((textBlock && textBlock.text) || '{}');

  const cats = new Set(EXPENSE_CATEGORIES);
  const category = cats.has(out.category) ? out.category : 'other';
  const merchant = String(out.merchant || '').trim().slice(0, 60);
  let domain = String(out.domain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-z0-9.\-]/g, '');
  if (!/\.[a-z]{2,}$/.test(domain)) domain = '';
  const emoji = String(out.emoji || '').trim().slice(0, 8);

  return { category, merchant, domain, emoji };
}

// Trigger: enrich a new expense with AI (category + store logo). Runs in the
// background; the app's realtime listener shows the logo the moment it lands.
exports.enrichExpense = onDocumentCreated(
  { document: 'groups/{groupId}/expenses/{expenseId}', secrets: [ANTHROPIC_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (data.type === 'settle' || data.aiEnriched) return;
    const description = String(data.description || '').trim();
    if (!description) return;

    // 1) Known store in the merchant catalog: no AI call at all
    const cat = catalogFields(description);
    if (cat) {
      try {
        await snap.ref.update({
          category: cat.cat || data.category || 'other',
          merchant: cat.merchant, logoDomain: cat.logoDomain, logoEmoji: cat.logoEmoji,
          aiEnriched: true,
        });
      } catch (err) {
        console.error('enrichExpense catalog error', err);
      }
      return;
    }
    if (IS_EMULATOR) return;   // local emulators: never call the AI

    // 2) Otherwise ask Claude (with a cache)

    // Cache by normalized description — "Uber", "Éxito" repeat constantly.
    const key = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

    try {
      let ai = null;
      const cacheRef = key ? db.doc(`aiCache/${key}`) : null;
      if (cacheRef) {
        const cached = await cacheRef.get();
        if (cached.exists) ai = cached.data();
      }
      if (!ai) {
        ai = await analyzeExpenseDescription(description);
        if (cacheRef) {
          await cacheRef.set({ ...ai, at: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        }
      }
      await snap.ref.update({
        category: ai.category || data.category || 'other',
        merchant: ai.merchant || '',
        logoDomain: ai.domain || '',
        logoEmoji: ai.emoji || '',
        aiEnriched: true,
      });
    } catch (err) {
      console.error('enrichExpense error', err);
      // Mark as attempted so a bad description doesn't get retried forever.
      try { await snap.ref.update({ aiEnriched: true }); } catch (_) {}
    }
  }
);

// ───────────────────────────────────────────────────────────
// AI: scan a receipt photo -> total, merchant, category, logo (Claude vision)
// Callable from the app; the frontend pre-fills the "new expense" form.
// ───────────────────────────────────────────────────────────
exports.scanReceipt = onCall(
  { secrets: [ANTHROPIC_API_KEY], memory: '512MiB', timeoutSeconds: 60 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    if (IS_EMULATOR) return { found: false };   // local emulators: never call the AI
    const { imageBase64, mediaType } = req.data || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing image');
    }
    if (imageBase64.length > 7_000_000) { // ~5MB decoded — client should downscale
      throw new HttpsError('invalid-argument', 'Image too large');
    }
    const mt = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        found: { type: 'boolean', description: 'True if the image is a purchase receipt/ticket and a total was found.' },
        amount: { type: 'number', description: 'The FINAL total paid, as a plain number (no currency symbol, no thousands separators). 0 if not found.' },
        currency: { type: 'string', enum: ['USD', 'COP', ''], description: 'Currency if clearly shown, else empty string.' },
        merchant: { type: 'string', description: 'Store/brand name printed on the receipt.' },
        category: { type: 'string', enum: EXPENSE_CATEGORIES },
        domain: { type: 'string', description: 'Primary web domain of the store for its logo, e.g. "exito.com". Empty string if not a recognizable brand.' },
        emoji: { type: 'string', description: 'A single emoji representing the expense.' },
      },
      required: ['found', 'amount', 'currency', 'merchant', 'category', 'domain', 'emoji'],
    };

    const resp = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: imageBase64 } },
          { type: 'text', text:
            'This is a photo of a purchase receipt (Colombia / Latin America; usually Spanish). ' +
            'Extract the FINAL TOTAL amount paid (the grand total, after taxes — a plain number, e.g. 84300, ' +
            'not "84.300" or "$84,300"), the currency if shown (COP or USD), the store/brand name, the best ' +
            'category, the store web domain so we can fetch its logo (empty string if it is not a recognizable brand), ' +
            'and one emoji. If the image is NOT a receipt, set found=false.' },
        ],
      }],
    });

    const tb = resp.content.find((b) => b.type === 'text');
    const out = JSON.parse((tb && tb.text) || '{}');

    const cats = new Set(EXPENSE_CATEGORIES);
    let domain = String(out.domain || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-z0-9.\-]/g, '');
    if (!/\.[a-z]{2,}$/.test(domain)) domain = '';

    return {
      found: !!out.found,
      amount: Number(out.amount) || 0,
      currency: ['USD', 'COP'].includes(out.currency) ? out.currency : '',
      merchant: String(out.merchant || '').trim().slice(0, 80),
      category: cats.has(out.category) ? out.category : 'other',
      domain,
      emoji: String(out.emoji || '').trim().slice(0, 8),
    };
  }
);

// ───────────────────────────────────────────────────────────
// AI: parse a natural-language expense -> structured fields (Claude)
// e.g. "cené 45 mil con Ana" -> {amount, description, category, split, paidBy...}
// ───────────────────────────────────────────────────────────
exports.parseExpense = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    if (IS_EMULATOR) return { found: false };   // local emulators: never call the AI
    const { text, members, currency } = req.data || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new HttpsError('invalid-argument', 'Missing text');
    }
    const memberNames = Array.isArray(members)
      ? members.map((m) => String((m && m.name) || '').trim()).filter(Boolean)
      : [];

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        found: { type: 'boolean', description: 'True if the text describes an expense.' },
        amount: { type: 'number', description: 'Amount as a plain number. Interpret "84 mil" / "84.300" / "84k" as 84300. 0 if not stated.' },
        description: { type: 'string', description: 'Short label for the expense (store name or what it was).' },
        merchant: { type: 'string', description: 'Store/brand name if identifiable, else empty.' },
        category: { type: 'string', enum: EXPENSE_CATEGORIES },
        domain: { type: 'string', description: 'Store web domain for its logo, empty if not a recognizable brand.' },
        emoji: { type: 'string', description: 'One emoji representing the expense.' },
        split: { type: 'string', enum: ['all', 'two', 'full', 'solo', ''],
          description: '"all"=split between everyone; "two"=split with ONE specific person; "full"=one person owes it back in full; "solo"=only the payer. Empty if unclear.' },
        paidBy: { type: 'string', description: 'Name of who paid, EXACTLY as in the member list. Empty if the speaker paid (default).' },
        splitWith: { type: 'string', description: 'For split "two"/"full": the other person name from the member list. Empty otherwise.' },
      },
      required: ['found', 'amount', 'description', 'merchant', 'category', 'domain', 'emoji', 'split', 'paidBy', 'splitWith'],
    };

    const resp = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content:
          'Parse a shared expense described in natural language (Colombia / Latin America, usually Spanish). ' +
          `Group members: ${memberNames.length ? memberNames.join(', ') : '(unknown)'}. Currency: ${currency || 'USD'}. ` +
          'Extract the amount as a plain number ("84 mil"/"84.300"/"84k" -> 84300), a short description/store, the category, ' +
          'the store web domain for its logo (empty if not a real brand), an emoji, how to split it, who paid, and (only for a "two"/"full" split) with whom. ' +
          'Match names EXACTLY to the member list. If the payer is not named, leave paidBy empty (the speaker paid). If it is not an expense, set found=false.\n\n' +
          `Text: "${text.trim()}"`,
      }],
    });

    const tb = resp.content.find((b) => b.type === 'text');
    const out = JSON.parse((tb && tb.text) || '{}');

    const cats = new Set(EXPENSE_CATEGORIES);
    let domain = String(out.domain || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-z0-9.\-]/g, '');
    if (!/\.[a-z]{2,}$/.test(domain)) domain = '';

    return {
      found: !!out.found,
      amount: Number(out.amount) || 0,
      description: String(out.description || out.merchant || '').trim().slice(0, 80),
      merchant: String(out.merchant || '').trim().slice(0, 80),
      category: cats.has(out.category) ? out.category : 'other',
      domain,
      emoji: String(out.emoji || '').trim().slice(0, 8),
      split: ['all', 'two', 'full', 'solo'].includes(out.split) ? out.split : '',
      paidBy: String(out.paidBy || '').trim().slice(0, 80),
      splitWith: String(out.splitWith || '').trim().slice(0, 80),
    };
  }
);

// ───────────────────────────────────────────────────────────
// AI: parse a natural-language budget -> {name, categories, amount, emoji}
// e.g. "presupuesto de restaurantes de 500 mil este mes"
// ───────────────────────────────────────────────────────────
exports.parseBudget = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Login required');
    if (IS_EMULATOR) return { found: false };   // local emulators: never call the AI
    const { text, currency } = req.data || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new HttpsError('invalid-argument', 'Missing text');
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        found: { type: 'boolean', description: 'True if the text is a request to create a spending budget.' },
        name: { type: 'string', description: 'Short budget name, e.g. "Restaurantes", "Ocio".' },
        categories: {
          type: 'array',
          items: { type: 'string', enum: EXPENSE_CATEGORIES },
          description: '1 to 4 app categories this budget covers.',
        },
        amount: { type: 'number', description: 'Monthly limit as a plain number ("500 mil"/"500.000"/"500k" -> 500000). 0 if not stated.' },
        emoji: { type: 'string', description: 'One emoji for the budget.' },
      },
      required: ['found', 'name', 'categories', 'amount', 'emoji'],
    };

    const resp = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content:
          'Create a monthly spending budget from a natural-language request (Colombia / Latin America, usually Spanish). ' +
          `Currency: ${currency || 'USD'}. The app categories and what they cover:\n` +
          'food (comida, mercado, restaurantes, salidas a comer), transport (transporte, gasolina, uber, taxi), ' +
          'utilities (servicios, luz, agua, internet), health (salud, farmacia, médico), ' +
          'entertainment (ocio, cine, streaming, conciertos, salidas), home (casa, arriendo, muebles), ' +
          'education (educación, cursos), other (otros), travel (viajes, hoteles, vuelos), shopping (compras, ropa), ' +
          'pets (mascotas), drinks (bar, licor, tragos), personalcare (cuidado personal, peluquería), kids (niños), gifts (regalos).\n' +
          'Return a short budget name, the category or categories it covers (from that list — "restaurantes"/"salidas a comer" -> food; "ocio"/"salidas" -> entertainment), ' +
          'the monthly limit as a plain number ("500 mil"/"500.000"/"500k" -> 500000), and one emoji. If it is NOT a budget request, set found=false.\n\n' +
          `Request: "${text.trim()}"`,
      }],
    });

    const tb = resp.content.find((b) => b.type === 'text');
    const out = JSON.parse((tb && tb.text) || '{}');

    const catSet = new Set(EXPENSE_CATEGORIES);
    let categories = Array.isArray(out.categories)
      ? out.categories.filter((c) => catSet.has(c)) : [];
    categories = [...new Set(categories)].slice(0, 4);
    if (!categories.length) categories = ['other'];

    return {
      found: !!out.found,
      name: String(out.name || '').trim().slice(0, 40) || 'Presupuesto',
      categories,
      amount: Number(out.amount) || 0,
      emoji: String(out.emoji || '').trim().slice(0, 8),
    };
  }
);

// Solo emulador: estadísticas de comercios para el catálogo de logos (nunca se despliega)
if (IS_EMULATOR) { global.__ssDev = { pairNet, loadExpenses }; Object.assign(exports, require('./dev-merchant-stats')); }
