// Debt calculation, balance cards, settle flow
function calcBalances(expenses){
  const now=new Date();
  // monthly is used only for stats/totals display — NOT for debt calculation
  const monthly=(expenses||[]).filter(e=>{
    if(!e.createdAt?.toDate)return true;
    const d=e.createdAt.toDate();
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  });
  const members=window._groupMembers||[];
  const net={};
  members.forEach(a=>{net[a.uid]={};members.forEach(b=>net[a.uid][b.uid]=0);});
  // Use ALL expenses (all history) to calculate who owes whom — debts persist until settled
  (expenses||[]).forEach(e=>{
    if(e.type==='settle'){
      const amt=parseFloat(e.amount)||0;
      if(e.paidByUid&&e.settledToUid&&net[e.paidByUid]&&net[e.settledToUid]){
        net[e.paidByUid][e.settledToUid]-=amt;
        net[e.settledToUid][e.paidByUid]+=amt;
      }return;
    }
    const amt=parseFloat(e.amount)||0;
    let debtors=[];
    if(e.split==='all') debtors=members.filter(m=>m.uid!==e.paidByUid);
    else if(e.split==='two'){const partner=e.splitWithUid||members.filter(m=>m.uid!==e.paidByUid)[0]?.uid;debtors=partner?[{uid:partner}].filter(m=>m.uid!==e.paidByUid):[];}
    else if(e.split==='full'){const partner=e.splitWithUid;if(partner&&net[partner]&&net[partner][e.paidByUid]!==undefined){net[partner][e.paidByUid]+=amt;net[e.paidByUid][partner]-=amt;}return;}
    if(debtors.length>0){
      const share=amt/(debtors.length+1);
      debtors.forEach(d=>{
        if(net[d.uid]&&net[d.uid][e.paidByUid]!==undefined){net[d.uid][e.paidByUid]+=share;net[e.paidByUid][d.uid]-=share;}
      });
    }
  });
  const debts=[];const processed=new Set();
  members.forEach(a=>members.forEach(b=>{
    if(a.uid===b.uid)return;
    const key=[a.uid,b.uid].sort().join('-');
    if(processed.has(key))return;processed.add(key);
    const owes=net[a.uid]?.[b.uid]||0;
    if(Math.abs(owes)<0.01)return;
    if(owes>0)debts.push({from:a,to:b,amount:owes});
    else debts.push({from:b,to:a,amount:-owes});
  }));
  return{debts,monthly};
}

function updateBalances(expenses){
  const now=new Date();
  const{debts,monthly}=calcBalances(expenses);
  const members=window._groupMembers||[];
  const netPos={};members.forEach(m=>netPos[m.uid]=0);
  debts.forEach(d=>{netPos[d.from.uid]-=d.amount;netPos[d.to.uid]+=d.amount;});
  const bm=document.getElementById('balanceMembers');
  bm.innerHTML=members.map((m,i)=>{
    const net=netPos[m.uid]||0;
    return `<div class="balance-member">
      <div class="bm-name">${(m.name||'').split(' ')[0]}</div>
      <div class="bm-amount ${net>=0?'positive':'negative'}">${fmt(Math.abs(net))}</div>
      <div class="bm-status">${Math.abs(net)<0.01?'✓'+t('statusOk'):net>0?'▲'+t('statusOwedTo'):'▼'+t('statusOwes')}</div>
    </div>`;
  }).join('');
  const total=monthly.filter(e=>e.type!=='settle').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  document.getElementById('totalMonth').textContent=fmt(total);
  const mn=lang==='es'?months_es:months_en;
  document.getElementById('balanceMonth').textContent=`${mn[now.getMonth()]} ${now.getFullYear()}`;
  renderDebtSummary(debts);
}

function renderDebtSummary(debts){
  const el=document.getElementById('debtSummary');if(!el)return;
  if(debts.length===0){
    el.innerHTML=`<div class="debt-card settled"><div style="font-size:28px">🎉</div><div class="debt-info"><div class="debt-text ok"><strong>${t('allClear')}</strong></div><div class="debt-sub">${t('allClearSub')}</div></div></div>`;return;
  }
  el.innerHTML=debts.map(d=>`
    <div class="debt-card">
      <div class="debt-avatar-row"><span class="debt-av">${getAvatar(d.from.name)}</span><span class="debt-arrow">→</span><span class="debt-av">${getAvatar(d.to.name)}</span></div>
      <div class="debt-info">
        <div class="debt-text"><strong>${(d.from.name||'').split(' ')[0]}</strong> ${lang==='es'?'le debe a':'owes'} <strong>${(d.to.name||'').split(' ')[0]}</strong></div>
        <div class="debt-sub">${t('tapSettle')||'Tap Settle to clear'}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <div class="debt-amount">${fmt(d.amount)}</div>
        <button class="settle-quick-btn" onclick="quickSettle('${d.from.uid}','${d.to.uid}',${d.amount.toFixed(2)},'${(d.from.name||'').replace(/'/g,'')}',' ${(d.to.name||'').replace(/'/g,'')}')">${t('settleBtn')||'Settle'}</button>
      </div>
    </div>`).join('');
}

function renderDebtDetail(debts,expenses){
  const{monthly}=calcBalances(expenses);
  const members=window._groupMembers||[];
  const paid={};const owedTotal={};
  members.forEach(m=>{paid[m.uid]=0;owedTotal[m.uid]=0;});
  monthly.filter(e=>e.type!=='settle').forEach(e=>{
    const amt=parseFloat(e.amount)||0;
    paid[e.paidByUid]=(paid[e.paidByUid]||0)+amt;
    if(e.split==='all') members.forEach(m=>owedTotal[m.uid]=(owedTotal[m.uid]||0)+amt/members.length);
    else if(e.split==='two'){
      const p=e.splitWithUid||members.filter(m=>m.uid!==e.paidByUid)[0]?.uid;
      const share=amt/2;
      if(p)owedTotal[p]=(owedTotal[p]||0)+share;
      owedTotal[e.paidByUid]=(owedTotal[e.paidByUid]||0)+share;
    }
    else if(e.split==='full'){
      const p=e.splitWithUid;
      if(p)owedTotal[p]=(owedTotal[p]||0)+amt;
    }
  });
  const el=document.getElementById('debtDetailContent');if(!el)return;
  const memberRows=members.map(m=>{
    const net=(paid[m.uid]||0)-(owedTotal[m.uid]||0);
    return `<div class="detail-row">
      <div class="detail-label">${getAvatar(m.name)} ${(m.name||'').split(' ')[0]}</div>
      <div>
        <div class="detail-value">${t('paidLabel')} ${fmt(paid[m.uid]||0)}</div>
        <div class="detail-value" style="font-size:11px;color:var(--muted)">${t('owesLabel')} ${fmt(owedTotal[m.uid]||0)}</div>
        <div class="detail-value ${net>=0?'pos':'neg'}">${net>=0?'▲':'▼'} ${fmt(Math.abs(net))}</div>
      </div></div>`;
  }).join('');
  const debtRows=debts.length===0
    ?`<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">🎉 ${t('allClear')}</div>`
    :debts.map(d=>`<div class="detail-row">
      <div class="detail-label">${getAvatar(d.from.name)} <strong>${(d.from.name||'').split(' ')[0]}</strong> → ${getAvatar(d.to.name)} ${(d.to.name||'').split(' ')[0]}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="detail-value neg">${fmt(d.amount)}</div>
        <button class="settle-quick-btn" onclick="quickSettle('${d.from.uid}','${d.to.uid}',${d.amount.toFixed(2)},'${(d.from.name||'').replace(/'/g,'')}','${(d.to.name||'').replace(/'/g,'')}');closeModal('debtModal')">${t('settleBtn')||'Settle'}</button>
      </div></div>`).join('');
  el.innerHTML=`
    <div style="margin-bottom:20px">
      <div class="section-title" style="margin-bottom:12px">${t('debtByPerson')}</div>${memberRows}
    </div>
    <div>
      <div class="section-title" style="margin-bottom:12px">${t('debtPending')}</div>${debtRows}
    </div>`;
}

function openDebtDetail(){
  const expenses=window._expenses||[];
  const{debts}=calcBalances(expenses);
  renderDebtDetail(debts,expenses);
  openModal('debtModal');
}

async function quickSettle(fromUid,toUid,amount,fromName,toName){
  if(!confirm(t('confirmSettle',fromName,toName,fmt(parseFloat(amount)))))return;
  try{
    await window._addDoc(window._col(window._db,`groups/${currentGroup.id}/expenses`),{
      amount:parseFloat(amount),
      description:t('settleDesc',fromName,toName),
      paidBy:fromName,paidByUid:fromUid,
      settledTo:toName,settledToUid:toUid,
      createdAt:window._srvTs(),type:'settle',createdByUid:window._curUser?.uid
    });
    showToast(t('toastSettledZero'));
    closeModal('debtModal');
  }catch(e){showToast(t('errRegister'));}
}

async function addSettle(){
  const amount=parseFloat(document.getElementById('settleAmount').value);
  const members=window._groupMembers||[];
  const fromMember=members.find(m=>m.uid===settleFrom);
  const toMember=members.find(m=>m.uid===settleTo);
  if(!amount||amount<=0){showToast(t('errAmount'));return;}
  if(!settleFrom){showToast(t('errFrom'));return;}
  if(!settleTo){showToast(t('errTo'));return;}
  if(settleFrom===settleTo){showToast(t('errDiff'));return;}
  try{
    await window._addDoc(window._col(window._db,`groups/${currentGroup.id}/expenses`),{
      amount,description:t('settlePayDesc',fromMember?.name||'?',toMember?.name||'?'),
      paidBy:fromMember?.name||'?',paidByUid:settleFrom,
      settledTo:toMember?.name||'?',settledToUid:settleTo,
      createdAt:window._srvTs(),type:'settle',createdByUid:window._curUser?.uid
    });
    closeModal('settleModal');showToast(t('toastSettle'));
    document.getElementById('settleAmount').value='';
    settleFrom=null;settleTo=null;
    document.querySelectorAll('#settleFromGrid .paid-btn,#settleToGrid .paid-btn').forEach(b=>b.classList.remove('selected'));
  }catch(e){showToast(t('errSave'));}
}

function selectSettleFrom(el){
  document.querySelectorAll('#settleFromGrid .paid-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  settleFrom=el.dataset.uid;
}

function selectSettleTo(el){
  document.querySelectorAll('#settleToGrid .paid-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  settleTo=el.dataset.uid;
}

function openSettleModal(){ openModal('settleModal'); }
