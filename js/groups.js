// Groups: list, create, join, select, delete, invite-code flow
function generateCode(){
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [0,1].map(()=>c[Math.floor(Math.random()*c.length)]).join('')+'-'+
    [0,1,2,3].map(()=>c[Math.floor(Math.random()*c.length)]).join('');
}

async function loadUserGroups(){
  if(!window._curUser)return;
  try{
    const snap=await window._getDocs(window._query(
      window._col(window._db,'groups'),
      window._where('memberUids','array-contains',window._curUser.uid)
    ));
    userGroups=snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){userGroups=[];}
}

function showGroupScreen(){
  const gs=document.getElementById('groupScreen');
  gs.style.display='flex';gs.classList.remove('hide');
  setTimeout(()=>gs.classList.add('show'),50);
  renderGroupList();
}

// Group list — Finova-style cards. One tap opens the group.
const CHEVRON_SVG='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const TRASH_SVG='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

function renderGroupList(){
  const list=document.getElementById('groupList');
  if(userGroups.length===0){
    list.innerHTML=`<div class="hive-empty">${t('noGroups')}</div>`;return;
  }
  list.innerHTML=userGroups.map(g=>{
    const letter=((g.name||'?').trim().charAt(0)||'?').toUpperCase();
    const members=(g.memberUids||[]).length;
    const mlabel=members+' '+(lang==='es'?'miembros':'members');
    // stable warm gradient per group (keeps the ember essence, plays with tones)
    const tone=((g.name||'?').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%6;
    return `<button class="group-item" onclick="selectGroup('${g.id}')" aria-label="${esc(g.name)}">
      <span class="gc-avatar tone-${tone}">${esc(letter)}</span>
      <span class="gc-info"><span class="gc-name">${esc(g.name)}</span><span class="gc-sub">${mlabel}</span></span>
      <span class="gc-del" title="${lang==='es'?'Eliminar':'Delete'}" onclick="hiveDelete(event,'${g.id}')">${TRASH_SVG}</span>
      <span class="gc-arrow">${CHEVRON_SVG}</span>
    </button>`;
  }).join('');
}

function hiveDelete(ev,id){ ev.stopPropagation(); ev.preventDefault(); deleteGroup(id); }

async function deleteGroup(gid){
  const gname = userGroups.find(g=>g.id===gid)?.name || '';
  const msg = lang==='es' ? `¿Eliminar el grupo "${gname}"? Esto borrará todos los gastos.` : `Delete group "${gname}"? This will delete all expenses.`;
  if(!confirm(msg)) return;
  try {
    const expSnap = await window._getDocs(window._col(window._db, `groups/${gid}/expenses`));
    await Promise.all(expSnap.docs.map(d => window._delDoc(window._docRef(window._db, `groups/${gid}/expenses`, d.id))));
    await window._delDoc(window._docRef(window._db, 'groups', gid));
    userGroups = userGroups.filter(g => g.id !== gid);
    renderGroupList();
    showToast(lang==='es' ? '🗑️ Grupo eliminado' : '🗑️ Group deleted');
  } catch(e) { showToast(t('errDelete')); }
}

async function selectGroup(gid){
  const grp=userGroups.find(g=>g.id===gid);
  if(!grp)return;
  currentGroup=grp;
  // Clear the previous group's data so it never leaks into the new one
  window._expenses=null;
  window._groupMembers=[];
  document.getElementById('headerGroupEmoji').textContent=((grp.name||'?').trim().charAt(0)||'?').toUpperCase();
  document.getElementById('headerGroupName').textContent=grp.name;
  document.getElementById('groupInviteCode').textContent=grp.inviteCode||'--';
  // Switch screens right away — data loads below and fills in as it arrives.
  // Blocking here on network fetches is what froze the app when switching groups.
  const gs=document.getElementById('groupScreen');
  gs.classList.add('hide');
  setTimeout(()=>{gs.style.display='none';gs.classList.remove('show','hide');finalizeDashboard(); initSwipeModals();},400);
  try{
    const grpDoc = await window._getDoc(window._docRef(window._db,'groups',gid));
    if(grpDoc.exists()){
      const gdata = grpDoc.data();
      currentGroup = {...grp, ...gdata, id:gid};
      grp.memberUids = gdata.memberUids||[];
      grp.memberEmails = gdata.memberEmails||[];
      document.getElementById('groupInviteCode').textContent=currentGroup.inviteCode||'--';
    }
    const uids = currentGroup.memberUids||[];
    const emails = currentGroup.memberEmails||[];
    const docs = await Promise.all(uids.map(uid=>window._getDoc(window._docRef(window._db,'users',uid))));
    window._groupMembers = docs.map((d,i)=>{
      if(d.exists()){ const data=d.data(); data.uid=d.id; return data; }
      const email = emails[i]||'';
      return {uid:uids[i], name:email?email.split('@')[0]:'Member', email};
    });
  }catch(e){ console.error('loadMembers',e); }
  // Members arrived (maybe after the dashboard is already visible) — refresh UI
  renderMemberGrids();
  if(window._expenses){ renderExpenses(window._expenses); updateBalances(window._expenses); }
  loadGroupMemberAvatars();
  // Legacy group without currency → ask once (non-blocking)
  if(!currentGroup.currency && typeof promptGroupCurrency==='function'){
    promptGroupCurrency(gid).then(()=>{
      if(window._expenses){ renderExpenses(window._expenses); updateBalances(window._expenses); }
    });
  }
}

function goToGroupPicker(){
  if(groupUnsub){groupUnsub();groupUnsub=null;}
  const dash=document.getElementById('dashboard');
  dash.classList.remove('show');
  setTimeout(()=>{
    dash.style.display='none';
    closeModal('addModal');closeModal('settleModal');closeModal('statsModal');
    closeModal('debtModal');closeModal('membersModal');
    // Show the list immediately with what we already have; refresh in background
    // (blocking on the network here left the user on a blank screen)
    showGroupScreen();
    loadUserGroups().then(renderGroupList).catch(()=>{});
  },400);
}

function openCreateGroupModal(){
  document.getElementById('newGroupCodeBox').style.display='none';
  document.getElementById('newGroupName').value='';
  document.getElementById('inviteChips').innerHTML='';
  inviteEmails=[];selEmoji_='🏠';
  document.querySelectorAll('.emoji-btn').forEach((b,i)=>b.classList.toggle('selected',i===0));
  if(typeof resetNewGroupCurrency==='function') resetNewGroupCurrency();
  openModal('createGroupModal');
}

function selEmoji(btn){
  document.querySelectorAll('.emoji-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');selEmoji_=btn.textContent;
}

function addChip(){
  const inp=document.getElementById('inviteEmailInput');
  const email=inp.value.trim().replace(',','');
  if(!email.includes('@')||inviteEmails.includes(email)){inp.value='';return;}
  inviteEmails.push(email);
  const chip=document.createElement('span');
  chip.className='member-chip';
  chip.innerHTML=`${email} <span class="chip-x" onclick="removeChip(this,'${email}')">✕</span>`;
  document.getElementById('inviteChips').appendChild(chip);
  inp.value='';
}

function removeChip(el,email){inviteEmails=inviteEmails.filter(e=>e!==email);el.parentElement.remove();}

async function createGroup(){
  const name=document.getElementById('newGroupName').value.trim();
  if(!name){showToast(t('errGroupName'));return;}
  const btn=document.getElementById('createGroupBtn');
  btn.disabled=true;btn.textContent=t('saving');
  try{
    const uid=window._curUser.uid;
    const code=generateCode();
    const currency = (typeof getNewGroupCurrency==='function') ? getNewGroupCurrency() : 'USD';
    const ref=await window._addDoc(window._col(window._db,'groups'),{
      name,emoji:selEmoji_,memberUids:[uid],
      memberEmails:[window._curUser.email],
      inviteCode:code,currency,createdBy:uid,createdAt:window._srvTs()
    });
    newlyCreatedGroupId=ref.id;
    userGroups.push({id:ref.id,name,emoji:selEmoji_,memberUids:[uid],memberEmails:[window._curUser.email],inviteCode:code,currency});
    renderGroupList();
    document.getElementById('newGroupCode').textContent=code;
    document.getElementById('groupInviteCode').textContent=code;
    document.getElementById('newGroupCodeBox').style.display='block';
    showToast(t('toastGroupCreated'));
    // Fire-and-forget invitations to chip emails
    if(inviteEmails.length>0 && window._callFn){
      Promise.allSettled(inviteEmails.map(em =>
        window._callFn('sendGroupInvite', { groupId: ref.id, toEmail: em })
      )).then(results => {
        const sent = results.filter(r => r.status==='fulfilled' && r.value?.data?.ok).length;
        if(sent>0) showToast(lang==='es'?`📧 ${sent} invitación(es) enviada(s)`:`📧 ${sent} invite(s) sent`);
      });
    }
  }catch(e){showToast(t('errSave'));}
  btn.disabled=false;btn.textContent=t('createGroupBtn');
}

async function goToNewGroup(){
  if(!newlyCreatedGroupId)return;
  closeModal('createGroupModal');
  await selectGroup(newlyCreatedGroupId);
  newlyCreatedGroupId=null;
}

async function joinGroup(){
  const code=document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if(!code){showToast(t('errJoinCode'));return;}
  try{
    const snap=await window._getDocs(window._query(window._col(window._db,'groups'),window._where('inviteCode','==',code)));
    if(snap.empty){showToast(t('errCodeNotFound'));return;}
    const gDoc=snap.docs[0];
    const uid=window._curUser.uid;
    const data=gDoc.data();
    if(!(data.memberUids||[]).includes(uid)){
      // arrayUnion avoids clobbering members added concurrently by someone else
      await window._setDoc(window._docRef(window._db,'groups',gDoc.id),{
        memberUids:window._arrayUnion(uid),
        memberEmails:window._arrayUnion(window._curUser.email)
      },{merge:true});
    }
    if(!userGroups.find(g=>g.id===gDoc.id)) userGroups.push({
      id:gDoc.id,...data,
      memberUids:[...new Set([...(data.memberUids||[]),uid])],
      memberEmails:[...new Set([...(data.memberEmails||[]),window._curUser.email])]
    });
    renderGroupList();
    showToast(t('toastJoined'));
    document.getElementById('joinCodeInput').value='';
  }catch(e){showToast(t('errSave'));}
}

function copyInviteCode(){
  const code=(currentGroup?.inviteCode)||document.getElementById('newGroupCode').textContent;
  navigator.clipboard.writeText(code).then(()=>showToast(t('toastCopied'))).catch(()=>{});
}

function finalizeDashboard(){
  const dash=document.getElementById('dashboard');
  dash.style.display='block';
  setTimeout(()=>dash.classList.add('show'),50);
  updateDashboardLabels();
  loadAvatar();
  renderMemberGrids();
  subscribeExpenses();
  if(typeof loadBudgets==='function') loadBudgets();
}
