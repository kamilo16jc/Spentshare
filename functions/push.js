// SpentShare — notificaciones al teléfono (Web Push estándar con claves VAPID propias).
// Funciona con la app instalada: Android/computador siempre; iPhone si está en la pantalla de inicio.
// Cada teléfono que activa "Notificaciones" guarda su suscripción en users/{uid}/push/{id}.
// En el emulador no se envía nada: se escribe en functions/.outbox/*-push-*.json para las pruebas.
'use strict';

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { defineSecret } = require('firebase-functions/params');

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
// La pública también está en js/push.js (el teléfono la necesita para suscribirse)
const VAPID_PUBLIC_KEY = 'BL56TFSTchCv7SXcrpb2_ra7Hwt0WjQLf0fIeuxwiaKG52u7S2rLJIGUjJd4JAMB2dD7vlGJto_4PNu2pCl0wPk';
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const TIME_ZONE = 'America/Chicago';

// Textos en el idioma de quien la recibe
const STR = {
  es: {
    request: (F, amt) => `${F} te cobra ${amt}`,
    requestAbout: (F, x, amt) => `${F} te cobra ${x}: ${amt}`,
    due: (g, d) => `${g} · vence el ${d}`,
    overdue: (F) => `Tu cobro de ${F} venció`,
    overdueBody: (amt, g) => `Faltan ${amt} · ${g}`,
    paid: (P, amt) => `${P} te pagó ${amt}`,
    paidBody: (g) => `${g} · ya está en tu saldo`,
    expense: (A, x) => `${A} agregó “${x}”`,
    yourShare: (amt, g) => `Tu parte: ${amt} · ${g}`,
    owedToYou: (amt, g) => `Te deben ${amt} · ${g}`,
    testTitle: 'SpentShare',
    testBody: 'Así te llegarán los avisos de cobros y pagos.',
  },
  en: {
    request: (F, amt) => `${F} is requesting ${amt}`,
    requestAbout: (F, x, amt) => `${F} is requesting ${x}: ${amt}`,
    due: (g, d) => `${g} · due ${d}`,
    overdue: (F) => `${F}’s request is overdue`,
    overdueBody: (amt, g) => `${amt} left · ${g}`,
    paid: (P, amt) => `${P} paid you ${amt}`,
    paidBody: (g) => `${g} · it’s in your balance`,
    expense: (A, x) => `${A} added “${x}”`,
    yourShare: (amt, g) => `Your share: ${amt} · ${g}`,
    owedToYou: (amt, g) => `You’re owed ${amt} · ${g}`,
    testTitle: 'SpentShare',
    testBody: 'This is how request and payment alerts will look.',
  },
};
const L = (lang) => STR[lang === 'en' ? 'en' : 'es'];
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const shortDate = (lang, d) => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-CO', { day: 'numeric', month: 'short', timeZone: TIME_ZONE }).format(d).replace('.', '');

let vapidReady = false;
function setupVapid() {
  if (vapidReady) return true;
  const key = VAPID_PRIVATE_KEY.value();
  if (!key) return false;
  webpush.setVapidDetails('mailto:noreply@spentshare.com', VAPID_PUBLIC_KEY, key);
  vapidReady = true;
  return true;
}

// Envía {title, body, url, tag} a todos los teléfonos de uid. Nunca lanza: un aviso que falla no
// debe frenar el correo ni el cobro. Las suscripciones vencidas (404/410) se borran solas.
async function sendPush(db, uid, msg, meta = {}) {
  if (!uid || !msg || !msg.title) return { sent: 0 };
  try {
    const snap = await db.collection(`users/${uid}/push`).get();
    if (snap.empty) return { sent: 0 };
    const payload = JSON.stringify({ title: msg.title, body: msg.body || '', url: msg.url || './', tag: msg.tag || '' });
    if (IS_EMULATOR) {
      const dir = path.join(__dirname, '.outbox');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '');
      let base = `${stamp}-push-${uid}`;
      for (let n = 2; fs.existsSync(path.join(dir, `${base}.json`)); n++) base = `${stamp}-push-${uid}-${n}`;
      fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ uid, devices: snap.size, ...JSON.parse(payload), meta }, null, 2));
      console.log(`[outbox] push -> ${uid} (${snap.size}) "${msg.title}"`);
      return { sent: snap.size };
    }
    if (!setupVapid()) { console.warn('sendPush: missing VAPID_PRIVATE_KEY'); return { sent: 0 }; }
    let sent = 0;
    await Promise.all(snap.docs.map(async (d) => {
      const s = d.data();
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 86400, urgency: 'high' });
        sent++;
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) await d.ref.delete().catch(() => {});
        else console.warn(`sendPush ${uid} error`, err && (err.statusCode || err.message));
      }
    }));
    return { sent };
  } catch (err) {
    console.warn('sendPush error', err);
    return { sent: 0 };
  }
}

module.exports = { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, sendPush, pushText: L, shortDate, firstName };
