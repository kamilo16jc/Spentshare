// Stats modal — monthly totals, member bars, category bars, top 5 expenses
function openStatsModal(){
  const expenses=window._expenses||[];
  const now=new Date();
  const mn=lang==='es'?months_es:months_en;
  document.getElementById('statsMonthLabel').textContent=mn[now.getMonth()];
  const monthly=expenses.filter(e=>{
    if(e.type==='settle')return false;
    if(!e.createdAt?.toDate)return true;
    const d=e.createdAt.toDate();
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  });
  const total=monthly.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  document.getElementById('statsTotalAmt').textContent=fmt(total);
  const members=window._groupMembers||[];
  const memberTotals={};members.forEach(m=>memberTotals[m.uid]=0);
  monthly.forEach(e=>{if(memberTotals[e.paidByUid]!==undefined)memberTotals[e.paidByUid]+=parseFloat(e.amount)||0;});
  const maxMember=Math.max(...Object.values(memberTotals),1);
  document.getElementById('memberBars').innerHTML=members.map((m,i)=>{
    const amt=memberTotals[m.uid]||0;const pct=total>0?Math.round(amt/total*100):0;const bw=Math.round(amt/maxMember*100);
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-family:'Nunito',sans-serif;font-size:13px;font-weight:700">${getAvatar(m.name)} ${(m.name||'').split(' ')[0]}</div>
        <div style="display:flex;gap:8px;align-items:center"><span style="font-size:11px;color:var(--muted)">${pct}%</span><span style="font-family:'Nunito',sans-serif;font-size:14px;font-weight:900">${fmt(amt)}</span></div>
      </div>
      <div class="bar-track"><div class="bar-fill c${i%5}" style="width:0" data-w="${bw}"></div></div>
    </div>`;
  }).join('');
  const catTotals={};monthly.forEach(e=>{const c=e.category||'other';catTotals[c]=(catTotals[c]||0)+(parseFloat(e.amount)||0);});
  const sortedCats=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  const maxCat=sortedCats[0]?.[1]||1;
  document.getElementById('categoryBars').innerHTML=sortedCats.length===0
    ?`<div style="text-align:center;color:var(--muted);font-size:13px;padding:10px">${lang==='es'?'Sin datos':'No data'}</div>`
    :sortedCats.map(([cat,amt])=>{
      const pct=total>0?Math.round(amt/total*100):0;const bw=Math.round(amt/maxCat*100);
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <div style="font-size:12px;color:var(--text2)">${catEmojis[cat]||'📦'} ${t('cat'+cat.charAt(0).toUpperCase()+cat.slice(1))||cat}</div>
          <div style="display:flex;gap:8px"><span style="font-size:11px;color:var(--muted)">${pct}%</span><span style="font-family:'Nunito',sans-serif;font-size:12px;font-weight:700">${fmt(amt)}</span></div>
        </div>
        <div class="bar-track"><div class="bar-fill cat" style="width:0" data-w="${bw}"></div></div>
      </div>`;
    }).join('');
  const top5=[...monthly].sort((a,b)=>(parseFloat(b.amount)||0)-(parseFloat(a.amount)||0)).slice(0,5);
  const rankCls=['gold','silver','bronze','',''];const rankEmoji=['🥇','🥈','🥉','4','5'];
  document.getElementById('topExpenses').innerHTML=top5.length===0
    ?`<div style="text-align:center;color:var(--muted);font-size:13px;padding:10px">${lang==='es'?'Sin gastos este mes':'No expenses this month'}</div>`
    :top5.map((e,i)=>{
      const paidName=(window._groupMembers||[]).find(m=>m.uid===e.paidByUid)?.name||e.paidBy||'?';
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-family:'Nunito',sans-serif;font-size:18px;font-weight:900;color:var(--border);width:24px;text-align:center;flex-shrink:0" class="${rankCls[i]}">${rankEmoji[i]}</div>
        <div style="flex:1"><div style="font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${e.description}</div><div style="font-size:11px;color:var(--muted)">${(paidName).split(' ')[0]} · ${catEmojis[e.category]||'📦'}</div></div>
        <div style="font-family:'Nunito',sans-serif;font-size:15px;font-weight:900;flex-shrink:0">${fmt(e.amount)}</div>
      </div>`;
    }).join('');
  openModal('statsModal');
  setTimeout(()=>document.querySelectorAll('.bar-fill').forEach(b=>b.style.width=b.dataset.w+'%'),100);
}
