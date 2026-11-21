// SpentShare — notificaciones al teléfono (Web Push). Cada teléfono se suscribe una vez y queda
// guardado en users/{uid}/push/{id}; el servidor (functions/push.js) avisa de cobros, pagos y gastos.
// iPhone: solo funciona con la app en la pantalla de inicio (iOS 16.4+). Android y computador: siempre.
'use strict';

const VAPID_PUBLIC = 'BL56TFSTchCv7SXcrpb2_ra7Hwt0WjQLf0fIeuxwiaKG52u7S2rLJIGUjJd4JAMB2dD7vlGJto_4PNu2pCl0wPk';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function vapidBytes(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
// id del teléfono = huella corta del endpoint (no se puede usar el endpoint: lleva "/")
async function pushSubId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
const swReg = () => navigator.serviceWorker.getRegistration().then(r => r || null).catch(() => null);

// 'on' | 'off' | 'denied' | 'install' (iPhone sin instalar) | 'unsupported'
async function pushStatus() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await swReg();
  const sub = reg && await reg.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function savePushSub(sub) {
  const j = sub.toJSON();
  const id = await pushSubId(j.endpoint);
  await window._setDoc(ref(`users/${uid()}/push`, id), {
    endpoint: j.endpoint, keys: j.keys || {}, lang,
    device: navigator.userAgent.slice(0, 140), updatedAt: window._srvTs(),
  }, { merge: true });
}

// Hay que llamarla desde un toque (iPhone no deja pedir permiso solo)
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(VAPID_PUBLIC) });
  await savePushSub(sub);
  return 'on';
}

// Apagar en ESTE teléfono (los demás teléfonos de la persona siguen igual)
async function disablePush() {
  const reg = await swReg();
  const sub = reg && await reg.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  const id = await pushSubId(sub.endpoint);
  if (uid()) await window._delDoc(ref(`users/${uid()}/push`, id)).catch(() => null);
  await sub.unsubscribe().catch(() => null);
}

// Al abrir la app: si este teléfono ya tiene permiso, dejar su suscripción guardada para quien entró
async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted' || !uid()) return;
    const reg = await swReg();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await savePushSub(sub);
  } catch (e) { console.warn('syncPush', e); }
}
