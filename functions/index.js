// Spentshare — email notifications via Resend
// Triggers:
//  - onExpenseCreate: notify group members when someone adds an expense
//  - onExpenseDelete: notify group members when someone deletes an expense
//  - monthlySummary:  scheduled on the 1st of each month, sends per-group PDF recap

const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: 'us-east1', maxInstances: 10 });

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const FROM = 'SpentShare <noreply@spentshare.com>';

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

function splitLabel(split, amount, memberCount) {
  const n = Math.max(memberCount, 1);
  if (split === 'all')   return `$${(amount/n).toFixed(2)} por persona`;
  if (split === 'two')   return `$${(amount/2).toFixed(2)} entre dos`;
  if (split === 'full')  return `$${amount.toFixed(2)} — me deben el total`;
  if (split === 'solo')  return 'Solo yo';
  return '';
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
// Trigger: onExpenseCreate
// ───────────────────────────────────────────────────────────
exports.onExpenseCreate = onDocumentCreated(
  { document: 'groups/{groupId}/expenses/{expenseId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { groupId } = event.params;

    const { group, recipients } = await getGroupRecipients(groupId, data.createdByUid);
    if (!group || recipients.length === 0) return;

    const resend = new Resend(RESEND_API_KEY.value());
    const amount = Number(data.amount || 0);
    const catEmoji = CAT_EMOJI[data.category] || '📦';
    const paidBy = data.paidBy || 'Alguien';
    const isSettle = data.type === 'settle';

    const subject = isSettle
      ? `🤝 ${paidBy} liquidó una deuda en ${group.name}`
      : `${catEmoji} ${paidBy} agregó un gasto en ${group.name}`;

    const memberCount = (group.memberUids || []).length;
    const splitTxt = isSettle
      ? `Pago saldando deuda con ${data.settledTo || ''}`
      : splitLabel(data.split, amount, memberCount);

    const html = baseEmailShell(`
      <div style="font-size:13px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">
        ${isSettle ? 'Pago registrado' : 'Nuevo gasto'}
      </div>
      <div style="font-size:22px;font-weight:900;margin-bottom:18px">${group.emoji || '🏠'} ${group.name}</div>
      <div style="background:#fff5f0;border-radius:14px;padding:20px;margin-bottom:18px;border-left:4px solid #ff6b35">
        <div style="font-size:30px;font-weight:900;color:#ff6b35">$${amount.toFixed(2)}</div>
        <div style="font-size:15px;margin-top:6px">${catEmoji} ${data.description || ''}</div>
        <div style="font-size:13px;color:#555;margin-top:10px">
          <strong>Pagó:</strong> ${paidBy}<br>
          <strong>División:</strong> ${splitTxt}
        </div>
      </div>
      <a href="https://spentshare.com" style="display:inline-block;background:#ff6b35;color:white;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:700;font-size:14px">
        Abrir SpentShare →
      </a>
    `);

    const text = isSettle
      ? `${paidBy} registró un pago de $${amount.toFixed(2)} en ${group.name}. Abre https://spentshare.com`
      : `${paidBy} agregó "${data.description}" ($${amount.toFixed(2)}) en ${group.name}. ${splitTxt}. Abre https://spentshare.com`;

    try {
      await resend.emails.send({
        from: FROM,
        to: recipients,
        subject,
        html,
        text,
        reply_to: 'noreply@spentshare.com',
      });
    } catch (err) {
      console.error('onExpenseCreate resend error', err);
    }
  }
);

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

    const resend = new Resend(RESEND_API_KEY.value());
    const amount = Number(data.amount || 0);
    const catEmoji = CAT_EMOJI[data.category] || '📦';
    const paidBy = data.paidBy || 'Alguien';
    const isSettle = data.type === 'settle';

    const subject = `🗑️ Se eliminó un ${isSettle ? 'pago' : 'gasto'} en ${group.name}`;

    const html = baseEmailShell(`
      <div style="font-size:13px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">
        Registro eliminado
      </div>
      <div style="font-size:22px;font-weight:900;margin-bottom:18px">${group.emoji || '🏠'} ${group.name}</div>
      <div style="background:#fff5f5;border-radius:14px;padding:20px;margin-bottom:18px;border-left:4px solid #f56565">
        <div style="font-size:24px;font-weight:900;color:#f56565;text-decoration:line-through">$${amount.toFixed(2)}</div>
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

    const text = `Se eliminó "${data.description}" ($${amount.toFixed(2)}) de ${group.name}. Las deudas se recalcularon.`;

    try {
      await resend.emails.send({
        from: FROM,
        to: recipients,
        subject,
        html,
        text,
        reply_to: 'noreply@spentshare.com',
      });
    } catch (err) {
      console.error('onExpenseDelete resend error', err);
    }
  }
);

// ───────────────────────────────────────────────────────────
// PDF generation (in-memory buffer)
// ───────────────────────────────────────────────────────────
function buildMonthlyPdf({ group, members, expenses, monthLabel, totals, catTotals, debts }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fillColor('#ff6b35').fontSize(28).text('SpentShare', { continued: false });
    doc.fillColor('#1a1a2e').fontSize(14).text(`${group.emoji || '🏠'} ${group.name}`);
    doc.fontSize(11).fillColor('#888').text(`Resumen mensual — ${monthLabel}`);
    doc.moveDown(1);

    // Total
    const total = expenses.filter(e => e.type !== 'settle').reduce((s, e) => s + Number(e.amount || 0), 0);
    doc.fillColor('#1a1a2e').fontSize(12).text('Total del mes', { continued: false });
    doc.fillColor('#ff6b35').fontSize(24).text(`$${total.toFixed(2)}`);
    doc.moveDown(0.5);
    doc.fillColor('#555').fontSize(10).text(`${expenses.length} movimientos registrados`);
    doc.moveDown(1);

    // By member
    doc.fillColor('#1a1a2e').fontSize(14).text('Pagado por miembro', { underline: false });
    doc.moveDown(0.4);
    doc.fontSize(11);
    members.forEach(m => {
      const paid = totals[m.uid] || 0;
      doc.fillColor('#1a1a2e').text(`${m.name || '?'}`, { continued: true });
      doc.fillColor('#555').text(`    $${paid.toFixed(2)}`, { align: 'left' });
    });
    doc.moveDown(1);

    // By category
    doc.fillColor('#1a1a2e').fontSize(14).text('Por categoría');
    doc.moveDown(0.4);
    doc.fontSize(11);
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length === 0) {
      doc.fillColor('#888').text('Sin datos');
    } else {
      sortedCats.forEach(([cat, amt]) => {
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        doc.fillColor('#1a1a2e').text(`${CAT_EMOJI[cat] || '📦'}  ${cat}`, { continued: true });
        doc.fillColor('#555').text(`    $${amt.toFixed(2)} (${pct}%)`);
      });
    }
    doc.moveDown(1);

    // Debts
    doc.fillColor('#1a1a2e').fontSize(14).text('Deudas pendientes');
    doc.moveDown(0.4);
    doc.fontSize(11);
    if (debts.length === 0) {
      doc.fillColor('#3ecf8e').text('🎉 Todas las cuentas al día');
    } else {
      debts.forEach(d => {
        doc.fillColor('#1a1a2e').text(
          `${d.from.name || '?'}  →  ${d.to.name || '?'}`,
          { continued: true }
        );
        doc.fillColor('#f56565').text(`    $${d.amount.toFixed(2)}`);
      });
    }
    doc.moveDown(1);

    // Top 5
    const top5 = [...expenses]
      .filter(e => e.type !== 'settle')
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 5);
    if (top5.length) {
      doc.fillColor('#1a1a2e').fontSize(14).text('Top 5 gastos del mes');
      doc.moveDown(0.4);
      doc.fontSize(11);
      top5.forEach((e, i) => {
        doc.fillColor('#1a1a2e').text(
          `${i + 1}. ${e.description || ''}`,
          { continued: true }
        );
        doc.fillColor('#555').text(`    $${Number(e.amount || 0).toFixed(2)}`);
      });
    }

    doc.moveDown(2);
    doc.fillColor('#aaa').fontSize(9).text('Generado automáticamente por SpentShare · spentshare.com', { align: 'center' });
    doc.end();
  });
}

function calcDebtsForMonth(members, expenses) {
  const net = {};
  members.forEach(a => { net[a.uid] = {}; members.forEach(b => net[a.uid][b.uid] = 0); });
  expenses.forEach(e => {
    if (e.type === 'settle') {
      const amt = Number(e.amount || 0);
      if (e.paidByUid && e.settledToUid && net[e.paidByUid] && net[e.settledToUid]) {
        net[e.paidByUid][e.settledToUid] -= amt;
        net[e.settledToUid][e.paidByUid] += amt;
      }
      return;
    }
    const amt = Number(e.amount || 0);
    let debtors = [];
    if (e.split === 'all') debtors = members.filter(m => m.uid !== e.paidByUid);
    else if (e.split === 'two') {
      const partner = e.splitWithUid || members.filter(m => m.uid !== e.paidByUid)[0]?.uid;
      debtors = partner ? [{ uid: partner }].filter(m => m.uid !== e.paidByUid) : [];
    } else if (e.split === 'full') {
      const partner = e.splitWithUid;
      if (partner && net[partner] && net[partner][e.paidByUid] !== undefined) {
        net[partner][e.paidByUid] += amt;
        net[e.paidByUid][partner] -= amt;
      }
      return;
    }
    if (debtors.length > 0) {
      const share = amt / (debtors.length + 1);
      debtors.forEach(d => {
        if (net[d.uid] && net[d.uid][e.paidByUid] !== undefined) {
          net[d.uid][e.paidByUid] += share;
          net[e.paidByUid][d.uid] -= share;
        }
      });
    }
  });
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
// ───────────────────────────────────────────────────────────
exports.sendGroupInvite = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }
    const uid = request.auth.uid;
    const { groupId, toEmail } = request.data || {};
    if (!groupId || !toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
      throw new HttpsError('invalid-argument', 'groupId and valid toEmail required');
    }

    const groupSnap = await db.doc(`groups/${groupId}`).get();
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Group not found');
    }
    const group = { id: groupSnap.id, ...groupSnap.data() };
    if (!(group.memberUids || []).includes(uid)) {
      throw new HttpsError('permission-denied', 'Not a member of this group');
    }

    // Don't invite people who are already in the group
    const existingEmails = (group.memberEmails || []).map(e => (e || '').toLowerCase());
    if (existingEmails.includes(toEmail.toLowerCase())) {
      return { ok: false, reason: 'already-member' };
    }

    const inviterSnap = await db.doc(`users/${uid}`).get();
    const inviter = inviterSnap.exists ? inviterSnap.data() : {};
    const inviterName = inviter.name || (request.auth.token.email || 'Alguien').split('@')[0];

    const code = group.inviteCode || '';
    const groupName = group.name || 'un grupo';
    const groupEmoji = group.emoji || '🏠';

    const resend = new Resend(RESEND_API_KEY.value());
    const subject = `${inviterName} te invitó a ${groupName} en SpentShare`;

    const html = baseEmailShell(`
      <div style="font-size:13px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">
        Invitación a grupo
      </div>
      <div style="font-size:22px;font-weight:900;margin-bottom:18px">${groupEmoji} ${groupName}</div>
      <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
        <strong>${inviterName}</strong> te invitó a compartir gastos en <strong>${groupName}</strong>.
        Juntá a tus amigos, dividí cuentas y llevá el control de quién debe qué — sin complicaciones.
      </div>
      <div style="background:#fff5f0;border-radius:14px;padding:22px;margin-bottom:20px;border-left:4px solid #ff6b35;text-align:center">
        <div style="font-size:12px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Código de invitación</div>
        <div style="font-size:32px;font-weight:900;color:#ff6b35;letter-spacing:4px;font-family:'Courier New',monospace">${code}</div>
        <div style="font-size:11px;color:#888;margin-top:6px">Válido por 30 días</div>
      </div>
      <div style="font-size:14px;color:#555;line-height:1.6;margin-bottom:20px">
        <strong>¿Cómo unirte?</strong><br>
        1. Entrá a <a href="https://spentshare.com" style="color:#ff6b35">spentshare.com</a><br>
        2. Creá una cuenta (o iniciá sesión)<br>
        3. Tocá "Unirse con código" y pegá el código de arriba
      </div>
      <a href="https://spentshare.com" style="display:inline-block;background:#ff6b35;color:white;text-decoration:none;padding:14px 26px;border-radius:14px;font-weight:700;font-size:15px">
        Abrir SpentShare →
      </a>
    `);

    const text = `${inviterName} te invitó a ${groupName} en SpentShare.\n\nCódigo de invitación: ${code}\n\nEntrá a https://spentshare.com, creá una cuenta y tocá "Unirse con código".`;

    try {
      await resend.emails.send({
        from: FROM,
        to: [toEmail],
        subject,
        html,
        text,
        reply_to: 'noreply@spentshare.com',
      });
      return { ok: true };
    } catch (err) {
      console.error('sendGroupInvite resend error', err);
      throw new HttpsError('internal', 'Email send failed');
    }
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
    const resend = new Resend(RESEND_API_KEY.value());

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

        const html = baseEmailShell(`
          <div style="font-size:13px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">
            Resumen mensual
          </div>
          <div style="font-size:22px;font-weight:900;margin-bottom:4px">${group.emoji || '🏠'} ${group.name}</div>
          <div style="font-size:14px;color:#555;margin-bottom:20px">${monthLabel}</div>
          <div style="background:#f0fdf8;border-radius:14px;padding:20px;margin-bottom:18px;border-left:4px solid #3ecf8e">
            <div style="font-size:13px;color:#555">Total del mes</div>
            <div style="font-size:30px;font-weight:900;color:#1a1a2e">$${total.toFixed(2)}</div>
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

        await resend.emails.send({
          from: FROM,
          to: recipients,
          subject: `📈 Resumen de ${group.name} — ${monthLabel}`,
          html,
          text: `Resumen mensual de ${group.name} (${monthLabel}). Total: $${total.toFixed(2)}. PDF adjunto.`,
          reply_to: 'noreply@spentshare.com',
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
