// Budgets: create by natural language, live progress vs this month's spending.
let budgetUnsub=null;

function loadBudgets(){
  if(budgetUnsub){budgetUnsub();budgetUnsub=null;}
  if(!currentGroup)return;
  window._budgets=[];
  const q=window._query(window._col(window._db,`groups/${currentGroup.id}/budgets`),window._orderBy('createdAt','desc'));
  budgetUnsub=window._onSnap(q,snap=>{
    window._budgets=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderBudgets();
  },()=>{});
}

// This month's spending for a budget's categories.
function budgetSpent(b){
  const now=new Date();
  const cats=new Set(b.categories||[]);
  return (window._expenses||[]).filter(e=>{
    if(e.type==='settle')return false;
    if(!cats.has(e.category))return false;
    if(e.createdAt&&e.createdAt.toDate){ const d=e.createdAt.toDate(); if(d.getMonth()!==now.getMonth()||d.getFullYear()!==now.getFullYear())return false; }
    return true;
  }).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
}

function catLabel(c){ return t('cat'+c.charAt(0).toUpperCase()+c.slice(1))||c; }

function renderBudgets(){
  const el=document.getElementById('budgetsList'); if(!el)return;
  const budgets=window._budgets||[];
  if(budgets.length===0){
    el.innerHTML=`<div class="budget-empty" onclick="openBudgetModal()">${lang==='es'?'Sin presupuestos aún. Toca <b>+ Nuevo</b> para crear uno hablando normal.':'No budgets yet. Tap <b>+ New</b> to create one in plain words.'}</div>`;
    return;
  }
  el.innerHTML=budgets.map(b=>{
    const spent=budgetSpent(b);
    const limit=parseFloat(b.amount)||0;
    const pct=limit>0?Math.round(spent/limit*100):0;
    const barPct=Math.min(100,Math.max(0,pct));
    const over=limit>0&&spent>limit;
    const near=!over&&pct>=80;
    const cls=over?'over':near?'near':'';
    const cats=(b.categories||[]).map(catLabel).join(' · ');
    return `<div class="budget-card">
      <div class="budget-top">
        <div class="budget-id"><span class="budget-emoji">${esc(b.emoji||'📊')}</span>
          <div class="budget-meta"><div class="budget-name">${esc(b.name||'')}</div><div class="budget-cats">${esc(cats)}</div></div>
        </div>
        <button class="budget-del" onclick="deleteBudget('${b.id}')" aria-label="${lang==='es'?'Eliminar':'Delete'}">✕</button>
      </div>
      <div class="budget-bar"><div class="budget-fill ${cls}" style="width:${barPct}%"></div></div>
      <div class="budget-foot">
        <span class="budget-amt">${fmt(spent)} <span class="budget-limit">/ ${fmt(limit)}</span></span>
        <span class="budget-pct ${cls}">${over?(lang==='es'?'Excedido':'Over'):pct+'%'}</span>
      </div>
    </div>`;
  }).join('');
}

function openBudgetModal(){
  const inp=document.getElementById('budgetInput'); if(inp) inp.value='';
  openModal('budgetModal');
  setTimeout(()=>{ const i=document.getElementById('budgetInput'); if(i) i.focus(); },320);
}

async function createBudgetFromText(){
  if(!currentGroup) return;
  const el=document.getElementById('budgetInput');
  const text=(el&&el.value||'').trim();
  if(!text) return;
  const btn=document.getElementById('budgetGoBtn');
  if(btn){ btn.disabled=true; btn.classList.add('loading'); }
  try{
    const res=await window._callFn('parseBudget',{ text, currency: currentGroup&&currentGroup.currency });
    const d=(res&&res.data)?res.data:res;
    if(!d||!d.found||!(d.amount>0)){ showToast(lang==='es'?'No lo entendí. Probá: “500 mil para restaurantes”':'Could not understand'); return; }
    await window._addDoc(window._col(window._db,`groups/${currentGroup.id}/budgets`),{
      name:d.name, categories:d.categories, amount:d.amount, emoji:d.emoji||'📊',
      period:'month', createdByUid:window._curUser?.uid, createdAt:window._srvTs()
    });
    closeModal('budgetModal');
    showToast((lang==='es'?'Presupuesto creado ✓ · ':'Budget created ✓ · ')+d.name+' '+fmt(d.amount));
  }catch(e){ console.error('parseBudget error',e); showToast(lang==='es'?'Error al crear el presupuesto':'Error creating budget'); }
  finally{ if(btn){ btn.disabled=false; btn.classList.remove('loading'); } }
}

async function deleteBudget(id){
  const b=(window._budgets||[]).find(x=>x.id===id);
  const msg=lang==='es'?`¿Eliminar el presupuesto "${b?b.name:''}"?`:`Delete budget "${b?b.name:''}"?`;
  if(!confirm(msg)) return;
  try{ await window._delDoc(window._docRef(window._db,`groups/${currentGroup.id}/budgets`,id)); showToast(lang==='es'?'🗑️ Presupuesto eliminado':'Budget deleted'); }
  catch(e){ showToast(t('errDelete')); }
}
