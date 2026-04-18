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

function renderGroupList(){
  const list=document.getElementById('groupList');
  if(userGroups.length===0){
    list.innerHTML=`<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;font-weight:600">${t('noGroups')}</div>`;return;
  }
  list.innerHTML=userGroups.map(g=>`
    <div class="group-item">
      <div class="group-emoji" style="cursor:pointer" onclick="selectGroup('${g.id}')">${g.emoji||'🏠'}</div>
      <div class="group-info" style="cursor:pointer" onclick="selectGroup('${g.id}')">
        <div class="group-name-txt">${g.name}</div>
        <div class="group-members-txt">${(g.memberUids||[]).length} ${lang==='es'?'miembros':'members'}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <button class="group-open-btn" onclick="selectGroup('${g.id}')">${t('openGroupBtn')}</button>
        <button onclick="deleteGroup('${g.id}','${g.name.replace(/'/g,"\'")}')" style="background:var(--red-light);border:1px solid rgba(245,101,101,0.2);color:var(--red);border-radius:50px;padding:6px 12px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='var(--red)';this.style.color='white'" onmouseout="this.style.background='var(--red-light)';this.style.color='var(--red)'">🗑️</button>
      </div>
    </div>`).join('');
}

async function deleteGroup(gid, gname){
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
  try{
    const grpDoc = await window._getDoc(window._docRef(window._db,'groups',gid));
    if(grpDoc.exists()){
      const gdata = grpDoc.data();
      currentGroup = {...grp, ...gdata, id:gid};
      grp.memberUids = gdata.memberUids||[];
      grp.memberEmails = gdata.memberEmails||[];
    }
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
    console.log('Members loaded:', window._groupMembers.map(m=>m.name+'/'+m.uid));
  }catch(e){ console.error('loadMembers',e); window._groupMembers=[]; }
  document.getElementById('headerGroupEmoji').textContent=grp.emoji||'🏠';
  document.getElementById('headerGroupName').textContent=grp.name;
  document.getElementById('groupInviteCode').textContent=grp.inviteCode||'--';
  const gs=document.getElementById('groupScreen');
  gs.classList.add('hide');
  setTimeout(()=>{gs.style.display='none';gs.classList.remove('show','hide');finalizeDashboard(); initSwipeModals(); loadGroupMemberAvatars();},400);
}

function goToGroupPicker(){
  if(groupUnsub){groupUnsub();groupUnsub=null;}
  const dash=document.getElementById('dashboard');
  dash.classList.remove('show');
  setTimeout(async()=>{
    dash.style.display='none';
    closeModal('addModal');closeModal('settleModal');closeModal('statsModal');
    closeModal('debtModal');closeModal('membersModal');
    await loadUserGroups();showGroupScreen();
  },400);
}

function openCreateGroupModal(){
  document.getElementById('newGroupCodeBox').style.display='none';
  document.getElementById('newGroupName').value='';
  document.getElementById('inviteChips').innerHTML='';
  inviteEmails=[];selEmoji_='🏠';
  document.querySelectorAll('.emoji-btn').forEach((b,i)=>b.classList.toggle('selected',i===0));
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
    const ref=await window._addDoc(window._col(window._db,'groups'),{
      name,emoji:selEmoji_,memberUids:[uid],
      memberEmails:[window._curUser.email],
      inviteCode:code,createdBy:uid,createdAt:window._srvTs()
    });
    newlyCreatedGroupId=ref.id;
    userGroups.push({id:ref.id,name,emoji:selEmoji_,memberUids:[uid],memberEmails:[window._curUser.email],inviteCode:code});
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
      await window._setDoc(window._docRef(window._db,'groups',gDoc.id),{
        memberUids:[...(data.memberUids||[]),uid],
        memberEmails:[...(data.memberEmails||[]),window._curUser.email]
      },{merge:true});
    }
    if(!userGroups.find(g=>g.id===gDoc.id)) userGroups.push({id:gDoc.id,...data});
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
}
