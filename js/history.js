// History: browse & filter this group's expenses by month / day / date range.
// All expenses are already in window._expenses (ordered newest-first), so the
// filtering is 100% client-side — no extra reads or AI calls.
let _histMode='month';

function _histYmd(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _histDate(e){ return (e.createdAt&&e.createdAt.toDate) ? e.createdAt.toDate() : null; }

function openHistoryModal(){
  const now=new Date();
  const m=document.getElementById('histMonth');
  if(m) m.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  setHistoryMode('month');       // also renders
  openModal('historyModal');
}

function setHistoryMode(mode){
  _histMode=mode;
  document.querySelectorAll('.hist-mode').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  const show=(id,on,disp)=>{ const el=document.getElementById(id); if(el) el.style.display=on?(disp||'block'):'none'; };
  show('histMonthWrap', mode==='month');
  show('histDayWrap',   mode==='day');
  show('histRangeWrap', mode==='range', 'flex');
  const now=new Date();
  if(mode==='day'){ const d=document.getElementById('histDay'); if(d&&!d.value) d.value=_histYmd(now); }
  if(mode==='range'){
    const f=document.getElementById('histFrom'), t2=document.getElementById('histTo');
    if(f&&!f.value) f.value=_histYmd(new Date(now.getFullYear(),now.getMonth(),1));
    if(t2&&!t2.value) t2.value=_histYmd(now);
  }
  renderHistory();
}

function _histMatch(e){
  if(e.type==='settle') return false;         // history shows spending, not settle-ups
  if(_histMode==='all') return true;
  const d=_histDate(e);
  if(!d) return false;                        // pending serverTimestamp → not dated yet
  if(_histMode==='month'){
    const v=document.getElementById('histMonth').value; if(!v) return true;
    const [y,m]=v.split('-').map(Number);
    return d.getFullYear()===y && d.getMonth()===m-1;
  }
  if(_histMode==='day'){
    const v=document.getElementById('histDay').value; if(!v) return true;
    return _histYmd(d)===v;
  }
  if(_histMode==='range'){
    const f=document.getElementById('histFrom').value, t2=document.getElementById('histTo').value;
    const s=_histYmd(d);
    if(f && s<f) return false;
    if(t2 && s>t2) return false;
    return true;
  }
  return true;
}

function renderHistory(){
  const list=document.getElementById('historyList'); if(!list) return;
  const rows=(window._expenses||[]).filter(_histMatch);   // already newest-first
  const total=rows.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const totalEl=document.getElementById('histTotal'); if(totalEl) totalEl.textContent=fmt(total);
  const countEl=document.getElementById('histCount'); if(countEl) countEl.textContent=rows.length;
  if(rows.length===0){
    list.innerHTML=`<div class="empty-state" style="padding:34px 10px"><p>${lang==='es'?'Sin gastos en este período':'No expenses in this period'}</p></div>`;
    return;
  }
  const members=window._groupMembers||[];
  const locale=lang==='es'?'es-MX':'en-US';
  list.innerHTML=rows.map(e=>{
    const d=_histDate(e);
    const date=d?d.toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'}):t('today');
    const mono=((e.description||'?').trim().charAt(0)||'?').toUpperCase();
    const paidByName=members.find(m=>m.uid===e.paidByUid)?.name||e.paidBy||'?';
    const cat=e.category?(t('cat'+e.category.charAt(0).toUpperCase()+e.category.slice(1))||''):'';
    return `<div class="expense-item">
      <div class="expense-emoji">${expenseGlyph(e,mono)}</div>
      <div class="expense-info">
        <div class="expense-desc">${esc(e.description)}</div>
        <div class="expense-meta">
          <span class="expense-who">${esc((paidByName).split(' ')[0])}</span>
          <span>${date}</span>
          ${cat?`<span>${esc(cat)}</span>`:''}
        </div>
      </div>
      <div><div class="expense-amount">${fmt(e.amount)}</div></div>
    </div>`;
  }).join('');
}
