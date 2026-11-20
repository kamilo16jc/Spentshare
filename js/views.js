// SpentShare — pantallas (diseño final de spentshare-ui.html con datos reales).
'use strict';

// ───────────────────────── barra superior y navegación ─────────────────────────
function header() {
  const right = S.page === 'auth'
    ? `<button class="auth-mode" data-action="toggle-lang" aria-label="${esc(t('aria.lang'))}">${lang.toUpperCase()}</button>`
    : `<button class="profile-button" data-action="profile" aria-label="${esc(t('aria.profile'))}">${avatar(S.me || { name: '?' })}</button>`;
  $('#topbar').innerHTML = `<button class="brand" data-action="home" aria-label="SpentShare"><span class="brand-mark">${icon('logo')}</span><div>Spent<span>Share</span></div></button><div class="top-actions">${right}</div>`;
}

const TABS = [['home', 'home'], ['activity', 'activity'], ['stats', 'chart'], ['groups', 'users']];
function nav() {
  const navEl = $('#bottom-nav');
  if (!$('.nav-capsule', navEl) || navEl.dataset.lang !== lang) {
    navEl.dataset.lang = lang;
    navEl.innerHTML = '<span class="nav-capsule" aria-hidden="true"></span>' + TABS.map(([id, ic]) => `<button class="nav-item" data-page="${id}"><span class="nav-icon">${icon(ic)}</span><span>${t('nav.' + id)}</span></button>`).join('');
  }
  TABS.forEach(([id], i) => {
    const item = $(`[data-page="${id}"]`, navEl);
    item.classList.toggle('active', id === S.page);
    if (id === S.page) { item.setAttribute('aria-current', 'page'); navEl.style.setProperty('--nav-index', i); }
    else item.removeAttribute('aria-current');
  });
  $('#bottom-wrap').hidden = S.page === 'auth' || S.page === 'boot';
  $('#fab').hidden = !['activity', 'stats'].includes(S.page) || !S.group || !(S.expenses || []).length;
  $('#fab').innerHTML = icon('plus');
  $('#fab').setAttribute('aria-label', t('btn.addExpense'));
}

// ───────────────────────── piezas ─────────────────────────
const methodName = m => PAY[m] ? payName(m) : t('method.' + (['transfer', 'cash', 'other'].includes(m) ? m : 'other'));

function expenseRow(e) {
  const d = expDate(e);
  const today = sameDay(d, new Date());
  if (e.type === 'settle') {
    const from = firstName(nameOf(e.paidByUid, e.paidBy)), to = firstName(nameOf(e.settledToUid, e.settledTo));
    return `<button class="expense" data-expense="${e.id}" aria-label="${esc(t('row.settle', from, to))}, ${money(e.amount)}">${expenseIcon(e)}<span class="expense-copy"><span class="expense-title">${esc(t('row.settle', from, to))}</span><span class="expense-meta">${esc(methodName(e.method))} · ${fmtDay(d)}${today ? ' · ' + t('today') : ''}</span></span><span class="expense-value"><span class="num">${money(e.amount)}</span><small>${t('row.payment')}</small></span></button>`;
  }
  const sh = shares(e), n = Object.keys(sh).length;
  const small = n <= 1 ? (e.paidByUid in sh ? t('row.solo') : t('row.refund')) : t('row.perPerson', money(e.amount / n));
  const who = firstName(nameOf(e.paidByUid, e.paidBy));
  return `<button class="expense" data-expense="${e.id}" aria-label="${esc(e.description)}, ${money(e.amount)}">${expenseIcon(e)}<span class="expense-copy"><span class="expense-title">${esc(e.description)}</span><span class="expense-meta">${esc(who)} · ${fmtDay(d)}${today ? ' · ' + t('today') : ''}${e.recurringId ? ' · ' + t('row.fixed') : ''}</span></span><span class="expense-value"><span class="num">${money(e.amount)}</span><small>${small}</small></span></button>`;
}

function emptyIllustration(kind = 'plan') {
  return `<div class="empty-illustration" aria-hidden="true"><span class="empty-floor"></span><span class="empty-card-back"></span><span class="empty-card-front">${icon(kind === 'search' ? 'search' : kind === 'stats' ? 'chart' : kind === 'groups' ? 'users' : 'wallet')}</span><span class="empty-mini">${icon(kind === 'search' ? 'spark' : 'plus')}</span></div>`;
}
function emptyPlan(kind = 'plan') {
  const [h, p] = kind === 'stats' ? [t('empty.statsH'), t('empty.statsP')] : [t('empty.planH'), t('empty.planP')];
  return `<div class="designed-empty">${emptyIllustration(kind)}<h2>${h}</h2><p>${p}</p><button class="full-btn" data-action="add-expense">${icon('plus')} ${t('btn.addExpense')}</button></div>`;
}
const loadingCard = () => `<div class="designed-empty"><p class="muted">${t('loading')}</p></div>`;

// Sin grupo abierto: crear el primero o unirse
function noGroup() {
  return `<div class="page"><div class="page-top"><p class="hello">${esc(t('hello', firstName(S.me && S.me.name)))} <span aria-hidden="true">✳</span></p><div class="heading-row"><h1>${t('home.title')}</h1></div></div>
    <div class="designed-empty">${emptyIllustration('groups')}<h2>${t('empty.groupsH')}</h2><p>${t('empty.groupsP')}</p>
    <button class="full-btn" data-action="create-group">${icon('plus')} ${t('btn.newGroup')}</button>
    <button class="full-btn secondary" data-action="join-group" style="margin-top:10px">${icon('link')} ${t('btn.haveCode')}</button></div></div>`;
}

// ───────────────────────── inicio ─────────────────────────
function home() {
  if (!S.group) return noGroup();
  const g = S.group, list = S.expenses, me = uid();
  const top = `<div class="page-top"><p class="hello">${esc(t('hello', firstName(S.me && S.me.name)))} <span aria-hidden="true">✳</span></p><div class="heading-row"><h1>${t('home.title')}</h1><div class="heading-actions"><button class="icon-btn" data-action="edit-group" aria-label="${esc(t('aria.editGroup'))}">${icon('spark')}</button><button class="icon-btn" data-action="members" aria-label="${esc(t('aria.members'))}">${icon('users')}</button></div></div><button class="group-switch" data-action="switch-group"><span class="group-symbol">${esc(g.emoji || '✨')}</span><span class="name">${esc(g.name)}</span>${stack(S.members)}${icon('down', 'small-ico')}</button></div>`;
  if (list === null) return `<div class="page">${top}${loadingCard()}</div>`;

  const debts = myDebts(list);
  const net = netOf(me, list);
  const owedToMe = debts.filter(d => d.amount < 0).reduce((s, d) => s - d.amount, 0);
  const [from, to] = monthRange();
  const monthTotal = total(spending(list, from, to));
  const creditors = debts.filter(d => d.amount > 0);
  const desc = net < -0.005
    ? (creditors.length === 1 ? t('home.oweTo', esc(firstName(nameOf(creditors[0].uid)))) : t('home.oweMany', creditors.length))
    : net > 0.005 ? t('home.toReceive') : list.length ? t('home.allClear') : t('home.blank');

  const card = `<section class="balance-card" aria-label="${esc(t('home.yourBalance'))}">${cover(g)}<div class="balance-top"><span>${t('home.yourBalance')}</span><span class="mini-pill">${icon('calendar', 'small-ico')} ${L().months[new Date().getMonth()]}</span></div><h2 class="num balance-amount">${signedMoney(net)}</h2><p class="balance-description">${desc}</p><div class="balance-sub"><div><p>${t('home.owedToYou')}</p><span class="num">${money(owedToMe)}</span></div><div><p>${t('home.groupSpend')}</p><span class="num">${money(monthTotal)}</span></div></div>${list.length ? `<button class="lime-btn" data-action="add-expense">${icon('plus')} ${t('btn.addExpense')}</button>` : ''}</section>`;

  const rows = debts.map(d => {
    const oweThem = d.amount > 0, amt = money(Math.abs(d.amount));
    const req = oweThem ? pendingRequest(d.uid, me) : pendingRequest(me, d.uid);
    const reqTxt = req ? ' · ' + (req.dueAt ? t('home.reqDue', fmtDay(toDate(req.dueAt))) : t('home.reqSent')) : '';
    const btn = oweThem
      ? `<button class="outline-btn" data-action="settle" data-uid="${d.uid}">${t('btn.settle')}</button>`
      : `<button class="outline-btn" data-action="request" data-uid="${d.uid}">${req ? t('btn.viewRequest') : t('btn.request')}</button>`;
    return `<div class="settle-preview">${avatar(d.uid)}<div class="settle-copy"><strong>${t('home.with', esc(firstName(nameOf(d.uid))))}</strong><span>${oweThem ? t('home.youOwe', amt) : t('home.owesYou', amt)}${reqTxt}</span></div>${btn}</div>`;
  }).join('') || (list.length ? `<div class="settle-preview"><span class="category-icon transport">${icon('check')}</span><div class="settle-copy"><strong>${t('home.square')}</strong><span>${t('home.squareSub')}</span></div></div>` : '');

  if (!list.length) return `<div class="page">${top}${card}${emptyPlan()}</div>`;

  const recent = [...list].sort((a, b) => expDate(b) - expDate(a)).slice(0, 3);
  return `<div class="page">${top}${card}${rows}
    <section class="section"><div class="section-head"><h2>${t('home.recent')}</h2><button class="text-btn" data-page="activity">${t('btn.seeAll')}</button></div><div class="expense-list">${recent.map(expenseRow).join('')}</div></section>
    ${autoSection()}
    <section class="section"><div class="section-head"><h2>${t('home.month')}</h2><button class="text-btn" data-page="stats">${t('btn.seeDetail')}</button></div>${budgetMini()}</section></div>`;
}

// Automático: mi cobro periódico + los gastos fijos del grupo
function autoSection() {
  const mine = S.autoCharges[uid()], on = !!(mine && mine.enabled);
  const next = on ? firstRunDate(mine) : null;
  const charge = `<button class="auto-row" data-action="auto-charge"><span class="auto-icon ${on ? 'on' : ''}">${icon('clock')}</span><span class="auto-copy"><strong>${t('auto.chargeTitle')}</strong><span>${on ? esc(scheduleLabel(mine)) + (next ? ' · ' + t('auto.nextShort', fmtDay(next)) : '') : t('auto.rowOff')}</span></span><span class="auto-state ${on ? 'on' : ''}">${on ? t('auto.on') : t('auto.off')}</span></button>`;
  const recs = S.recurring.map(r => {
    const active = r.active !== false, nx = toDate(r.nextRunAt);
    return `<button class="auto-row" data-action="recurring" data-id="${r.id}">${expenseIcon({ category: r.category, description: r.description })}<span class="auto-copy"><strong>${esc(r.description)}</strong><span><b class="num">${money(r.amount)}</b> · ${esc(scheduleLabel(r))}${active && nx ? ' · ' + t('auto.nextShort', fmtDay(nx)) : ''}</span></span>${active ? icon('chevron', 'small-ico') : `<span class="auto-state">${t('auto.paused')}</span>`}</button>`;
  }).join('');
  return `<section class="section"><div class="section-head"><h2>${t('auto.section')}</h2><button class="text-btn" data-action="recurring-new">${icon('plus', 'small-ico')} ${t('rec.add')}</button></div><div class="auto-list">${charge}${recs}</div></section>`;
}

function budgetMini() {
  const b = S.budgets;
  if (!b.length) {
    return `<button class="budget-mini" data-action="budget"><div class="budget-top"><span>${t('budget.emptyTitle')}</span><span>${t('budget.new')}</span></div><div class="progress"><span style="--progress:0%"></span></div><div class="budget-foot"><span>${t('budget.emptyHint')}</span></div></button>`;
  }
  const spent = b.reduce((s, x) => s + budgetSpent(x), 0), limit = b.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const pct = limit ? Math.round(spent / limit * 100) : 0;
  return `<button class="budget-mini" data-action="budget"><div class="budget-top"><span>${esc(b.length === 1 ? (b[0].name || t('budget.group')) : t('budget.group'))}</span><span>${t('budget.used', pct)}</span></div><div class="progress"><span style="--progress:${Math.min(pct, 100)}%"></span></div><div class="budget-foot"><span><b>${money(spent)}</b> ${t('budget.of', money(limit))}</span><span>${spent > limit ? t('budget.over', money(spent - limit)) : t('budget.left', money(limit - spent))}</span></div></button>`;
}

// ───────────────────────── actividad ─────────────────────────
function periodRange() {
  const a = S.act, now = new Date();
  if (a.period === 'month') return monthRange(now);
  if (a.period === 'last') return monthRange(now, -1);
  if (a.period === 'custom' && a.from) {
    const f = new Date(a.from + 'T00:00:00'), to = new Date((a.to || a.from) + 'T00:00:00'); to.setDate(to.getDate() + 1);
    return [f, to];
  }
  return null;
}
function periodLabel() {
  const a = S.act;
  if (a.period === 'month') return t('period.month');
  if (a.period === 'last') return t('period.last');
  if (a.period === 'custom' && a.from) {
    const f = new Date(a.from + 'T00:00:00'), to = new Date((a.to || a.from) + 'T00:00:00');
    return a.from === a.to || !a.to ? fmtDay(f) : `${fmtDay(f)} – ${fmtDay(to)}`;
  }
  return '';
}
const fold = s => String(s || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function filteredExpenses() {
  const a = S.act, q = fold(a.query), range = periodRange();
  return (S.expenses || []).filter(e => {
    if (a.cat === 'settle' ? e.type !== 'settle' : a.cat !== 'all' && (e.type === 'settle' || (CATS[e.category] ? e.category : 'other') !== a.cat)) return false;
    if (a.person !== 'all' && e.paidByUid !== a.person) return false;
    if (q && !fold(e.type === 'settle' ? t('row.settle', nameOf(e.paidByUid, e.paidBy), nameOf(e.settledToUid, e.settledTo)) : e.description).includes(q)) return false;
    if (range) { const d = expDate(e); if (d < range[0] || d >= range[1]) return false; }
    return true;
  }).sort((x, y) => expDate(y) - expDate(x));
}
function activityResults() {
  if (S.expenses === null) return loadingCard();
  if (!S.expenses.length) return emptyPlan();
  const items = filteredExpenses();
  if (!items.length) return `<div class="designed-empty filter-empty">${emptyIllustration('search')}<h2>${t('act.noneH')}</h2><p>${t('act.noneP')}</p><button class="full-btn secondary" data-action="clear-filters">${t('btn.clearFilters')}</button></div>`;
  const spend = total(items.filter(e => e.type !== 'settle'));
  const days = [...new Set(items.map(e => ymd(expDate(e))))];
  const pl = periodLabel();
  return `<div class="summary-strip"><span>${t('act.count', items.length)}${pl ? ' · ' + esc(pl) : ''}</span><span class="num">${money(spend)}</span></div>${days.map(d => {
    const day = items.filter(e => ymd(expDate(e)) === d);
    return `<p class="date-group">${dayLabel(expDate(day[0]))}</p><div class="expense-list">${day.map(expenseRow).join('')}</div>`;
  }).join('')}`;
}
function activity() {
  if (!S.group) return noGroup();
  const a = S.act, list = S.expenses || [];
  const cats = CAT_ORDER.filter(k => list.some(e => e.type !== 'settle' && (CATS[e.category] ? e.category : 'other') === k));
  const pills = [['all', t('act.all')], ...cats.map(k => [k, catName(k)]), ...(list.some(e => e.type === 'settle') ? [['settle', t('act.payments')]] : [])];
  return `<div class="page"><div class="page-top"><p class="hello">${t('act.hello')}</p><div class="heading-row"><h1>${t('nav.activity')}</h1><div class="heading-actions"><button class="icon-btn" data-action="period" aria-label="${esc(t('aria.period'))}">${icon('calendar')}</button><button class="icon-btn" data-action="activity-info" aria-label="${esc(t('aria.info'))}">${icon('info')}</button></div></div>${groupContext()}<label class="searchbox">${icon('search', 'small-ico')}<input id="search-expenses" placeholder="${esc(t('act.search'))}" aria-label="${esc(t('act.search'))}" value="${esc(a.query)}"></label></div>
    <div class="pills" aria-label="${esc(t('aria.byCat'))}">${pills.map(([k, v]) => `<button class="pill ${a.cat === k ? 'active' : ''}" data-filter="${k}" aria-pressed="${a.cat === k}">${esc(v)}</button>`).join('')}</div>
    <div class="activity-people" aria-label="${esc(t('aria.byPerson'))}">${[{ uid: 'all' }, ...S.members].map(m => `<button data-person="${m.uid}" class="${a.person === m.uid ? 'active' : ''}" aria-pressed="${a.person === m.uid}">${m.uid === 'all' ? t('act.all') : esc(m.uid === uid() ? t('youCap') : firstName(m.name))}</button>`).join('')}</div>
    <div id="activity-results">${activityResults()}</div></div>`;
}

// ───────────────────────── estadísticas ─────────────────────────
function getPeriod() {
  const p = S.st.period, now = new Date(), Lc = L();
  const list = S.expenses || [];
  let buckets = [], range, prevRange, name, caption, avgDiv, avgKey = 'st.avgDay';
  if (p === 'week') {
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    for (let i = 0; i < 7; i++) {
      const f = new Date(mon); f.setDate(mon.getDate() + i); const to = new Date(f); to.setDate(f.getDate() + 1);
      buckets.push({ from: f, to, label: Lc.daysShort[i], date: `${Lc.daysMed[i]} ${fmtDay(f)}` });
    }
    range = [buckets[0].from, buckets[6].to];
    const pf = new Date(mon); pf.setDate(mon.getDate() - 7); prevRange = [pf, mon];
    name = t('st.thisWeek'); caption = `${fmtDay(buckets[0].from)} – ${fmtDay(buckets[6].from)}`;
    avgDiv = 7;
  } else if (p === 'month') {
    for (let i = -6; i <= 0; i++) {
      const [f, to] = monthRange(now, i);
      buckets.push({ from: f, to, label: Lc.monthsShort[f.getMonth()], date: `${Lc.months[f.getMonth()]} ${f.getFullYear()}` });
    }
    range = [buckets[6].from, buckets[6].to]; prevRange = [buckets[5].from, buckets[5].to];
    name = t('st.thisMonth'); caption = `${Lc.months[buckets[0].from.getMonth()]} – ${Lc.months[now.getMonth()].toLowerCase()} ${now.getFullYear()}`;
    avgDiv = now.getDate();
  } else {
    const y = now.getFullYear();
    for (let k = 0; k < 6; k++) {
      const f = new Date(y, k * 2, 1), to = new Date(y, k * 2 + 2, 1);
      buckets.push({ from: f, to, label: Lc.monthsShort[k * 2], date: `${Lc.monthsShort[k * 2]} – ${Lc.monthsShort[k * 2 + 1].toLowerCase()} ${y}` });
    }
    range = [new Date(y, 0, 1), new Date(y + 1, 0, 1)]; prevRange = [new Date(y - 1, 0, 1), new Date(y, 0, 1)];
    name = t('st.thisYear'); caption = `${Lc.months[0]} – ${Lc.months[now.getMonth()].toLowerCase()} ${y}`;
    avgDiv = now.getMonth() + 1; avgKey = 'st.avgMonth';
  }
  const values = buckets.map(b => round2(total(spending(list, b.from, b.to))));
  const tot = round2(total(spending(list, range[0], range[1])));
  const prev = round2(total(spending(list, prevRange[0], prevRange[1])));
  const change = prev > 0 ? Math.round((tot - prev) / prev * 1000) / 10 : null;
  return { buckets, values, total: tot, prev, change, name, caption, range, avg: money(tot / Math.max(avgDiv, 1)), avgKey };
}
function periodExpenses() { const p = getPeriod(); return spending(S.expenses, p.range[0], p.range[1]); }
function categoryTotals() {
  const items = periodExpenses(), sum = total(items);
  const by = {};
  items.forEach(e => { const k = CATS[e.category] ? e.category : 'other'; by[k] = (by[k] || 0) + (Number(e.amount) || 0); });
  let list = Object.entries(by).map(([key, v]) => ({ key, total: v })).sort((a, b) => b.total - a.total);
  if (list.length > 7) { const rest = list.slice(6); list = list.slice(0, 6).concat([{ key: 'rest', keys: rest.map(r => r.key), total: rest.reduce((s, r) => s + r.total, 0) }]); }
  list.forEach((c, i) => { c.color = CHART_COLORS[i % CHART_COLORS.length]; c.soft = CHART_SOFT[i % CHART_SOFT.length]; c.name = c.key === 'rest' ? t('st.rest') : catName(c.key); c.percent = sum ? c.total / sum * 100 : 0; c.displayPercent = Math.floor(c.percent); });
  const remainder = 100 - list.reduce((s, c) => s + c.displayPercent, 0);
  if (sum) [...list].sort((a, b) => (b.percent - b.displayPercent) - (a.percent - a.displayPercent)).slice(0, remainder).forEach(c => c.displayPercent++);
  return list;
}
function barsMarkup(p = getPeriod()) {
  const max = Math.max(...p.values, 1) * 1.12, sel = S.st.bar ?? p.values.length - 1;
  return p.values.map((v, i) => `<button class="bar-column ${i === sel ? 'selected' : ''}" data-bar="${i}" aria-label="${esc(p.buckets[i].date)}: ${money(v)}" aria-pressed="${i === sel}"><span class="bar-area"><span class="bar" style="--h:${v / max * 100}%;--delay:${i * 32}ms"></span></span><span>${esc(p.buckets[i].label)}</span></button>`).join('') + '<span class="chart-probe" id="chart-probe" hidden aria-live="polite"></span>';
}
function donutSegments(cats) {
  let offset = 0; const circ = 2 * Math.PI * 44;
  return cats.map(c => {
    const gap = cats.length > 1 ? 3.7 : 0, len = Math.max(0, c.percent / 100 * circ - gap);
    const m = `<circle cx="60" cy="60" r="44" stroke="${c.color}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" data-donut="${c.key}"/>`;
    offset += c.percent / 100 * circ; return m;
  }).join('');
}
function stats() {
  if (!S.group) return noGroup();
  const heading = `<div class="page-top"><p class="hello">${t('st.hello')}</p><div class="heading-row"><h1>${t('nav.stats')}</h1><button class="icon-btn" data-action="period-info" aria-label="${esc(t('aria.period'))}">${icon('calendar')}</button></div>${groupContext()}</div>`;
  if (S.expenses === null) return `<div class="page">${heading}${loadingCard()}</div>`;
  if (!S.expenses.filter(e => e.type !== 'settle').length) return `<div class="page">${heading}${emptyPlan('stats')}</div>`;
  const p = getPeriod(), cats = categoryTotals(), items = periodExpenses();
  const cmp = p.change === null ? t('st.firstPeriod') : t(p.change <= 0 ? 'st.less' : 'st.more', Math.abs(p.change).toString().replace('.', lang === 'es' ? ',' : '.') + '%');
  const payers = S.members.map(m => ({ m, total: total(items.filter(e => e.paidByUid === m.uid)) })).sort((a, b) => b.total - a.total);
  const topCat = cats[0];
  const insightTitle = p.change !== null && p.change <= 0 ? t('st.insightLessH') : t('st.insightH');
  const insightText = (p.change !== null ? t(p.change <= 0 ? 'st.insightLess' : 'st.insightMore', Math.abs(p.change).toString().replace('.', lang === 'es' ? ',' : '.') + '%') + ' ' : '') + (topCat ? t('st.insightTop', topCat.name) : '');
  return `<div class="page">${heading}
    <div class="segmented" aria-label="${esc(t('aria.period'))}">${[['week', t('st.week')], ['month', t('st.month')], ['year', t('st.year')]].map(([k, v]) => `<button data-period="${k}" class="${S.st.period === k ? 'active' : ''}" aria-pressed="${S.st.period === k}">${v}</button>`).join('')}</div>
    <section class="chart-card"><p class="chart-label">${t('st.shared', p.name)}</p><h2 class="num chart-number">${money(p.total)}</h2><p class="chart-comparison">${icon('trend', 'small-ico')} ${cmp}</p><div class="bars" id="bars" role="group" tabindex="0" aria-label="${esc(t('aria.bars'))}">${barsMarkup(p)}</div><div class="chart-bottom"><span id="chart-focus-label">${esc(p.caption)}</span><span>${t(p.avgKey)} <b>${p.avg}</b></span></div><p class="chart-gesture-hint">${t('st.gesture')}</p></section>
    <section class="section chart-card"><div class="section-head" style="margin-bottom:0"><h2>${t('st.whereH')}</h2><span class="chart-label">${t('st.byCat')}</span></div>${cats.length ? `<div class="donut-layout"><div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="${esc(t('st.byCat'))}"><circle cx="60" cy="60" r="44" stroke="#F0EDF6"/>${donutSegments(cats)}</svg><div class="donut-text"><span class="num">${cats.length}</span><small>${t('st.cats', cats.length)}</small></div></div><div class="legend">${cats.map(c => `<button class="legend-item" data-category="${c.key}" aria-label="${esc(c.name)}, ${c.displayPercent}%"><span class="legend-dot" style="--c:${c.color}"></span><span>${esc(c.name)}</span><b>${c.displayPercent}%</b></button>`).join('')}</div></div><p class="notice-inline">${t('st.tapCat')}</p>` : `<p class="notice-inline">${t('st.noSpend', p.name)}</p>`}</section>
    <div class="insight">${icon('spark')}<div><strong>${insightTitle}</strong><p>${esc(insightText || t('st.insightNone'))}</p></div></div>
    <section class="section"><div class="section-head"><h2>${t('st.together')}</h2><button class="text-btn" data-action="members">${t('btn.seeMembers')}</button></div><div class="chart-card" style="padding:0 16px">${payers.map(r => `<div class="member-row">${avatar(r.m)}<div class="copy"><strong>${esc(firstName(r.m.name))}${r.m.uid === uid() ? ' · ' + t('you') : ''}</strong><small>${t('st.paidIn', p.name)}</small></div><span class="num">${money(r.total)}</span></div>`).join('')}</div></section></div>`;
}
function selectBar(index) {
  const p = getPeriod();
  index = Math.max(0, Math.min(p.values.length - 1, index)); S.st.bar = index;
  $$('[data-bar]').forEach(el => { const on = Number(el.dataset.bar) === index; el.classList.toggle('selected', on); el.setAttribute('aria-pressed', String(on)); });
  const probe = $('#chart-probe'); if (!probe) return;
  probe.hidden = false;
  probe.style.left = Math.max(19, Math.min(81, (index + .5) / p.values.length * 100)) + '%';
  probe.innerHTML = `<strong>${money(p.values[index])}</strong><small>${esc(p.buckets[index].date)}</small>`;
  $('#chart-focus-label').textContent = p.buckets[index].date;
}
function bindChart() {
  const chart = $('#bars'); if (!chart) return;
  let dragging = false, pid = null;
  const at = x => { const r = chart.getBoundingClientRect(); selectBar(Math.floor((x - r.left) / r.width * getPeriod().values.length)); };
  chart.addEventListener('pointerdown', e => { dragging = true; pid = e.pointerId; at(e.clientX); chart.setPointerCapture && chart.setPointerCapture(e.pointerId); });
  chart.addEventListener('pointermove', e => { if (dragging && e.pointerId === pid) at(e.clientX); });
  const release = () => { dragging = false; pid = null; };
  chart.addEventListener('pointerup', release); chart.addEventListener('pointercancel', release);
  chart.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); selectBar((S.st.bar ?? getPeriod().values.length - 1) + (e.key === 'ArrowRight' ? 1 : -1));
  });
}

// ───────────────────────── grupos ─────────────────────────
function tilePeople(g) {
  const people = (g.id === S.gid ? S.members : (g.memberEmails || []).map(em => ({ name: em })));
  const n = (g.memberUids || []).length || people.length || 1;
  return `<span class="tile-people"><span class="stack" aria-hidden="true">${people.slice(0, 2).map(p => avatar(p)).join('')}</span><span>${t('members', n)}</span></span>`;
}
function groupTile(g, i) {
  const th = themeFor(g), current = g.id === S.gid, b = S.groupNets[g.id];
  const known = typeof b === 'number';
  const kind = !known ? 'clear' : b < -0.005 ? 'negative' : b > 0.005 ? 'positive' : 'clear';
  const label = !known ? '…' : kind === 'negative' ? t('tile.owe') : kind === 'positive' ? t('tile.owed') : t('tile.none');
  const value = !known ? '' : kind === 'clear' ? t('tile.even') : money(Math.abs(b), g.currency || 'USD');
  return `<button type="button" class="group-tile ${current ? 'is-current' : ''}" data-group="${g.id}" ${current ? 'aria-current="true"' : ''} aria-label="${esc(g.name)}" style="--tile-bg:${th.bg};--tile-ink:${th.ink};--tile-index:${i}">${cover(g)}<span class="group-tile-top"><span class="tile-symbol" aria-hidden="true">${esc(g.emoji || '✨')}</span>${current ? `<span class="tile-current" aria-hidden="true">${t('tile.current')}</span>` : ''}</span><span class="group-tile-name">${esc(g.name)}</span>${tilePeople(g)}<span class="tile-balance is-${kind}"><span class="tile-balance-label">${kind === 'clear' && known ? icon('check', 'small-ico') : ''}${label}</span><span class="num">${value}</span></span></button>`;
}
function groupsPage() {
  const nets = S.groups.map(g => S.groupNets[g.id]).filter(v => typeof v === 'number');
  // El total solo suma grupos en la misma moneda que el actual (no se mezclan dólares y pesos)
  const sameCur = S.groups.filter(g => (g.currency || 'USD') === cur() && typeof S.groupNets[g.id] === 'number');
  const totalNet = sameCur.reduce((s, g) => s + S.groupNets[g.id], 0);
  return `<div class="page groups-page"><div class="page-top"><p class="hello">${t('groups.hello')}</p><div class="heading-row"><h1>${t('groups.title')}</h1><div class="heading-actions">${S.group ? `<button class="icon-btn" data-action="edit-group" aria-label="${esc(t('aria.editGroup'))}">${icon('spark')}</button>` : ''}<button class="icon-btn" data-action="create-group" aria-label="${esc(t('btn.newGroup'))}">${icon('plus')}</button></div></div></div>
    ${S.groups.length ? `<section class="groups-overview"><span class="groups-overview-icon" aria-hidden="true">${icon('wallet')}</span><span class="groups-overview-copy"><strong>${t('groups.total')}</strong><small>${t('groups.between', S.groups.length)}${S.groups.some(g => (g.currency || 'USD') !== cur()) ? ' · ' + cur() : ''}</small></span><span class="num">${nets.length ? signedMoney(totalNet) : '…'}</span></section>
    <div class="mosaic-heading"><h2>${t('groups.all')}</h2><p>${t('groups.spaces', S.groups.length)}</p></div>
    <div class="group-mosaic" role="group">${S.groups.map(groupTile).join('')}</div>` : `<div class="designed-empty">${emptyIllustration('groups')}<h2>${t('empty.groupsH')}</h2><p>${t('empty.groupsP')}</p></div>`}
    <div class="mosaic-actions"><button type="button" class="mosaic-action" data-action="create-group"><span class="mosaic-action-icon">${icon('plus')}</span><strong>${t('btn.newGroup')}</strong><small>${t('groups.newSub')}</small></button><button type="button" class="mosaic-action join" data-action="join-group"><span class="mosaic-action-icon">${icon('link')}</span><strong>${t('groups.invited')}</strong><small>${t('groups.invitedSub')}</small></button></div>
    <p class="groups-endnote">${t('groups.endnote')}</p></div>`;
}

// ───────────────────────── entrada (con invitación pendiente) ─────────────────────────
function inviteBanner(j) {
  const th = THEMES.find(x => x.id === j.t) || THEMES[0];
  const n = Number(j.n) || 1;
  return `<div class="invite-banner" style="--tile-bg:${th.bg};--tile-ink:${th.ink}"><span class="tile-symbol">${esc(j.e || '✨')}</span><div class="invite-copy"><small>${esc(j.f ? t('join.invitedBy', j.f) : t('join.invited'))}</small><strong>${esc(j.g || t('join.aGroup'))}</strong><span class="invite-meta">${t('members', n)}</span></div></div>`;
}
function auth() {
  const signup = S.authMode === 'signup', j = pendingJoin();
  // Logo 3D = una sola imagen (brand/logo-3d-*.webp). Antes eran ~30 capas en CSS 3D con los anillos
  // atravesando el cuadro: al flotar, el navegador reordenaba las capas en cada cuadro y parpadeaba.
  const scene = `<div class="auth-scene" id="auth-scene" aria-hidden="true"><div class="auth-ground-shadow"></div><div class="auth-logo"><div class="auth-logo-tilt"><picture><source type="image/webp" srcset="brand/logo-3d-392.webp 2x, brand/logo-3d-588.webp 3x"><img class="auth-logo-img" src="brand/logo-3d-392.png" alt="" width="196" height="148" decoding="async"></picture></div></div></div>`;
  const title = j ? (signup ? t('auth.joinSignupH') : t('auth.joinLoginH')) : (signup ? t('auth.signupH') : t('auth.loginH'));
  const sub = j ? t('auth.joinP') : (signup ? t('auth.signupP') : t('auth.loginP'));
  return `<div class="auth-page page ${j ? 'has-invite' : ''}">${j ? inviteBanner(j) : scene}<div class="auth-title"><h1>${title}</h1><p>${sub}</p></div>
    <form id="auth-form" novalidate><button type="button" class="full-btn white" data-action="google"><span class="google">G</span> ${t('auth.google')}</button><div class="auth-divider">${t('auth.or')}</div>
    ${signup ? `<div class="field"><label for="auth-name">${t('auth.name')}</label><input id="auth-name" name="name" placeholder="${esc(t('auth.namePh'))}" autocomplete="name" required></div>` : ''}
    <div class="field"><label for="auth-email">${t('auth.email')}</label><input id="auth-email" name="email" type="email" placeholder="${esc(t('auth.emailPh'))}" autocomplete="email" required></div>
    <div class="field"><label for="auth-password">${t('auth.password')}</label><div class="password-field"><input id="auth-password" name="password" type="password" placeholder="${esc(t('auth.passwordPh'))}" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" required><button type="button" data-action="toggle-password" aria-label="${esc(t('aria.showPass'))}">${icon('eye', 'small-ico')}</button></div></div>
    <div id="auth-error"></div>
    <div class="submit-holder"><button class="full-btn" type="submit">${signup ? (j ? t('auth.createJoin') : t('auth.create')) : (j ? t('auth.enterJoin') : t('auth.enter'))}</button></div>
    <p class="auth-foot">${signup ? t('auth.haveAccount') : t('auth.firstTime')} <button type="button" data-action="auth-toggle">${signup ? t('auth.toLogin') : t('auth.toSignup')}</button></p>
    ${signup ? '' : `<button type="button" class="text-btn auth-demo-link" data-action="forgot">${t('auth.forgot')}</button>`}</form></div>`;
}
let authSceneObserver = null;
function mountAuthScene() {
  const scene = $('#auth-scene'); if (!scene) return;
  // Con el mouse se inclina un poco (una sola imagen: no hay capas que se crucen)
  const reset = () => { ['--tilt-x', '--tilt-y'].forEach(k => scene.style.removeProperty(k)); scene.classList.remove('is-touching'); };
  scene.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !canAnimate()) return;
    const r = scene.getBoundingClientRect(), x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - .5) * 2)), y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - .5) * 2));
    scene.style.setProperty('--tilt-x', (-y * 8).toFixed(1) + 'deg'); scene.style.setProperty('--tilt-y', (x * 10).toFixed(1) + 'deg');
  });
  scene.addEventListener('pointerleave', reset);
  scene.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && canAnimate()) scene.classList.add('is-touching'); });
  scene.addEventListener('pointerup', reset); scene.addEventListener('pointercancel', reset);
  if ('IntersectionObserver' in window) { authSceneObserver = new IntersectionObserver(es => scene.classList.toggle('is-paused', !es[0].isIntersecting)); authSceneObserver.observe(scene); }
}

// ───────────────────────── render ─────────────────────────
function render(scroll = true) {
  if (authSceneObserver) { authSceneObserver.disconnect(); authSceneObserver = null; }
  applyGroupTheme(); header(); nav();
  document.documentElement.lang = lang;
  $('#main').className = S.page === 'auth' ? '' : 'main';
  $('#main').innerHTML = S.page === 'home' ? home() : S.page === 'activity' ? activity() : S.page === 'stats' ? stats() : S.page === 'groups' ? groupsPage() : S.page === 'auth' ? auth() : '';
  if (S.page === 'auth') mountAuthScene();
  if (S.page === 'stats') bindChart();
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
}
// Repinta cuando llegan datos en vivo, sin mover el scroll ni romper lo que se está escribiendo
let refreshQueued = false;
function refresh() {
  if (refreshQueued) return; refreshQueued = true;
  // setTimeout y no requestAnimationFrame: rAF no corre con la app en segundo plano
  setTimeout(() => {
    refreshQueued = false;
    if (S.page === 'auth' || S.page === 'boot') return;
    const ae = document.activeElement;
    if (ae && ae.id === 'search-expenses') { $('#activity-results') && ($('#activity-results').innerHTML = activityResults()); nav(); return; }
    render(false);
    if (typeof refreshSheet === 'function') refreshSheet();
  }, 16);
}
function go(page) {
  S.page = page; S.st.bar = null;
  if (page === 'groups') loadGroupNets().then(() => { if (S.page === 'groups') render(false); });
  render();
}
