// Member grids, members modal, invite helpers
function renderMemberGrids(){
  const members=window._groupMembers||[];
  const me=window._curUser;
  ['paidByGrid','settleFromGrid','settleToGrid','withWhomGrid'].forEach(id=>{
    document.getElementById(id).innerHTML=members.map(m=>`
      <button class="paid-btn ${id==='paidByGrid'&&m.uid===me?.uid?'selected':''}"
        data-uid="${m.uid}" data-name="${m.name}"
        onclick="${id==='paidByGrid'?'selectPaidBy':id==='settleFromGrid'?'selectSettleFrom':id==='settleToGrid'?'selectSettleTo':'selectWithWhom'}(this)">
        <span class="paid-avatar">${getAvatarForMember(m.uid, m.name)}</span>
        <span class="paid-name">${(m.name||'').split(' ')[0]}</span>
      </button>`).join('');
  });
  selectedPaidBy=me?.uid||(members[0]?.uid);
}

async function openMembersModal(){
  if(currentGroup){
    try{
      const uids = currentGroup.memberUids||[];
      const emails = currentGroup.memberEmails||[];
      const docs = await Promise.all(uids.map(uid=>window._getDoc(window._docRef(window._db,'users',uid))));
      window._groupMembers = [];
      docs.forEach((d,i)=>{
        if(d.exists()){
          const data = d.data();
          data.uid = d.id;
          window._groupMembers.push(data);
        } else {
          const email = emails[i]||'';
          window._groupMembers.push({uid:uids[i], name:email?email.split('@')[0]:'Member', email});
        }
      });
      console.log('Members modal:', window._groupMembers.map(m=>m.name));
      loadGroupMemberAvatars();
    }catch(e){ console.error('membersModal',e); }
  }
  const members=window._groupMembers||[];
  const expenses=window._expenses||[];
  const{debts}=calcBalances(expenses);
  const netPos={};members.forEach(m=>netPos[m.uid]=0);
  debts.forEach(d=>{netPos[d.from.uid]-=d.amount;netPos[d.to.uid]+=d.amount;});
  const isMe = uid => uid === window._curUser?.uid;
  const youLabel = lang==='es'?'tú':'you';
  document.getElementById('membersList').innerHTML = members.length === 0
    ? `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">${lang==='es'?'Sin miembros aún':'No members yet'}</div>`
    : members.map(m=>{
      const net = netPos[m.uid]||0;
      const netColor = Math.abs(net)<0.01?'var(--muted)':net>0?'var(--green)':'var(--red)';
      const netText = Math.abs(net)<0.01?'✓ ok':net>0?'▲ +'+fmt(net):'▼ -'+fmt(Math.abs(net));
      const avatar = getAvatar(m.name, m.uid);
      const isEmoji = avatar && !avatar.startsWith('data:');
      const avatarEl = isEmoji
        ? `<div style="width:44px;height:44px;border-radius:50%;background:var(--cream);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${avatar}</div>`
        : avatar.startsWith('data:')
          ? `<img src="${avatar}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0">`
          : `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--orange),var(--green));display:flex;align-items:center;justify-content:center;font-family:'Nunito',sans-serif;font-size:18px;font-weight:900;color:white;flex-shrink:0">${(m.name||'?')[0].toUpperCase()}</div>`;
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        ${avatarEl}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px">
            ${m.name||'?'}
            ${isMe(m.uid)?`<span style="font-size:10px;background:var(--orange-light);color:var(--orange);border-radius:20px;padding:2px 8px;font-weight:700">${youLabel}</span>`:''}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.email||''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:'Nunito',sans-serif;font-size:14px;font-weight:900;color:${netColor}">${netText}</div>
        </div>
      </div>`;
    }).join('');

  document.querySelector('#membersModal .modal-title').textContent =
    (currentGroup ? `👥 ${currentGroup.name}` : t('membersModalTitle'));

  openModal('membersModal');
}

async function sendInviteEmail(){
  const inp = document.getElementById('inviteMoreEmail');
  const email = (inp?.value || '').trim();
  if(!email.includes('@')){
    showToast(lang==='es'?'⚠️ Email inválido':'⚠️ Invalid email');
    return;
  }
  if(!currentGroup?.id){
    showToast(lang==='es'?'⚠️ Abre un grupo primero':'⚠️ Open a group first');
    return;
  }
  const btn = document.querySelector('#membersModal button[onclick*="sendInviteEmail"]');
  if(btn){ btn.disabled=true; btn.textContent=lang==='es'?'Enviando...':'Sending...'; }
  try{
    const res = await window._callFn('sendGroupInvite', { groupId: currentGroup.id, toEmail: email });
    if(res?.data?.ok){
      showToast(t('toastInviteSent'));
      inp.value='';
    } else if(res?.data?.reason === 'already-member'){
      showToast(lang==='es'?'✅ Ya es miembro del grupo':'✅ Already a member');
      inp.value='';
    } else {
      showToast(lang==='es'?'❌ No se pudo enviar':'❌ Could not send');
    }
  }catch(e){
    console.error('sendInviteEmail', e);
    showToast(lang==='es'?'❌ Error enviando invitación':'❌ Error sending invite');
  }
  if(btn){ btn.disabled=false; btn.textContent=t('sendInviteBtn'); }
}
