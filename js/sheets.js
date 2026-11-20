// SpentShare — hojas (sheets), toasts y animaciones de confirmación (diseño final).
'use strict';

let lastFocus = null, toastTimer;
S.sheet = null;   // { name, args } — para repintar algunas hojas cuando llegan datos

function openSheet(title, html, opts = {}) {
  closeSheet(false); lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="overlay" id="overlay"><section class="sheet ${opts.cls || ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-handle" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="close-btn" data-action="close" aria-label="${esc(t('btn.close'))}">${icon('close')}</button></div><div id="sheet-body">${html}</div></section></div>`;
  S.sheet = opts.name ? { name: opts.name, args: opts.args || [] } : null;
  applyGroupTheme();
  $('#app').inert = true; document.body.style.overflow = 'hidden';
  if (!opts.noFocus) $('.close-btn').focus({ preventScroll: true });
  if (opts.onOpen) opts.onOpen();
}
function closeSheet(restore = true) {
  $('#modal-root').innerHTML = ''; S.sheet = null;
  $('#app').inert = false; document.body.style.overflow = '';
  if (restore && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}
function toast(msg, kind = 'check') {
  clearTimeout(toastTimer);
  $('#toast-root').innerHTML = `<div class="toast">${icon(kind)} ${esc(msg)}</div>`;
  toastTimer = setTimeout(() => { $('#toast-root').innerHTML = ''; }, 3500);
}
// Hojas que solo muestran datos: se repintan solas si cambian en vivo
function refreshSheet() {
  if (!S.sheet || !$('#sheet-body')) return;
  const { name, args } = S.sheet;
  if (name === 'members') $('#sheet-body').innerHTML = membersHtml();
  if (name === 'auto-charge') autoRefresh();
  if (name === 'budget') { const keep = $('#budget-text') && $('#budget-text').value; $('#sheet-body').innerHTML = budgetHtml(); if (keep) $('#budget-text').value = keep; }
}
const formError = (id, msg) => { const el = $('#' + id); if (el) el.innerHTML = msg ? `<p class="form-error" role="alert">${esc(msg)}</p>` : ''; };

// El botón se vuelve un check lima (diseño final)
const drawnCheck = () => '<svg class="drawn-check" viewBox="0 0 40 40" aria-hidden="true"><path d="m10 20 7 7 14-15"/></svg>';
async function buttonCheck(button) {
  if (!button) return;
  button.disabled = true; button.setAttribute('aria-label', t('saved'));
  const w = button.getBoundingClientRect().width;
  button.innerHTML = drawnCheck();
  if (canAnimate() && button.animate) {
    const anim = button.animate([{ width: w + 'px', borderRadius: '15px', background: '#6941F5', color: '#fff' }, { width: '56px', borderRadius: '28px', background: '#D9F76B', color: '#405625' }], { duration: 330, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    // nunca esperar más de lo que dura (si la pestaña está en segundo plano la animación no avanza)
    await Promise.race([anim.finished.catch(() => {}), wait(450)]);
  }
}
function buttonBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.label = button.innerHTML; button.disabled = true; button.innerHTML = label || t('saving'); }
  else { button.disabled = false; if (button.dataset.label) button.innerHTML = button.dataset.label; }
}
// Botón que pide un segundo toque antes de algo que no se deshace (borrar)
function confirmTap(button, msg) {
  if (button.dataset.armed === '1') return true;
  button.dataset.armed = '1'; const old = button.innerHTML; button.innerHTML = esc(msg); button.classList.add('danger-armed');
  setTimeout(() => { if (button.isConnected) { button.dataset.armed = ''; button.innerHTML = old; button.classList.remove('danger-armed'); } }, 4000);
  return false;
}

// ───────────────────────── nuevo gasto ─────────────────────────
S.draft = null;
function participantLabel(u) { return u === uid() ? t('youCap') : firstName(nameOf(u)); }
function splitPreview() {
  const amount = Math.max(0, parseAmount(($('#expense-amount') || {}).value || 0) || 0);
  const sel = S.draft.split, list = allocateShares(amount, sel);
  const head = sel.length ? (sel.length === 1 ? t('split.one') : t('split.many', sel.length)) : t('split.choose');
  return `<div class="split-summary-heading"><strong>${head}</strong><span>${money(amount)}</span></div>${list.length ? `<div class="split-color-bar" aria-hidden="true">${list.map((s, i) => `<span style="background:${['#A88DE6', '#9FCBB6', '#E2A8C4', '#A6BDE8', '#E8C28E'][i % 5]};width:${100 / list.length}%"></span>`).join('')}</div><div class="split-share-list">${list.map(s => `<span class="split-share"><span>${esc(participantLabel(s.uid))}</span><strong class="num">${money(s.amount)}</strong></span>`).join('')}</div>` : `<p class="split-empty-note">${t('split.empty')}</p>`}`;
}
function updateSplitPreview() {
  const el = $('#split-live'); if (el) el.innerHTML = splitPreview();
  $$('[data-participant]').forEach(b => { const on = S.draft.split.includes(b.dataset.participant); b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', String(on)); });
}
function setCategory(k, manual) {
  if (!k || !CATS[k]) return;
  S.draft.category = k; if (manual) S.draft.manualCat = true;
  $$('[data-choice]').forEach(c => { const on = c.dataset.choice === k; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); });
  const el = $(`[data-choice="${k}"]`); if (el && el.scrollIntoView && !manual) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: canAnimate() ? 'smooth' : 'auto' });
}
function addExpenseSheet() {
  if (!S.group) { createGroupSheet(); return; }
  S.draft = { category: 'food', manualCat: false, split: S.members.map(m => m.uid) };
  const c = CURRENCIES[cur()];
  const cats = CAT_ORDER.map(k => `<button class="category-choice ${k === 'food' ? 'active' : ''}" data-choice="${k}" type="button" aria-pressed="${k === 'food'}">${categoryIcon(k)}<span>${catName(k)}</span></button>`).join('');
  openSheet(t('add.title'), `<form id="expense-form" novalidate>
    <div class="amount-entry"><label for="expense-amount">${t('add.howMuch')}</label><div class="amount-input"><span>${c.symbol}</span><input id="expense-amount" name="amount" inputmode="decimal" placeholder="${c.decimals ? '0.00' : '0'}" type="text" autocomplete="off" aria-label="${esc(t('add.howMuch'))}" required></div></div>
    <div class="ai-row"><button type="button" class="ai-chip" data-action="scan-receipt">${icon('camera', 'small-ico')} <span>${t('add.scan')}</span></button><button type="button" class="ai-chip" data-action="ai-toggle">${icon('spark', 'small-ico')} <span>${t('add.ai')}</span></button></div>
    <div class="ai-box" id="ai-box" hidden><input id="ai-text" placeholder="${esc(t('add.aiPh'))}" autocomplete="off"><button type="button" class="ai-go" data-action="ai-parse" aria-label="${esc(t('add.aiGo'))}">${icon('chevron')}</button></div>
    <div class="field"><label for="expense-title">${t('add.what')}</label><div class="title-wrap"><input id="expense-title" name="title" placeholder="${esc(t('add.whatPh'))}" maxlength="60" required><img class="title-logo" id="title-logo" alt="" hidden></div></div>
    <span class="field-label">${t('add.category')}</span><div class="category-choices scroll">${cats}</div>
    <div class="form-row"><div class="field"><label for="expense-payer">${t('add.paid')}</label><div class="select-wrap"><select id="expense-payer" name="payer">${S.members.map(m => `<option value="${m.uid}" ${m.uid === uid() ? 'selected' : ''}>${esc(m.uid === uid() ? t('youCap') : firstName(m.name))}</option>`).join('')}</select>${icon('down')}</div></div><div class="field"><label for="expense-day">${t('add.date')}</label><input id="expense-day" name="date" type="date" value="${ymd(new Date())}" max="${ymd(new Date())}" required></div></div>
    <fieldset class="split-fieldset"><legend>${t('add.shareWith')}</legend><div class="participant-options">${S.members.map(m => `<button type="button" class="participant-choice is-selected" data-participant="${m.uid}" aria-label="${esc(participantLabel(m.uid))}" aria-pressed="true"><span class="participant-avatar">${avatar(m)}<span class="participant-check">${icon('check', 'small-ico')}</span></span><span>${esc(participantLabel(m.uid))}</span></button>`).join('')}</div><div class="split-live" id="split-live" aria-live="polite">${splitPreview()}</div></fieldset>
    <div id="expense-error"></div>
    <div class="expense-submit-dock"><div class="submit-holder"><button class="full-btn save-expense-btn" type="submit">${t('add.save')}</button></div><p class="notice-inline">${esc(S.group.name)} · ${cur()}</p></div></form>`,
    { cls: 'expense-sheet', noFocus: true, onOpen: () => setTimeout(() => { const a = $('#expense-amount'); a && a.focus(); }, 60) });
}
// Mientras escribe el título: si es un comercio conocido, su logo y su categoría (sin IA)
const recOpen = () => !!(S.auto && S.auto.kind === 'recurring' && $('#recurring-form'));
function titleMerchant(text) {
  const m = merchantFor(text);
  // en el gasto fijo, escribir un comercio conocido lo deja elegido en "¿De qué es?"
  if (recOpen() && m && m.id !== S.auto.merchantId) { S.auto.merchantId = m.id; updateMerchantChoices(); }
  showTitleLogo(recOpen() ? merchantById(S.auto.merchantId) || m : m);
  if (S.draft.manualCat) return;
  const k = (m && m.cat) || guessCategory(text);
  if (k) setCategory(k, false);
}
function showTitleLogo(m) {
  const img = $('#title-logo'); if (!img) return;
  const src = merchantLogo(m);
  if (src) { if (img.getAttribute('src') !== src) img.src = src; img.alt = m.name; img.hidden = false; }
  else { img.hidden = true; img.removeAttribute('src'); }
  img.parentElement.classList.toggle('has-logo', !!src);
}
async function submitExpense(form) {
  const amount = parseAmount($('#expense-amount').value), title = $('#expense-title').value.trim();
  const payer = $('#expense-payer').value, date = $('#expense-day').value;
  if (!Number.isFinite(amount) || Math.round(amount * 100) <= 0 || amount > 1e9) return formError('expense-error', t('err.amount'));
  if (!title) return formError('expense-error', t('err.title'));
  if (!S.draft.split.length) return formError('expense-error', t('err.split'));
  const button = $('button[type="submit"]', form); if (button.disabled) return;
  formError('expense-error', '');
  const entry = { amount: round2(amount), description: title, category: S.draft.category, payerUid: payer, splitUids: [...S.draft.split], date: date ? new Date(date + 'T12:00:00') : new Date() };
  try {
    await Promise.all([buttonCheck(button), addExpenseDoc(entry)]);
  } catch (e) { console.error(e); button.disabled = false; button.innerHTML = t('add.save'); return formError('expense-error', t('err.save')); }
  if (!button.isConnected) return;
  expenseSuccess(entry);
}
function expenseSuccess(e) {
  const n = e.splitUids.length;
  openSheet(t('add.savedTitle'), `<div class="success"><div class="receipt-success" aria-hidden="true"><span class="receipt-back"></span><span class="receipt-front">${categoryIcon(e.category)}<i></i><i></i></span><span class="receipt-check">${drawnCheck()}</span></div><h2>${t('add.savedH')}</h2><span class="num">${money(e.amount)}</span><p>${esc(e.description)}<br>${t('people', n)} · ${n > 1 ? t('row.perPerson', money(e.amount / n)) : t('add.savedSolo')}</p><button class="full-btn" data-action="close">${t('btn.done')}</button></div>`);
}
// IA: escribir el gasto con palabras ("cena 45 con Ana") o leer la foto del recibo
function applyAi(d) {
  if (!d) return false;
  if (d.amount > 0) $('#expense-amount').value = d.amount;
  const desc = d.description || d.merchant || '';
  if (desc) $('#expense-title').value = desc;
  if (d.category && CATS[d.category]) setCategory(d.category, true);
  const match = name => { if (!name) return null; const n = fold(name); return S.members.find(m => { const mn = fold(m.name), mf = mn.split(' ')[0]; return mn === n || mf === n || (n.length >= 3 && (mn.startsWith(n) || n.startsWith(mf))); }); };
  const payer = match(d.paidBy); if (payer) $('#expense-payer').value = payer.uid;
  const pUid = $('#expense-payer').value;
  if (d.split === 'two' || d.split === 'full') { const o = match(d.splitWith); if (o) S.draft.split = d.split === 'two' ? [pUid, o.uid] : [o.uid]; }
  else if (d.split === 'solo') S.draft.split = [pUid];
  else if (d.split === 'all') S.draft.split = S.members.map(m => m.uid);
  updateSplitPreview();
  if (desc) titleMerchant(desc);
  S.pendingReceipt = { logoDomain: d.domain || '', logoEmoji: d.emoji || '', merchant: desc };
  return true;
}
async function aiParse() {
  const text = ($('#ai-text').value || '').trim(); if (!text) return;
  const b = $('[data-action="ai-parse"]'); b.classList.add('loading'); b.disabled = true;
  try { const d = await aiParseExpense(text); if (d && d.found && applyAi(d)) { toast(t('add.aiDone')); $('#ai-box').hidden = true; } else toast(t('add.aiFail'), 'info'); }
  catch (e) { console.error(e); toast(t('add.aiFail'), 'info'); }
  finally { b.classList.remove('loading'); b.disabled = false; }
}
async function scanReceiptFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return toast(t('err.image'), 'info');
  const chip = $('[data-action="scan-receipt"]'); if (chip) { chip.classList.add('loading'); chip.querySelector('span').textContent = t('add.reading'); }
  try {
    const b64 = await downscaleImage(file, 1600, 0.72);
    const d = await aiScanReceipt(b64);
    if (d && d.found && applyAi({ amount: d.amount, description: d.merchant, category: d.category, domain: d.domain, emoji: d.emoji })) toast(t('add.scanDone'));
    else toast(t('add.scanFail'), 'info');
  } catch (e) { console.error(e); toast(t('add.scanFail'), 'info'); }
  finally { if (chip && chip.isConnected) { chip.classList.remove('loading'); chip.querySelector('span').textContent = t('add.scan'); } }
}

// ───────────────────────── detalle ─────────────────────────
function detailSheet(id, gidHint) {
  const e = (S.expenses || []).find(x => x.id === id); if (!e) return;
  const d = expDate(e);
  const by = e.createdByUid ? firstName(nameOf(e.createdByUid)) : '';
  const line = (k, v) => `<div class="detail-line"><span>${k}</span><strong>${v}</strong></div>`;
  if (e.type === 'settle') {
    openSheet(t('detail.payTitle'), `${groupContext()}<div class="detail-hero">${expenseIcon(e)}<h3>${esc(t('row.settle', firstName(nameOf(e.paidByUid, e.paidBy)), firstName(nameOf(e.settledToUid, e.settledTo))))}</h3><span class="num">${money(e.amount)}</span><p>${fmtLong(d)}</p></div>
      <div class="detail-lines">${line(t('detail.from'), esc(nameOf(e.paidByUid, e.paidBy)))}${line(t('detail.to'), esc(nameOf(e.settledToUid, e.settledTo)))}${line(t('detail.method'), esc(methodName(e.method)))}${e.receiptNo ? line(t('detail.receipt'), esc(e.receiptNo)) : ''}${by ? line(t('detail.by'), esc(by)) : ''}</div>
      <button class="full-btn secondary" data-action="close">${t('btn.done')}</button><button class="text-btn danger-link" data-action="delete-expense" data-id="${e.id}">${icon('trash', 'small-ico')} ${t('detail.deletePay')}</button>`, { name: 'detail', args: [id] });
    return;
  }
  const sh = shares(e), parts = Object.entries(sh);
  const reparto = parts.length <= 1 ? (e.paidByUid in sh ? t('detail.solo') : t('detail.refund')) : t('detail.equal', parts.length);
  openSheet(t('detail.title'), `${groupContext()}<div class="detail-hero">${expenseIcon(e)}<h3>${esc(e.description)}</h3><span class="num">${money(e.amount)}</span><p>${fmtLong(d)}</p></div>
    <div class="detail-lines">${line(t('detail.paid'), esc(nameOf(e.paidByUid, e.paidBy)))}${line(t('detail.category'), esc(catName(e.category)))}${line(t('detail.split'), reparto)}${parts.map(([u, v]) => `<div class="detail-line"><span>${esc(u === uid() ? t('youCap') : firstName(nameOf(u)))}</span><strong class="num">${money(v)}</strong></div>`).join('')}${by ? line(t('detail.by'), esc(by)) : ''}</div>
    ${e.note ? `<div class="note-box"><span>${t('detail.note')}</span><p>${esc(e.note)}</p></div>` : ''}
    <button class="full-btn secondary" data-action="close">${t('btn.done')}</button><button class="text-btn danger-link" data-action="delete-expense" data-id="${e.id}">${icon('trash', 'small-ico')} ${t('detail.delete')}</button>`, { name: 'detail', args: [id] });
}

// ───────────────────────── pagar (liquidar) ─────────────────────────
function payRows(otherUid, amount) {
  const list = payMethodsOf(otherUid).sort((a, b) => (PAY[b.type].link ? 1 : 0) - (PAY[a.type].link ? 1 : 0));
  if (!list.length) return '';
  const plain = Number(amount || 0).toFixed(2);
  return `<span class="field-label">${t('pay.with', esc(firstName(nameOf(otherUid))))}</span><div class="pay-list">${list.map(m => {
    const p = PAY[m.type], direct = !!p.link, withAmt = direct && cur() === 'USD';
    const go = direct
      ? `<a class="pay-go" href="${esc(p.link(m.value, withAmt ? plain : '', 'SpentShare · ' + (S.group ? S.group.name : '')))}" target="_blank" rel="noopener" data-paid-with="${m.type}">${withAmt ? t('pay.payAmt', money(amount)) : t('pay.open', payName(m.type))}</a>`
      : `<button type="button" class="pay-go copy" data-action="copy-pay" data-type="${m.type}" data-value="${esc(m.value)}">${t('pay.copy')}</button>`;
    return `<div class="pay-row">${payMark(m.type)}<span class="pay-copy"><strong>${esc(payName(m.type))}</strong><span>${esc(m.value)}</span></span>${go}</div>`;
  }).join('')}</div><div id="copied-box"></div>`;
}
function settleSheet(otherUid, opts = {}) {
  const me = uid();
  const owe = pairOwes(me, otherUid);
  const req = pendingRequest(otherUid, me);
  const amount = round2(opts.amount || (owe > 0 ? owe : (req ? req.amount - (req.paidAmount || 0) : 0)));
  const methods = payMethodsOf(otherUid).map(m => m.type);
  const options = [...new Set([...methods, ...(cur() === 'COP' ? ['nequi', 'breb'] : ['zelle', 'venmo']), 'transfer', 'cash', 'other'])];
  const def = opts.via && options.includes(opts.via) ? opts.via : (methods[0] || options[0]);
  S.payDraft = { otherUid, amount, requestId: (opts.requestId || (req && req.id) || ''), method: def };
  openSheet(t('settle.title'), `<div class="settle-flow"><div class="settle-person">${avatar(me)}${t('youCap')}</div><div class="flow-connector"></div><div class="settle-person">${avatar(otherUid)}${esc(firstName(nameOf(otherUid)))}</div></div>
    <p class="chart-label" style="text-align:center">${t('settle.recording')}</p><div class="num settle-total" id="settle-total">${money(amount)}</div>
    <div class="field" id="settle-amount-field" hidden><label for="settle-amount">${t('settle.amount')}</label><input id="settle-amount" inputmode="decimal" value="${CURRENCIES[cur()].decimals ? amount.toFixed(2) : Math.round(amount)}"></div>
    <button type="button" class="text-btn" data-action="settle-edit-amount" style="margin:-16px auto 14px">${t('settle.partial')}</button>
    ${req ? `<p class="payment-notice">${t('settle.paysRequest', esc(req.number || ''))}</p>` : ''}
    ${payRows(otherUid, amount)}
    <div class="field"><label for="settle-method">${t('settle.how')}</label><div class="select-wrap"><select id="settle-method">${options.map(m => `<option value="${m}" ${m === def ? 'selected' : ''}>${esc(methodName(m))}</option>`).join('')}</select>${icon('down')}</div></div>
    <p class="payment-notice">${t('settle.notice')}</p>
    <div id="settle-error"></div>
    <div class="submit-holder"><button class="full-btn" data-action="confirm-settle">${icon('check')} ${t('settle.record')}</button></div>`, { name: 'settle', args: [otherUid] });
  if (opts.via && PAY[opts.via] && !PAY[opts.via].link) {
    const m = payMethodsOf(otherUid).find(x => x.type === opts.via);
    if (m) showCopied(m.type, m.value);
  }
}
async function showCopied(type, value) {
  const ok = await copyText(String(value).replace(/\s/g, ''));
  const amt = money(S.payDraft ? currentSettleAmount() : 0);
  const box = $('#copied-box'); if (!box) return;
  box.innerHTML = `<div class="copied-box">${ok ? t('pay.copied') : t('pay.copyThis')}<b>${esc(value)}</b><ol class="steps-list"><li>${t('pay.step1')}</li><li>${t('pay.step2', esc(payName(type)))}</li><li>${t('pay.step3', amt)}</li></ol></div>`;
  const sel = $('#settle-method'); if (sel) sel.value = type;
}
function currentSettleAmount() {
  const f = $('#settle-amount-field');
  if (f && !f.hidden) { const v = parseAmount($('#settle-amount').value); return Number.isFinite(v) ? v : 0; }
  return S.payDraft ? S.payDraft.amount : 0;
}
async function confirmSettle(button) {
  const d = S.payDraft; if (!d) return;
  const amount = round2(currentSettleAmount());
  if (!(amount > 0)) return formError('settle-error', t('err.amount'));
  const method = $('#settle-method') ? $('#settle-method').value : d.method;
  try { await Promise.all([buttonCheck(button), addSettleDoc({ fromUid: uid(), toUid: d.otherUid, amount, method, requestId: d.requestId })]); }
  catch (e) { console.error(e); button.disabled = false; button.innerHTML = `${icon('check')} ${t('settle.record')}`; return formError('settle-error', t('err.save')); }
  if (!button.isConnected) return;
  celebrate(uid(), d.otherUid, t('settle.doneH'), t('settle.doneP'), t('settle.doneTag'));
}
function celebrate(a, b, h, p, tag) {
  openSheet(t('settle.doneTitle'), `<div class="success"><div class="settle-celebration" aria-hidden="true"><span class="settle-friend first">${avatar(a, 'big')}</span><span class="settle-friend second">${avatar(b, 'big')}</span><span class="friend-check">${drawnCheck()}</span></div><h2>${h}</h2><p>${p}</p><div class="settled-tag">${icon('check', 'small-ico')} ${tag}</div><button class="full-btn" data-action="close" style="margin-top:23px">${t('btn.backHome')}</button></div>`);
}

// ───────────────────────── cobrar ─────────────────────────
function requestSheet(otherUid) {
  const me = uid();
  const owed = round2(-pairOwes(me, otherUid));           // lo que me debe
  const req = pendingRequest(me, otherUid);
  const flow = `<div class="settle-flow"><div class="settle-person">${avatar(otherUid)}${esc(firstName(nameOf(otherUid)))}</div><div class="flow-connector"></div><div class="settle-person">${avatar(me)}${t('youCap')}</div></div>`;
  S.reqDraft = { otherUid, due: 7, requestId: req && req.id };
  if (req) {
    const left = round2(req.amount - (req.paidAmount || 0));
    openSheet(t('req.sentTitle'), `${flow}<p class="chart-label" style="text-align:center">${t('req.number', esc(req.number || ''))}</p><div class="num settle-total">${money(left)}</div>
      <div class="detail-lines">${req.createdAt ? `<div class="detail-line"><span>${t('req.sentOn')}</span><strong>${fmtLong(toDate(req.createdAt))}</strong></div>` : ''}${req.dueAt ? `<div class="detail-line"><span>${t('req.due')}</span><strong>${fmtLong(toDate(req.dueAt))}</strong></div>` : ''}${req.paidAmount ? `<div class="detail-line"><span>${t('req.paidSoFar')}</span><strong class="num">${money(req.paidAmount)}</strong></div>` : ''}${req.note ? `<div class="detail-line"><span>${t('req.note')}</span><strong>${esc(req.note)}</strong></div>` : ''}</div>
      <div id="req-error"></div>
      <div class="submit-holder"><button class="full-btn" data-action="received" data-uid="${otherUid}">${icon('check')} ${t('req.received')}</button></div>
      <button class="full-btn secondary" data-action="cancel-request" style="margin-top:10px">${t('req.cancel')}</button>`, { name: 'request', args: [otherUid] });
    return;
  }
  openSheet(t('req.title', esc(firstName(nameOf(otherUid)))), `${flow}<p class="chart-label" style="text-align:center">${t('req.youAsk')}</p><div class="num settle-total">${money(owed)}</div>
    <div class="field"><label for="req-note">${t('req.noteLbl')}</label><input id="req-note" maxlength="140" placeholder="${esc(t('req.notePh'))}"></div>
    <span class="field-label">${t('req.dueIn')}</span><div class="pills" style="margin:6px 0 18px">${[3, 7, 15, 30].map(n => `<button type="button" class="pill ${n === 7 ? 'active' : ''}" data-due="${n}" aria-pressed="${n === 7}">${t('days', n)}</button>`).join('')}</div>
    <p class="payment-notice">${t('req.notice', esc(firstName(nameOf(otherUid))))}</p>
    <div id="req-error"></div>
    <div class="submit-holder"><button class="full-btn" data-action="send-request">${icon('send')} ${t('req.send')}</button></div>
    <button class="full-btn secondary" data-action="received" data-uid="${otherUid}" style="margin-top:10px">${t('req.alreadyPaid')}</button>
    <button class="text-btn auto-link" data-action="auto-charge">${icon('clock', 'small-ico')} ${t('auto.fromReq')}</button>`, { name: 'request', args: [otherUid] });
}
async function sendRequestNow(button) {
  const d = S.reqDraft; if (!d) return;
  const note = ($('#req-note') || {}).value || '';
  buttonBusy(button, true, t('req.sending'));
  try {
    const r = await sendRequest(d.otherUid, note.trim(), d.due);
    const name = firstName(nameOf(d.otherUid));
    openSheet(t('req.doneTitle'), `<div class="success"><div class="success-mark">${icon('send')}</div><h2>${t('req.doneH')}</h2><span class="num">${money(r && r.amount)}</span><p>${t('req.doneP', esc(name), r && r.dueAt ? fmtLong(new Date(r.dueAt)) : '')}</p><div class="settled-tag">${icon('mail', 'small-ico')} ${esc(r && r.number || '')}</div><button class="full-btn" data-action="close" style="margin-top:23px">${t('btn.backHome')}</button></div>`);
  } catch (e) {
    console.error(e); buttonBusy(button, false);
    formError('req-error', String(e && e.message || '').includes('no-debt') ? t('req.noDebt') : t('req.fail'));
  }
}
async function markReceived(otherUid, button) {
  const owed = round2(-pairOwes(uid(), otherUid));
  const req = pendingRequest(uid(), otherUid);
  if (!(owed > 0)) return formError('req-error', t('req.noDebt'));
  try { await Promise.all([buttonCheck(button), addSettleDoc({ fromUid: otherUid, toUid: uid(), amount: owed, method: 'other', requestId: req ? req.id : '' })]); }
  catch (e) { console.error(e); return formError('req-error', t('err.save')); }
  celebrate(otherUid, uid(), t('settle.doneH'), t('req.receivedP', esc(firstName(nameOf(otherUid)))), t('settle.doneTag'));
}

// ───────────────────────── automático: cobro periódico y gastos fijos ─────────────────────────
// El servidor (autoBilling, todos los días a las 8:00) hace el trabajo; aquí solo se programa.
S.auto = null;   // borrador de la hoja abierta: { kind: 'charge' | 'recurring', frequency, day, dueDays, … }
const pickPill = (key, val, label, on) => `<button type="button" class="pill ${on ? 'active' : ''}" data-pick="${key}" data-val="${val}" aria-pressed="${on}">${label}</button>`;
const whenLabel = d => d ? `${L().daysLong[(d.getDay() + 6) % 7]}${lang === 'en' ? ',' : ''} ${fmtLong(d)}` : '—';
function scheduleHtml(d) {
  const freq = FREQS.map(f => pickPill('frequency', f, t('freq.' + f), d.frequency === f)).join('');
  let day;
  if (d.frequency === 'weekly') day = `<span class="field-label">${t('auto.weekday')}</span><div class="pills weekday-pills">${L().daysMed.map((n, i) => pickPill('day', i + 1, n, Number(d.day) === i + 1)).join('')}</div>`;
  else if (d.frequency === 'monthly') day = `<div class="field"><label for="auto-day">${t('auto.monthDay')}</label><div class="select-wrap"><select id="auto-day">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${Number(d.day) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>${icon('down')}</div></div>`;
  else day = `<p class="auto-hint">${t('auto.biweeklyHint')}</p>`;
  return `<span class="field-label">${t('auto.frequency')}</span><div class="pills">${freq}</div>${day}`;
}
const dueHtml = d => `<span class="field-label">${t('auto.dueIn')}</span><div class="pills">${[3, 7, 15, 30].map(n => pickPill('dueDays', n, t('days', n), Number(d.dueDays) === n)).join('')}</div>`;
function autoPick(el) {
  const d = S.auto; if (!d) return;
  const key = el.dataset.pick, raw = el.dataset.val, val = /^\d+$/.test(raw) ? Number(raw) : raw;
  d[key] = val;
  if (key === 'frequency') { d.day = d.orig && d.orig.frequency === val ? d.orig.day : defaultDay(val); $('#sched-box').innerHTML = scheduleHtml(d); }
  else $$(`[data-pick="${key}"]`).forEach(b => { const on = b === el; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  autoRefresh();
}
function autoRefresh() { const p = $('#auto-preview'); if (p && S.auto) p.innerHTML = S.auto.kind === 'charge' ? autoPreview() : recPreview(); }

// Mi cobro automático en este grupo
function autoChargeSheet() {
  if (!S.group) return;
  const saved = S.autoCharges[uid()] || null;
  const freq = saved && FREQS.includes(saved.frequency) ? saved.frequency : 'monthly';
  S.auto = { kind: 'charge', enabled: saved ? !!saved.enabled : true, frequency: freq, day: saved ? saved.day : defaultDay(freq), dueDays: (saved && saved.dueDays) || 7, minAmount: (saved && saved.minAmount) || 0, orig: saved ? { frequency: saved.frequency, day: saved.day } : null };
  const c = CURRENCIES[cur()];
  openSheet(t('auto.chargeTitle'), `${groupContext()}<p class="sheet-intro" style="margin-top:16px">${t('auto.chargeIntro')}</p>
    <form id="auto-form" novalidate>
    <div class="menu-list"><button type="button" class="menu-row" data-action="auto-toggle" role="switch" aria-checked="${S.auto.enabled}">${icon('clock')}<span>${t('auto.enable')}</span><i class="switch ${S.auto.enabled ? 'on' : ''}" aria-hidden="true"></i></button></div>
    <div id="auto-fields" class="auto-fields ${S.auto.enabled ? '' : 'is-off'}">
      <div id="sched-box">${scheduleHtml(S.auto)}</div>
      ${dueHtml(S.auto)}
      <div class="form-row"><div class="field"><label for="auto-min">${t('auto.min')}</label><input id="auto-min" inputmode="decimal" value="${S.auto.minAmount || ''}" placeholder="${c.symbol}0" autocomplete="off"></div><div></div></div>
      <div class="field"><label for="auto-note">${t('auto.noteLbl')}</label><input id="auto-note" maxlength="140" value="${esc((saved && saved.note) || '')}" placeholder="${esc(t('auto.notePh'))}" autocomplete="off"></div>
    </div>
    <div class="auto-preview" id="auto-preview" aria-live="polite">${autoPreview()}</div>
    <div id="auto-error"></div>
    <div class="submit-holder"><button class="full-btn" type="submit">${t('auto.save')}</button></div>
    <p class="notice-inline">${t('auto.foot')}</p></form>`, { name: 'auto-charge' });
}
function autoPreview() {
  const d = S.auto;
  if (!d.enabled) return `<p>${t('auto.offNote')}</p>`;
  const raw = (($('#auto-min') || {}).value || '').trim();
  const min = raw ? parseAmount(raw) : Number(d.minAmount) || 0;
  const list = autoChargeTargets(Number.isFinite(min) ? min : 0);
  const people = list.length
    ? `<p>${t('auto.wouldCharge')}</p><div class="auto-people">${list.map(x => `<span class="auto-person ${x.pending ? 'muted' : ''}">${avatar(x.uid)}<span><strong>${esc(firstName(nameOf(x.uid)))}</strong> · <b class="num">${money(x.amount)}</b>${x.pending ? `<small>${t('auto.hasPending')}</small>` : ''}</span></span>`).join('')}</div>`
    : `<p>${t('auto.nobody')}</p>`;
  return `<p class="auto-next">${icon('calendar', 'small-ico')} <span>${t('auto.next', whenLabel(firstRunDate(d)))}</span></p>${people}`;
}
async function submitAuto(form) {
  const d = S.auto, raw = $('#auto-min').value.trim();
  const min = raw ? parseAmount(raw) : 0;
  if (!Number.isFinite(min) || min < 0 || min > 1e9) return formError('auto-error', t('auto.errMin'));
  const b = $('button[type="submit"]', form); if (b.disabled) return;
  formError('auto-error', '');
  const data = { enabled: !!d.enabled, frequency: d.frequency, day: Number(d.day) || 1, minAmount: round2(min), dueDays: Number(d.dueDays) || 7, note: $('#auto-note').value.trim().slice(0, 140) };
  try { await Promise.all([buttonCheck(b), saveAutoCharge(data)]); }
  catch (e) { console.error(e); b.disabled = false; b.innerHTML = t('auto.save'); return formError('auto-error', t('err.save')); }
  closeSheet(); toast(data.enabled ? t('auto.saved') : t('auto.savedOff'));
}

// Gasto fijo: se anota solo (y si quien paga quiere, manda el cobro a cada uno)
const participantsHtml = () => `<fieldset class="split-fieldset"><legend>${t('add.shareWith')}</legend><div class="participant-options">${S.members.map(m => { const on = S.draft.split.includes(m.uid); return `<button type="button" class="participant-choice ${on ? 'is-selected' : ''}" data-participant="${m.uid}" aria-label="${esc(participantLabel(m.uid))}" aria-pressed="${on}"><span class="participant-avatar">${avatar(m)}<span class="participant-check">${icon('check', 'small-ico')}</span></span><span>${esc(participantLabel(m.uid))}</span></button>`; }).join('')}</div><div class="split-live" id="split-live" aria-live="polite">${splitPreview()}</div></fieldset>`;
function recurringSheet(id) {
  if (!S.group) return;
  const r = id ? S.recurring.find(x => x.id === id) : null;
  if (id && !r) return;
  if (r && r.createdByUid !== uid()) return recurringReadOnly(r);
  const freq = r && FREQS.includes(r.frequency) ? r.frequency : 'monthly';
  const payer = r && memberUids().includes(r.payerUid) ? r.payerUid : uid();
  const known = r && (merchantById(r.merchantId) || merchantFor(r.description));
  S.auto = { kind: 'recurring', id: r ? r.id : null, merchantId: known ? known.id : null, mq: '', payer, frequency: freq, day: r ? r.day : defaultDay(freq), dueDays: (r && r.dueDays) || 7, sendCharge: !!(r && r.sendCharge), orig: r ? { frequency: r.frequency, day: r.day } : null };
  const cat = r && CATS[r.category] ? r.category : 'home';
  const split = r ? (r.splitUids || []).filter(u => memberUids().includes(u)) : [];
  S.draft = { category: cat, manualCat: !!r, split: split.length ? split : S.members.map(m => m.uid) };
  S.pendingReceipt = null;
  const c = CURRENCIES[cur()];
  const cats = CAT_ORDER.map(k => `<button class="category-choice ${k === cat ? 'active' : ''}" data-choice="${k}" type="button" aria-pressed="${k === cat}">${categoryIcon(k)}<span>${catName(k)}</span></button>`).join('');
  openSheet(t('rec.title'), `${groupContext()}${r ? '' : `<p class="sheet-intro" style="margin-top:16px">${t('rec.intro')}</p>`}<form id="recurring-form" novalidate>
    <div class="amount-entry"><label for="expense-amount">${t('add.howMuch')}</label><div class="amount-input"><span>${c.symbol}</span><input id="expense-amount" inputmode="decimal" placeholder="${c.decimals ? '0.00' : '0'}" value="${r ? esc(r.amount) : ''}" type="text" autocomplete="off" aria-label="${esc(t('add.howMuch'))}" required></div></div>
    <div class="field"><label for="expense-title">${t('add.what')}</label><div class="title-wrap"><input id="expense-title" placeholder="${esc(t('rec.ph'))}" maxlength="60" value="${esc(r ? r.description : '')}" required><img class="title-logo" id="title-logo" alt="" hidden></div></div>
    <span class="field-label">${t('rec.whatIs')} <em class="opt">${t('rec.optional')}</em></span>
    <div class="merchant-search">${icon('search', 'small-ico')}<input id="merchant-q" placeholder="${esc(t('rec.searchPh'))}" autocomplete="off" aria-label="${esc(t('rec.whatIs'))}"></div>
    <div class="category-choices scroll merchant-choices" id="merchant-choices">${merchantChoices()}</div>
    <span class="field-label">${t('add.category')}</span><div class="category-choices scroll">${cats}</div>
    <div class="field"><label for="expense-payer">${t('add.paid')}</label><div class="select-wrap"><select id="expense-payer">${S.members.map(m => `<option value="${m.uid}" ${m.uid === payer ? 'selected' : ''}>${esc(m.uid === uid() ? t('youCap') : firstName(m.name))}</option>`).join('')}</select>${icon('down')}</div></div>
    ${participantsHtml()}
    <div class="field"><label for="rec-note">${t('rec.noteLbl')}</label><input id="rec-note" maxlength="140" value="${esc((r && r.note) || '')}" placeholder="${esc(t('rec.notePh'))}" autocomplete="off"></div>
    <div id="sched-box">${scheduleHtml(S.auto)}</div>
    <div id="rec-charge">${recChargeHtml()}</div>
    <div class="auto-preview" id="auto-preview" aria-live="polite">${recPreview()}</div>
    <div id="rec-error"></div>
    <div class="submit-holder"><button class="full-btn" type="submit">${t('rec.save')}</button></div>
    ${r ? `<button type="button" class="full-btn secondary" data-action="recurring-pause" style="margin-top:10px">${r.active === false ? t('rec.resume') : t('rec.pause')}</button><button type="button" class="danger-link" data-action="recurring-delete">${icon('trash', 'small-ico')} ${t('rec.delete')}</button>` : ''}
    </form>`, { cls: 'expense-sheet', noFocus: true, name: 'recurring', onOpen: () => { if (r) titleMerchant(r.description); else setTimeout(() => { const a = $('#expense-amount'); a && a.focus(); }, 60); } });
}
// "¿De qué es?": elegir el comercio (su logo sale en la app y en los correos). Sin búsqueda se ven
// los más comunes para gastos fijos; con búsqueda, todo el catálogo.
const FIXED_PICKS = ['netflix', 'spotify', 'youtube', 'disney', 'hulu', 'max', 'amazon', 'apple', 'xbox', 'playstation', 'anthropic',
  'tmobile', 'att', 'verizon', 'xfinity', 'spectrum', 'comed', 'nicor', 'peoplesgas', 'statefarm', 'geico', 'ventra',
  'movistar', 'claro', 'tigo', 'enel', 'epm', 'vanti'];
function merchantChoices() {
  if (!window.SSMerchants) return '';
  const d = S.auto, q = fold(d.mq || '').trim();
  let list = q
    ? SSMerchants.LIST.filter(m => fold(m.name).includes(q) || m.aliases.some(a => a.includes(q))).slice(0, 24)
    : FIXED_PICKS.map(merchantById).filter(Boolean);
  const sel = merchantById(d.merchantId);
  if (sel) list = [sel, ...list.filter(m => m !== sel)];   // el elegido, primero (siempre a la vista)
  if (!list.length) return `<p class="auto-hint">${t('rec.noMerchant')}</p>`;
  return list.map(m => {
    const on = m.id === d.merchantId;
    return `<button type="button" class="category-choice merchant-choice ${on ? 'active' : ''}" data-merchant="${m.id}" aria-pressed="${on}"><span class="merchant-tile">${m.logo ? `<img src="logos/${m.id}.png" alt="" loading="lazy">` : `<span aria-hidden="true">${m.emoji || '🏷️'}</span>`}</span><span class="merchant-name">${esc(m.name)}</span></button>`;
  }).join('');
}
function updateMerchantChoices() { const el = $('#merchant-choices'); if (el) { el.innerHTML = merchantChoices(); el.scrollLeft = 0; } }
// marcar sin volver a dibujar (al tocar un logo la fila no salta)
function markMerchantChoices() {
  if (S.auto.merchantId && !$(`[data-merchant="${S.auto.merchantId}"]`)) return updateMerchantChoices();
  $$('[data-merchant]').forEach(b => { const on = b.dataset.merchant === S.auto.merchantId; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
}
function pickMerchant(id) {
  const d = S.auto; if (!d) return;
  const prev = merchantById(d.merchantId), m = d.merchantId === id ? null : merchantById(id);   // tocar el elegido lo quita
  d.merchantId = m ? m.id : null;
  const title = $('#expense-title');
  if (m && title && (!title.value.trim() || (prev && title.value.trim() === prev.name))) title.value = m.name;
  if (m && m.cat && !S.draft.manualCat) setCategory(m.cat, false);
  markMerchantChoices();
  showTitleLogo(m || merchantFor(title ? title.value : ''));
}
function recChargeHtml() {
  const d = S.auto;
  if (d.payer !== uid()) return `<p class="auto-hint">${t('rec.notifyHint')} ${t('rec.onlyPayer')}</p>`;
  return `<div class="menu-list" style="margin-top:4px"><button type="button" class="menu-row" data-action="rec-charge-toggle" role="switch" aria-checked="${d.sendCharge}">${icon('send')}<span>${t('rec.sendCharge')}</span><i class="switch ${d.sendCharge ? 'on' : ''}" aria-hidden="true"></i></button></div><p class="auto-hint" style="margin-top:10px">${d.sendCharge ? t('rec.sendChargeHint') : t('rec.notifyHint')}</p>${d.sendCharge ? dueHtml(d) : ''}`;
}
function recPreview() {
  const d = S.auto, r = d.id && S.recurring.find(x => x.id === d.id);
  if (r && r.active === false) return `<p class="auto-next">${icon('clock', 'small-ico')} <span>${t('auto.paused')}</span></p>`;
  const same = r && r.frequency === d.frequency && Number(r.day) === Number(d.day) && toDate(r.nextRunAt);
  const next = same ? toDate(r.nextRunAt) : firstRunDate(d);
  return `<p class="auto-next">${icon('calendar', 'small-ico')} <span>${t(r ? 'rec.next' : 'rec.first', whenLabel(next))}</span></p>`;
}
async function submitRecurring(form) {
  const d = S.auto;
  const amount = parseAmount($('#expense-amount').value), title = $('#expense-title').value.trim(), payer = $('#expense-payer').value;
  if (!Number.isFinite(amount) || Math.round(amount * 100) <= 0 || amount > 1e9) return formError('rec-error', t('err.amount'));
  if (!title) return formError('rec-error', t('err.title'));
  if (!S.draft.split.length) return formError('rec-error', t('err.split'));
  const b = $('button[type="submit"]', form); if (b.disabled) return;
  formError('rec-error', '');
  const note = ($('#rec-note') || {}).value || '';   // opcional: puede quedar vacío
  const merchantId = merchantById(d.merchantId) ? d.merchantId : null;   // "¿De qué es?" (opcional)
  const data = { description: title, amount: round2(amount), category: S.draft.category, payerUid: payer, splitUids: [...S.draft.split], frequency: d.frequency, day: Number(d.day) || 1, sendCharge: payer === uid() && !!d.sendCharge, dueDays: Number(d.dueDays) || 7, note: note.trim().slice(0, 140), merchantId };
  const r = d.id && S.recurring.find(x => x.id === d.id);
  // fecha de la próxima vez: nueva si es nuevo o si cambió cuándo se repite (si está pausado, al reanudar)
  if (!r) Object.assign(data, { active: true, nextRunAt: window._Timestamp.fromDate(firstRunDate(data)) });
  else if (r.active !== false && (r.frequency !== data.frequency || Number(r.day) !== data.day)) data.nextRunAt = window._Timestamp.fromDate(firstRunDate(data));
  try { await Promise.all([buttonCheck(b), saveRecurring(r ? r.id : null, data)]); }
  catch (e) { console.error(e); b.disabled = false; b.innerHTML = t('rec.save'); return formError('rec-error', t('err.save')); }
  closeSheet(); toast(t('rec.saved'));
}
async function toggleRecurring() {
  const r = S.auto && S.recurring.find(x => x.id === S.auto.id); if (!r) return;
  const resume = r.active === false;
  try { await saveRecurring(r.id, resume ? { active: true, nextRunAt: window._Timestamp.fromDate(firstRunDate(r)) } : { active: false }); closeSheet(); toast(t(resume ? 'rec.resumed' : 'rec.paused')); }
  catch (e) { console.error(e); formError('rec-error', t('err.save')); }
}
function recurringReadOnly(r) {
  const nx = toDate(r.nextRunAt), who = u => u === uid() ? t('youCap') : firstName(nameOf(u));
  openSheet(t('rec.title'), `${groupContext()}<div class="detail-hero">${expenseIcon(r)}<h3>${esc(r.description)}</h3><span class="num">${money(r.amount)}</span><p>${esc(scheduleLabel(r))}</p></div>
    <div class="detail-lines"><div class="detail-line"><span>${t('rec.paidBy')}</span><strong>${esc(who(r.payerUid))}</strong></div><div class="detail-line"><span>${t('rec.split')}</span><strong>${esc((r.splitUids || []).map(who).join(', '))}</strong></div><div class="detail-line"><span>${t('rec.when')}</span><strong>${r.active === false ? t('auto.paused') : esc(whenLabel(nx))}</strong></div><div class="detail-line"><span>${t('rec.charges')}</span><strong>${r.sendCharge ? t('rec.yes') : t('rec.no')}</strong></div></div>
    ${r.note ? `<div class="note-box"><span>${t('detail.note')}</span><p>${esc(r.note)}</p></div>` : ''}
    <p class="notice-inline">${t('rec.notMine', esc(firstName(nameOf(r.createdByUid))))}</p>`);
}

// ───────────────────────── miembros, grupos, invitar ─────────────────────────
function membersHtml() {
  const list = S.expenses || [];
  return `${groupContext()}<div class="chart-card" style="padding:0 15px;margin-top:16px">${S.members.map(m => {
    const n = netOf(m.uid, list);
    return `<div class="member-row">${avatar(m)}<div class="copy"><strong>${esc(m.name || '?')}${m.uid === uid() ? ' · ' + t('you') : ''}</strong><small>${m.uid === (S.group && S.group.createdBy) ? t('members.admin') : esc(m.email || t('members.member'))}</small></div><span class="num ${n > 0.005 ? 'positive' : n < -0.005 ? 'negative' : ''}">${signedMoney(n)}</span></div>`;
  }).join('')}</div><p class="notice-inline">${t('members.legend')}</p>
  <button class="full-btn secondary" data-action="invite" style="margin-top:18px">${icon('link')} ${t('btn.invite')}</button>
  <button class="text-btn danger-link" data-action="delete-group">${icon('trash', 'small-ico')} ${t('members.delete')}</button>`;
}
const membersSheet = () => S.group && openSheet(t('members.title'), membersHtml(), { name: 'members' });

function switchGroupSheet() {
  openSheet(t('switch.title'), `<p class="sheet-intro">${t('switch.intro')}</p>${S.groups.map(g => `<button class="group-card ${g.id === S.gid ? 'active' : ''}" data-group="${g.id}" style="margin-bottom:10px"><span class="group-symbol" style="background:${themeFor(g).bg}">${esc(g.emoji || '✨')}</span><span class="copy"><h3>${esc(g.name)}</h3><p>${t('members', (g.memberUids || []).length || 1)} · ${g.currency || 'USD'}</p></span>${g.id === S.gid ? icon('check') : icon('chevron', 'small-ico')}</button>`).join('')}<button class="full-btn secondary" data-action="create-group" style="margin-top:20px">${icon('plus')} ${t('switch.new')}</button>`);
}

function inviteSheet() {
  if (!S.group) return;
  openSheet(t('invite.title'), `<span class="big-emoji" aria-hidden="true">💜</span><p class="sheet-intro" style="text-align:center">${t('invite.intro', esc(S.group.name))}</p><div class="code-box">${esc(S.group.inviteCode || '—')}</div>
    <button class="full-btn" data-action="copy-link">${icon('link')} ${t('invite.copyLink')}</button>
    ${navigator.share ? `<button class="full-btn secondary" data-action="share-link" style="margin-top:10px">${icon('send')} ${t('invite.share')}</button>` : ''}
    <form id="invite-form" novalidate style="margin-top:22px"><div class="field"><label for="invite-email">${t('invite.byEmail')}</label><input id="invite-email" type="email" placeholder="${esc(t('auth.emailPh'))}" autocomplete="email"></div><div id="invite-error"></div><button class="full-btn secondary" type="submit">${icon('mail')} ${t('invite.send')}</button></form>
    <p class="notice-inline">${t('invite.foot')}</p>`);
}
async function submitInvite(form) {
  const email = $('#invite-email').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return formError('invite-error', t('err.email'));
  const b = $('button[type="submit"]', form); buttonBusy(b, true, t('invite.sending'));
  try {
    const r = await sendInviteEmail(email);
    buttonBusy(b, false);
    if (r && r.reason === 'already-member') return formError('invite-error', t('invite.already'));
    $('#invite-email').value = ''; formError('invite-error', ''); toast(t('invite.sent', email));
  } catch (e) { console.error(e); buttonBusy(b, false); formError('invite-error', t('invite.fail')); }
}

function joinSheet() {
  openSheet(t('join.title'), `<form id="join-form" novalidate><p class="sheet-intro">${t('join.intro')}</p><div class="field"><label for="invite-code">${t('join.code')}</label><input id="invite-code" name="code" placeholder="AB-CD12" autocomplete="off" autocapitalize="characters" maxlength="14" style="text-transform:uppercase;letter-spacing:3px;text-align:center;font-size:21px" required></div><div id="join-error"></div><button class="full-btn" type="submit">${t('join.btn')}</button></form>`);
}
async function submitJoin(form, code) {
  code = (code || $('#invite-code').value || '').trim().toUpperCase();
  if (!code) return formError('join-error', t('join.empty'));
  const b = $('button[type="submit"],[data-action="accept-invite"]', form || document); buttonBusy(b, true, t('join.joining'));
  try {
    const g = await joinByCode(code);
    if (!g) { buttonBusy(b, false); return formError('join-error', t('join.notFound')); }
    clearPendingJoin(); closeSheet(false); openGroup(g.id); go('home'); toast(t('join.done', g.name));
  } catch (e) { console.error(e); buttonBusy(b, false); formError('join-error', t('err.save')); }
}
// Abrió un enlace ?unirse= con la sesión iniciada: invitación encima
function acceptInviteSheet(j) {
  openSheet(t('join.sheetTitle'), `${inviteBanner(j)}<p class="sheet-intro">${t('join.sheetP', esc(j.f || ''))}</p><div id="join-error"></div><button class="full-btn" data-action="accept-invite">${t('join.btn')}</button><button class="full-btn secondary" data-action="decline-invite" style="margin-top:10px">${t('join.notNow')}</button>`);
}

// ───────────────────────── diseñador de grupo (crear / personalizar) ─────────────────────────
S.groupDraft = null;
function groupPreview() {
  const d = S.groupDraft, th = themeFor(d);
  return `<div class="group-design-card" style="--preview-bg:${th.bg};--preview-ink:${th.ink}">${cover(d)}<span class="group-design-symbol">${esc(d.emoji)}</span><strong>${esc(d.name || t('design.placeholderName'))}</strong><span>${t('design.looks')}</span></div>`;
}
function updateGroupPreview() {
  const el = $('#group-design-preview'); if (el) el.innerHTML = groupPreview();
  const d = S.groupDraft;
  $$('[data-theme]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.theme === d.theme)));
  $$('[data-cover]').forEach(el => { const on = el.dataset.cover === d.cover; el.classList.toggle('active', on); el.setAttribute('aria-pressed', String(on)); });
  $$('[data-emoji]').forEach(el => { const on = el.dataset.emoji === d.emoji; el.classList.toggle('active', on); el.setAttribute('aria-pressed', String(on)); });
  $$('[data-currency]').forEach(el => { const on = el.dataset.currency === d.currency; el.classList.toggle('active', on); el.setAttribute('aria-pressed', String(on)); });
}
function groupDesigner(edit) {
  if (edit && !S.group) edit = false;
  S.groupDraft = edit ? { id: S.group.id, name: S.group.name, emoji: S.group.emoji || '✨', theme: themeFor(S.group).id, cover: S.group.cover || 'waves', currency: S.group.currency || 'USD', edit: true }
    : { name: '', emoji: '✨', theme: 'violet', cover: 'waves', currency: lang === 'es' && (navigator.language || '').toLowerCase().includes('co') ? 'COP' : 'USD', edit: false };
  const d = S.groupDraft;
  const emojis = [...new Set([...GROUP_EMOJIS, d.emoji])];
  openSheet(edit ? t('design.editTitle') : t('design.newTitle'), `<form id="group-form" novalidate><div id="group-design-preview">${groupPreview()}</div>
    <div class="field"><label for="group-name">${t('design.name')}</label><input id="group-name" name="name" placeholder="${esc(t('design.namePh'))}" maxlength="38" value="${esc(d.name)}" required></div>
    <span class="field-label">${t('design.symbol')}</span><div class="pills emoji-picks">${emojis.map(e => `<button type="button" class="pill ${e === d.emoji ? 'active' : ''}" data-emoji="${e}" aria-pressed="${e === d.emoji}">${e}</button>`).join('')}</div>
    <span class="field-label">${t('design.color')}</span><div class="theme-options">${THEMES.map(x => `<button type="button" class="theme-choice" data-theme="${x.id}" aria-label="${esc(t('theme.' + x.id))}" aria-pressed="${x.id === d.theme}" style="--swatch:${x.accent};--swatch-bg:${x.bg}">${icon('check', 'small-ico')}</button>`).join('')}</div>
    <span class="field-label" style="margin-top:22px">${t('design.cover')}</span><div class="cover-options">${COVERS.map(k => `<button type="button" class="cover-option ${k === d.cover ? 'active' : ''}" data-cover="${k}" aria-pressed="${k === d.cover}"><span class="cover-sample">${cover({ cover: k })}</span><span>${t('cover.' + k)}</span></button>`).join('')}</div>
    ${edit ? '' : `<span class="field-label" style="margin-top:22px">${t('design.currency')}</span><div class="segmented" style="margin:8px 0 0">${['USD', 'COP'].map(c => `<button type="button" data-currency="${c}" class="${c === d.currency ? 'active' : ''}" aria-pressed="${c === d.currency}">${CURRENCIES[c].flag} ${c}</button>`).join('')}</div>`}
    <div id="group-error"></div>
    <button class="full-btn" style="margin-top:24px" type="submit">${edit ? t('design.save') : t('design.create')}</button><p class="notice-inline">${t('design.foot')}</p></form>`);
}
const createGroupSheet = () => groupDesigner(false);
async function submitGroup(form) {
  const d = S.groupDraft, name = $('#group-name').value.trim();
  if (!name) return formError('group-error', t('err.groupName'));
  d.name = name;
  const b = $('button[type="submit"]', form); buttonBusy(b, true);
  try {
    if (d.edit) {
      await updateGroupDesign(d.id, d);
      closeSheet(); toast(t('design.saved'));
    } else {
      const gid = await createGroupDoc(d);
      closeSheet(false); openGroup(gid); go('home'); toast(t('design.created'));
      setTimeout(inviteSheet, 450);
    }
  } catch (e) { console.error(e); buttonBusy(b, false); formError('group-error', t('err.save')); }
}

// ───────────────────────── perfil ─────────────────────────
function profileSheet() {
  const me = S.me || {};
  const row = (action, ic, label, right = icon('chevron', 'small-ico')) => `<button class="menu-row" data-action="${action}">${icon(ic)}<span>${label}</span>${right}</button>`;
  openSheet(t('profile.title'), `<div class="profile-cover"><button class="profile-photo" data-action="pick-avatar" aria-label="${esc(t('profile.photo'))}">${avatar(me, 'big')}<span class="profile-photo-edit">${icon('camera', 'small-ico')}</span></button><div><h3>${esc(me.name || '')}</h3><p>${esc(me.email || '')}</p></div></div>
    <div class="menu-list">${row('edit-name', 'edit', t('profile.name'))}${row('pay-methods', 'card', t('profile.payMethods'))}${S.group ? row('edit-group', 'spark', t('profile.editGroup')) + row('members', 'users', t('profile.members')) + row('invite', 'link', t('profile.invite')) : ''}
    <button class="menu-row" data-action="toggle-lang">${icon('globe')}<span>${t('profile.lang')}</span><span class="menu-value">${lang === 'es' ? 'Español' : 'English'}</span></button>
    <button class="menu-row" data-action="motion" role="switch" aria-checked="${S.motion}">${icon('motion')}<span>${t('profile.motion')}</span><i class="switch ${S.motion ? 'on' : ''}" aria-hidden="true"></i></button>
    ${row('logout', 'logout', t('profile.logout'), '')}</div><p class="notice-inline" style="margin-top:15px">${t('profile.foot')}</p>`);
}
function nameSheet() {
  openSheet(t('profile.name'), `<form id="name-form" novalidate><div class="field"><label for="name-input">${t('auth.name')}</label><input id="name-input" value="${esc((S.me && S.me.name) || '')}" maxlength="40" required></div><div id="name-error"></div><button class="full-btn" type="submit">${t('btn.save')}</button></form>`);
}
const PAY_PLACEHOLDER = { zelle: 'pay.ph.zelle', venmo: 'pay.ph.venmo', paypal: 'pay.ph.paypal', cashapp: 'pay.ph.cashapp', nequi: 'pay.ph.nequi', breb: 'pay.ph.breb' };
function payMethodsSheet() {
  const mine = myPayMethods();
  const val = k => (mine.find(m => m.type === k) || {}).value || '';
  openSheet(t('pay.title'), `<form id="pay-form" novalidate><p class="sheet-intro">${t('pay.intro')}</p>
    ${PAY_ORDER.map(k => `<div class="pay-edit">${payMark(k)}<div class="pay-edit-copy"><label for="pay-${k}">${esc(payName(k))} <em class="${PAY[k].link ? '' : 'copy'}">${PAY[k].link ? t('pay.direct') : t('pay.copies')}</em></label><input id="pay-${k}" data-pay="${k}" value="${esc(val(k))}" placeholder="${esc(t(PAY_PLACEHOLDER[k]))}" autocomplete="off"></div></div>`).join('')}
    <div id="pay-error"></div><button class="full-btn" type="submit" style="margin-top:8px">${t('btn.save')}</button><p class="notice-inline">${t('pay.foot')}</p></form>`);
}
async function submitPayMethods(form) {
  const list = $$('[data-pay]', form).map(i => ({ type: i.dataset.pay, value: i.value.trim() })).filter(m => m.value);
  const b = $('button[type="submit"]', form); buttonBusy(b, true);
  try { await savePayMethods(list); closeSheet(); toast(t('pay.saved')); }
  catch (e) { console.error(e); buttonBusy(b, false); formError('pay-error', t('err.save')); }
}

// ───────────────────────── presupuestos ─────────────────────────
function budgetHtml() {
  const b = S.budgets, [from] = monthRange();
  const spent = b.reduce((s, x) => s + budgetSpent(x), 0), limit = b.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const pct = limit ? Math.round(spent / limit * 100) : 0;
  const head = b.length ? `<p class="chart-label" style="margin-top:22px">${t('budget.monthOf', L().months[from.getMonth()].toLowerCase())}</p><h3 class="num budget-big">${money(spent)} <small>/ ${money(limit)}</small></h3><div class="progress" style="height:10px"><span style="--progress:${Math.min(pct, 100)}%"></span></div><div class="budget-foot"><span>${t('budget.used', pct)}</span><b>${spent > limit ? t('budget.over', money(spent - limit)) : t('budget.available', money(limit - spent))}</b></div>
    <div class="budget-categories">${b.map(x => { const s = budgetSpent(x), l = Number(x.amount) || 0; return `<div class="budget-category"><div><span>${esc((x.emoji ? x.emoji + ' ' : '') + (x.name || ''))}</span><b class="num" style="font-size:14px">${money(s)} / ${money(l)}</b></div><div class="progress"><span style="--progress:${l ? Math.min(100, s / l * 100) : 0}%;${s > l ? 'background:#B95846' : ''}"></span></div><div class="budget-meta"><span>${esc((x.categories || []).map(catName).join(' · '))}</span><button type="button" class="text-btn" data-action="delete-budget" data-id="${x.id}">${t('budget.delete')}</button></div></div>`; }).join('')}</div>`
    : `<p class="sheet-intro" style="margin-top:18px">${t('budget.intro')}</p>`;
  return `${groupContext()}${head}<form id="budget-form" novalidate><div class="field"><label for="budget-text">${t('budget.newLbl')}</label><input id="budget-text" placeholder="${esc(t('budget.ph'))}" autocomplete="off"></div><div id="budget-error"></div><button class="full-btn ${b.length ? 'secondary' : ''}" type="submit">${icon('spark')} ${t('budget.create')}</button></form>${b.length ? `<button class="full-btn" data-action="budget-stats" style="margin-top:10px">${t('budget.stats')}</button>` : ''}`;
}
const budgetSheet = () => S.group && openSheet(t('budget.title'), budgetHtml(), { name: 'budget' });
async function submitBudget(form) {
  const text = $('#budget-text').value.trim(); if (!text) return;
  const b = $('button[type="submit"]', form); buttonBusy(b, true, t('budget.creating'));
  try { const d = await aiCreateBudget(text); buttonBusy(b, false); if (!d) return formError('budget-error', t('budget.fail')); $('#budget-text').value = ''; toast(t('budget.created', d.name)); }
  catch (e) { console.error(e); buttonBusy(b, false); formError('budget-error', t('budget.fail')); }
}

// ───────────────────────── estadísticas: detalle por categoría ─────────────────────────
function categoryDetail(key) {
  const cats = categoryTotals(), c = cats.find(x => x.key === key); if (!c) return;
  const keys = key === 'rest' ? c.keys : [key];
  const items = periodExpenses().filter(e => keys.includes(CATS[e.category] ? e.category : 'other')).sort((a, b) => expDate(b) - expDate(a));
  openSheet(esc(c.name), `<div class="category-sheet-hero" style="--category-soft:${c.soft};--category-accent:${c.color}">${categoryIcon(key === 'rest' ? 'other' : key)}<span class="num">${money(c.total)}</span><p>${t('act.count', items.length)} · ${getPeriod().name}</p></div>${groupContext()}<div class="expense-list category-expenses">${items.map(expenseRow).join('')}</div>${key === 'rest' ? '' : `<button class="full-btn secondary" data-action="category-activity" data-category-key="${key}" style="margin-top:20px">${t('st.seeInActivity')}</button>`}`);
}

// ───────────────────────── periodo de la actividad ─────────────────────────
function periodSheet() {
  const a = S.act;
  const opt = (k, label) => `<button type="button" class="pill ${a.period === k ? 'active' : ''}" data-act-period="${k}" aria-pressed="${a.period === k}">${label}</button>`;
  openSheet(t('period.title'), `<p class="sheet-intro">${t('period.intro')}</p><div class="pills" style="flex-wrap:wrap">${opt('all', t('period.all'))}${opt('month', t('period.month'))}${opt('last', t('period.last'))}</div>
    <form id="period-form" novalidate style="margin-top:14px"><span class="field-label">${t('period.custom')}</span><div class="form-row" style="margin-top:8px"><div class="field"><label for="period-from">${t('period.from')}</label><input id="period-from" type="date" value="${a.from || ''}"></div><div class="field"><label for="period-to">${t('period.to')}</label><input id="period-to" type="date" value="${a.to || ''}"></div></div><button class="full-btn" type="submit">${t('period.apply')}</button></form>`);
}

// ───────────────────────── contraseña olvidada ─────────────────────────
function forgotSheet() {
  openSheet(t('forgot.title'), `<form id="forgot-form" novalidate><p class="sheet-intro">${t('forgot.intro')}</p><div class="field"><label for="forgot-email">${t('auth.email')}</label><input id="forgot-email" type="email" value="${esc(($('#auth-email') || {}).value || '')}" autocomplete="email"></div><div id="forgot-error"></div><button class="full-btn" type="submit">${t('forgot.send')}</button></form>`);
}
