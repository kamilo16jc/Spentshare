// SpentShare — arranque, sesión, acciones y enlaces de los correos.
'use strict';

// ───────────────────────── enlaces que llegan por correo ─────────────────────────
//  ?unirse=CODIGO&g=&e=&t=&f=&n=   invitación (también funciona sin cuenta)
//  ?pagar=<cobro>&via=zelle         pagar un cobro (Zelle/Nequi/Bre-B: copia el dato)
//  ?liquidar=<uid>&via=             liquidar con alguien
//  ?gasto=<id>                      ver un gasto
const DEEP = (() => {
  const p = new URLSearchParams(location.search), out = {};
  ['unirse', 'g', 'e', 't', 'f', 'n', 'pagar', 'liquidar', 'gasto', 'via'].forEach(k => { if (p.get(k)) out[k] = p.get(k); });
  // limpia la barra de direcciones (sin perder ?emu=1 de las pruebas locales)
  if (Object.keys(out).length) {
    const keep = new URLSearchParams(); if (p.get('emu')) keep.set('emu', p.get('emu'));
    history.replaceState(null, '', location.pathname + (keep.toString() ? '?' + keep : ''));
  }
  return out;
})();
if (DEEP.unirse) {
  try { localStorage.setItem('ss_join', JSON.stringify({ code: DEEP.unirse.toUpperCase(), g: DEEP.g || '', e: DEEP.e || '', t: DEEP.t || '', f: DEEP.f || '', n: DEEP.n || '', at: Date.now() })); } catch (e) {}
}
function pendingJoin() {
  try {
    const j = JSON.parse(localStorage.getItem('ss_join') || 'null');
    if (j && Date.now() - (j.at || 0) < 30 * 864e5) return j;   // sirve 30 días (puede registrarse otro día)
  } catch (e) {}
  return null;
}
function clearPendingJoin() { try { localStorage.removeItem('ss_join'); } catch (e) {} }

// ───────────────────────── sesión ─────────────────────────
window._onAuthChange = async user => {
  S.user = user;
  if (!user) {
    stopGroupListeners();
    Object.assign(S, { me: null, groups: [], gid: null, group: null, members: [], expenses: null, budgets: [], requests: [], meta: {}, groupNets: {} });
    S.authMode = pendingJoin() ? 'signup' : 'login';
    closeSheet(false); bootDone(); go('auth');
    return;
  }
  await loadMe();
  await loadGroups();
  // Invitación pendiente (llegó con ?unirse=): con la sesión recién iniciada, se une solo
  const j = pendingJoin();
  if (j && S.justSignedIn) {
    S.justSignedIn = false;
    try { const g = await joinByCode(j.code); clearPendingJoin(); if (g) { openGroup(g.id); bootDone(); go('home'); toast(t('join.done', g.name)); return; } }
    catch (e) { console.error('auto join', e); }
  }
  S.justSignedIn = false;
  let gid = null; try { gid = localStorage.getItem('ss_group'); } catch (e) {}
  if (!S.groups.find(g => g.id === gid)) gid = S.groups[0] && S.groups[0].id;
  if (gid) openGroup(gid);
  bootDone();
  go(gid ? 'home' : 'groups');
  if (j) {
    const g = S.groups.find(x => x.inviteCode === j.code);
    if (g) { clearPendingJoin(); openGroup(g.id); go('home'); toast(t('join.already', g.name)); }
    else acceptInviteSheet(j);
  }
  handleDeepLinks();
};
if (window._pendingAuth) window._onAuthChange(window._pendingAuth.user);

function bootDone() { const b = $('#boot'); if (b && !b.classList.contains('hide')) { b.classList.add('hide'); setTimeout(() => b.remove(), 400); } }

async function handleDeepLinks() {
  try {
    if (DEEP.pagar) {
      const f = await findInMyGroups('paymentRequests', DEEP.pagar); DEEP.pagar = null;
      if (!f) return toast(t('link.notFound'), 'info');
      if (f.gid !== S.gid) openGroup(f.gid);
      await waitForData();
      settleSheet(f.doc.fromUid, { requestId: f.doc.id, via: DEEP.via, amount: f.doc.status === 'pending' ? f.doc.amount - (f.doc.paidAmount || 0) : 0 });
    } else if (DEEP.liquidar) {
      const other = DEEP.liquidar; DEEP.liquidar = null;
      const g = S.groups.find(x => x.id === S.gid && (x.memberUids || []).includes(other)) || S.groups.find(x => (x.memberUids || []).includes(other));
      if (!g) return;
      if (g.id !== S.gid) openGroup(g.id);
      await waitForData();
      settleSheet(other, { via: DEEP.via });
    } else if (DEEP.gasto) {
      const f = await findInMyGroups('expenses', DEEP.gasto); DEEP.gasto = null;
      if (!f) return toast(t('link.notFound'), 'info');
      if (f.gid !== S.gid) openGroup(f.gid);
      await waitForData();
      go('activity'); detailSheet(f.doc.id);
    }
  } catch (e) { console.error('deep link', e); }
}
async function waitForData() { for (let i = 0; i < 60 && (S.expenses === null || !S.members.length); i++) await wait(100); }

// ───────────────────────── acciones (data-action) ─────────────────────────
const actions = {
  home: () => { if (S.user) go(S.group ? 'home' : 'groups'); },
  profile: profileSheet,
  'switch-group': switchGroupSheet,
  members: membersSheet,
  'add-expense': addExpenseSheet,
  settle: el => settleSheet(el.dataset.uid),
  request: el => requestSheet(el.dataset.uid),
  budget: budgetSheet,
  'create-group': createGroupSheet,
  'edit-group': () => groupDesigner(true),
  'join-group': joinSheet,
  invite: inviteSheet,
  period: periodSheet,
  close: () => closeSheet(),
  'confirm-settle': el => confirmSettle(el),
  'send-request': el => sendRequestNow(el),
  received: el => markReceived(el.dataset.uid, el),
  'cancel-request': async el => {
    if (!confirmTap(el, t('req.cancelConfirm'))) return;
    try { await cancelRequest(S.reqDraft.requestId); closeSheet(); toast(t('req.cancelled')); } catch (e) { console.error(e); formError('req-error', t('err.save')); }
  },
  'auto-charge': autoChargeSheet,
  'auto-toggle': el => { const d = S.auto; if (!d) return; d.enabled = !d.enabled; el.setAttribute('aria-checked', String(d.enabled)); $('.switch', el).classList.toggle('on', d.enabled); $('#auto-fields').classList.toggle('is-off', !d.enabled); autoRefresh(); },
  'recurring-new': () => recurringSheet(),
  recurring: el => recurringSheet(el.dataset.id),
  'rec-charge-toggle': () => { if (!S.auto) return; S.auto.sendCharge = !S.auto.sendCharge; $('#rec-charge').innerHTML = recChargeHtml(); },
  'recurring-pause': toggleRecurring,
  'recurring-delete': async el => {
    if (!confirmTap(el, t('rec.deleteConfirm'))) return;
    try { await deleteRecurring(S.auto.id); closeSheet(); toast(t('rec.deleted')); } catch (e) { console.error(e); formError('rec-error', t('err.save')); }
  },
  'copy-pay': el => showCopied(el.dataset.type, el.dataset.value),
  'settle-edit-amount': el => { $('#settle-amount-field').hidden = false; el.hidden = true; $('#settle-amount').focus(); },
  'budget-stats': () => { closeSheet(); go('stats'); },
  'delete-budget': async el => { if (!confirmTap(el, t('budget.deleteConfirm'))) return; try { await deleteBudgetDoc(el.dataset.id); toast(t('budget.deleted')); } catch (e) { toast(t('err.save'), 'info'); } },
  'delete-expense': async el => {
    if (!confirmTap(el, t('detail.deleteConfirm'))) return;
    try { await deleteExpenseDoc(el.dataset.id); closeSheet(); toast(t('detail.deleted')); } catch (e) { console.error(e); toast(t('err.save'), 'info'); }
  },
  'delete-group': async el => {
    if (!confirmTap(el, t('members.deleteConfirm'))) return;
    const gid = S.gid;
    try { await deleteGroupDocs(gid); closeSheet(false); leftGroup(gid); toast(t('members.deleted')); } catch (e) { console.error(e); toast(t('err.save'), 'info'); }
  },
  'activity-info': () => openSheet(t('info.actTitle'), `<p class="sheet-intro">${t('info.act')}</p><button class="full-btn secondary" data-action="close">${t('btn.ok')}</button>`),
  'period-info': () => openSheet(t('info.periodTitle'), `<p class="sheet-intro">${t('info.period')}</p><button class="full-btn secondary" data-action="close">${t('btn.ok')}</button>`),
  'clear-filters': () => { S.act = { cat: 'all', person: 'all', query: '', period: 'all' }; render(false); },
  'category-activity': el => { closeSheet(); S.act = { ...S.act, cat: el.dataset.categoryKey, person: 'all' }; go('activity'); },
  motion: () => { S.motion = !S.motion; try { localStorage.setItem('ss_motion', S.motion ? '1' : '0'); } catch (e) {} document.body.classList.toggle('motion-off', !S.motion); profileSheet(); },
  'toggle-lang': () => { const inProfile = !!$('[data-action="toggle-lang"]', $('#modal-root')); setLang(lang === 'es' ? 'en' : 'es'); render(false); if (inProfile) profileSheet(); },
  'edit-name': nameSheet,
  'pay-methods': payMethodsSheet,
  'pick-avatar': () => $('#avatarFile').click(),
  'scan-receipt': () => $('#receiptFile').click(),
  'ai-toggle': () => { const b = $('#ai-box'); b.hidden = !b.hidden; if (!b.hidden) $('#ai-text').focus(); },
  'ai-parse': aiParse,
  'copy-link': async () => { (await copyText(inviteLink())) ? toast(t('invite.copied')) : toast(inviteLink(), 'info'); },
  'share-link': async () => { try { await navigator.share({ title: 'SpentShare', text: t('invite.shareText', S.group.name), url: inviteLink() }); } catch (e) {} },
  'accept-invite': () => { const j = pendingJoin(); if (j) submitJoin(null, j.code); },
  'decline-invite': () => { clearPendingJoin(); closeSheet(); },
  logout: async () => { closeSheet(false); clearPendingJoin(); await window._doSignOut(); },
  // entrada
  'auth-toggle': () => { S.authMode = S.authMode === 'login' ? 'signup' : 'login'; render(); },
  'toggle-password': () => { const i = $('#auth-password'); i.type = i.type === 'password' ? 'text' : 'password'; $('[data-action="toggle-password"]').setAttribute('aria-label', t(i.type === 'password' ? 'aria.showPass' : 'aria.hidePass')); },
  google: async () => { try { S.justSignedIn = true; await window._doGoogle(); } catch (e) { S.justSignedIn = false; if (e && e.code !== 'auth/popup-closed-by-user') formError('auth-error', authErrorText(e)); } },
  forgot: forgotSheet,
};

function authErrorText(e) {
  const c = (e && e.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return t('auth.errCred');
  if (c.includes('email-already-in-use')) return t('auth.errInUse');
  if (c.includes('weak-password')) return t('auth.errWeak');
  if (c.includes('invalid-email')) return t('err.email');
  if (c.includes('too-many-requests')) return t('auth.errMany');
  if (c.includes('network')) return t('auth.errNet');
  return t('auth.errGeneric');
}

// ───────────────────────── eventos ─────────────────────────
document.addEventListener('click', e => {
  if (e.target.id === 'overlay') { closeSheet(); return; }
  const a = e.target.closest('a[data-paid-with]');
  if (a) { const sel = $('#settle-method'); if (sel) sel.value = a.dataset.paidWith; return; }   // abre Venmo/PayPal y deja elegido el método
  const el = e.target.closest('button,[data-donut]'); if (!el) return;
  if (el.dataset.action && actions[el.dataset.action]) { actions[el.dataset.action](el); return; }
  if (el.dataset.page) { if (!S.user) return; go(el.dataset.page); return; }
  if (el.dataset.expense) { detailSheet(el.dataset.expense); return; }
  if (el.dataset.filter) { S.act.cat = el.dataset.filter; render(false); return; }
  if (el.dataset.person) { S.act.person = el.dataset.person; render(false); return; }
  if (el.dataset.period) { S.st.period = el.dataset.period; S.st.bar = null; render(false); return; }
  if (el.dataset.actPeriod) { S.act.period = el.dataset.actPeriod; S.act.from = S.act.to = null; closeSheet(); render(false); return; }
  if (el.dataset.bar !== undefined) { selectBar(Number(el.dataset.bar)); return; }
  if (el.dataset.category || el.dataset.donut) { categoryDetail(el.dataset.category || el.dataset.donut); return; }
  if (el.dataset.group !== undefined) { enterGroup(el.dataset.group, el); return; }
  if (el.dataset.choice) { setCategory(el.dataset.choice, true); return; }
  if (el.dataset.participant) {
    const id = el.dataset.participant, sel = S.draft.split;
    S.draft.split = sel.includes(id) ? sel.filter(x => x !== id) : S.members.map(m => m.uid).filter(x => sel.includes(x) || x === id);
    updateSplitPreview(); return;
  }
  if (el.dataset.pick) { autoPick(el); return; }
  if (el.dataset.due) { S.reqDraft.due = Number(el.dataset.due); $$('[data-due]').forEach(b => { const on = b === el; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }); return; }
  if (el.dataset.theme && S.groupDraft) { S.groupDraft.theme = el.dataset.theme; updateGroupPreview(); return; }
  if (el.dataset.cover && S.groupDraft) { S.groupDraft.cover = el.dataset.cover; updateGroupPreview(); return; }
  if (el.dataset.emoji && S.groupDraft) { S.groupDraft.emoji = el.dataset.emoji; updateGroupPreview(); return; }
  if (el.dataset.currency && S.groupDraft) { S.groupDraft.currency = el.dataset.currency; updateGroupPreview(); return; }
});

// Espera (poco) a que lleguen los datos del grupo para no mostrar "Cargando…" y luego el contenido
async function groupReady(ms = 700) {
  const end = Date.now() + ms;
  while (Date.now() < end && (S.expenses === null || !S.members.length)) await wait(30);
}
function enterGroup(gid, source) {
  const update = async () => { if (gid !== S.gid) { openGroup(gid); await groupReady(); } closeSheet(false); go('home'); };
  if (source.classList.contains('group-tile') && document.startViewTransition && canAnimate()) {
    source.classList.add('opening');
    document.startViewTransition(update).finished.catch(() => {});
  } else update();
}

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'search-expenses') { S.act.query = e.target.value; $('#activity-results').innerHTML = activityResults(); return; }
  if (id === 'expense-amount') { updateSplitPreview(); return; }
  if (id === 'expense-title' && S.draft) { titleMerchant(e.target.value); return; }
  if (id === 'auto-min') { autoRefresh(); return; }
  if (id === 'settle-amount') { const v = parseAmount(e.target.value); $('#settle-total').textContent = money(Number.isFinite(v) ? v : 0); return; }
  if (id === 'group-name' && S.groupDraft) { S.groupDraft.name = e.target.value; updateGroupPreview(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSheet(); return; }
  if (e.key === 'Enter' && e.target.id === 'ai-text') { e.preventDefault(); aiParse(); return; }
  if (e.key === 'Tab' && $('#overlay')) {
    const els = $$('button,input,select,textarea,a[href]', $('#overlay')).filter(x => !x.disabled && x.offsetParent !== null), first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'auto-day' && S.auto) { S.auto.day = Number(e.target.value) || 1; autoRefresh(); return; }
  if (e.target.id === 'expense-payer' && S.auto && S.auto.kind === 'recurring') { S.auto.payer = e.target.value; $('#rec-charge').innerHTML = recChargeHtml(); return; }
  if (e.target.id === 'receiptFile') { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) scanReceiptFile(f); }
  if (e.target.id === 'avatarFile') {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    downscaleImage(f, 400, 0.82).then(b64 => saveAvatar('data:image/jpeg;base64,' + b64)).then(() => { toast(t('profile.photoSaved')); render(false); profileSheet(); }).catch(() => toast(t('err.image'), 'info'));
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'expense-form') return submitExpense(f);
  if (f.id === 'group-form') return submitGroup(f);
  if (f.id === 'join-form') return submitJoin(f);
  if (f.id === 'invite-form') return submitInvite(f);
  if (f.id === 'pay-form') return submitPayMethods(f);
  if (f.id === 'budget-form') return submitBudget(f);
  if (f.id === 'auto-form') return submitAuto(f);
  if (f.id === 'recurring-form') return submitRecurring(f);
  if (f.id === 'name-form') {
    const v = $('#name-input').value.trim(); if (!v) return formError('name-error', t('err.name'));
    try { await saveName(v); closeSheet(); render(false); toast(t('profile.nameSaved')); } catch (err) { formError('name-error', t('err.save')); }
    return;
  }
  if (f.id === 'period-form') {
    const from = $('#period-from').value, to = $('#period-to').value;
    if (!from) return;
    S.act = { ...S.act, period: 'custom', from, to: to && to >= from ? to : from }; closeSheet(); render(false); return;
  }
  if (f.id === 'forgot-form') {
    const em = $('#forgot-email').value.trim(); if (!em.includes('@')) return formError('forgot-error', t('err.email'));
    try { await window._doResetPassword(em); closeSheet(); toast(t('forgot.sent')); } catch (err) { formError('forgot-error', authErrorText(err)); }
    return;
  }
  if (f.id === 'auth-form') {
    const signup = S.authMode === 'signup';
    const email = $('#auth-email').value.trim(), pass = $('#auth-password').value, name = signup ? $('#auth-name').value.trim() : '';
    if (signup && !name) return formError('auth-error', t('err.name'));
    if (!email.includes('@')) return formError('auth-error', t('err.email'));
    if (pass.length < (signup ? 8 : 1)) return formError('auth-error', t('auth.errWeak'));
    const b = $('button[type="submit"]', f); buttonBusy(b, true, t('loading'));
    S.justSignedIn = true;
    try { signup ? await window._doSignUp(email, pass, name) : await window._doSignIn(email, pass); }
    catch (err) { S.justSignedIn = false; buttonBusy(b, false); formError('auth-error', authErrorText(err)); }
  }
});
$('#fab').addEventListener('click', addExpenseSheet);

// ───────────────────────── arranque ─────────────────────────
try { S.motion = localStorage.getItem('ss_motion') !== '0'; document.body.classList.toggle('motion-off', !S.motion); } catch (e) {}
initLang();
render();
