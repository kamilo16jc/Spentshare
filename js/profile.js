// Profile dropdown — name edit, language switch, group code display
function openProfile(){
  const user=window._curUser;
  if(!user) return;
  const name=user.displayName||user.email.split('@')[0];
  document.getElementById('profileName').textContent=name;
  document.getElementById('profileEmail').textContent=user.email;
  document.getElementById('profileBtnEn').classList.toggle('active',lang==='en');
  document.getElementById('profileBtnEs').classList.toggle('active',lang==='es');
  applyAvatarEverywhere(userAvatar);
  if(userAvatar&&!userAvatar.startsWith('data:')){
    document.querySelectorAll('.avatar-emoji-btn').forEach(b=>b.classList.toggle('selected',b.textContent===userAvatar));
  }
  const gs=document.getElementById('profileGroupSection');
  if(currentGroup){ gs.style.display='block'; document.getElementById('profileGroupCode').textContent=currentGroup.inviteCode||'--'; document.getElementById('profileGroupName').textContent=currentGroup.name||'—'; }
  else gs.style.display='none';
  document.getElementById('profileModal').classList.add('show');
}

function closeProfile(){
  document.getElementById('profileModal').classList.remove('show');
}

function setLangProfile(l){
  setLang(l);
  document.getElementById('profileBtnEn').classList.toggle('active',l==='en');
  document.getElementById('profileBtnEs').classList.toggle('active',l==='es');
}

function editName(){
  const cur=document.getElementById('profileName').textContent;
  document.getElementById('profileNameInput').value=cur==='—'?'':cur;
  document.getElementById('profileName').parentElement.style.display='none';
  document.getElementById('profileNameEdit').style.display='block';
  document.getElementById('profileNameInput').focus();
  document.getElementById('profileNameInput').onkeydown=e=>{ if(e.key==='Enter') saveName(); if(e.key==='Escape') cancelEditName(); };
}

function cancelEditName(){
  document.getElementById('profileNameEdit').style.display='none';
  document.getElementById('profileName').parentElement.style.display='flex';
}

async function saveName(){
  const newName=document.getElementById('profileNameInput').value.trim();
  if(!newName){ showToast(t('errName')); return; }
  const uid=window._curUser?.uid;
  if(!uid) return;
  try{
    await window._setDoc(window._docRef(window._db,'users',uid),{name:newName},{merge:true});
    if(window._curUser) window._curUser.displayName = newName;
    if(window._groupMembers){ const me=window._groupMembers.find(m=>m.uid===uid); if(me) me.name=newName; }
    document.getElementById('profileName').textContent=newName;
    cancelEditName();
    if(!userAvatar){
      const circle=document.getElementById('userInitialCircle');
      if(circle){ circle.classList.add('initials'); circle.textContent=newName[0].toUpperCase(); }
    }
    renderMemberGrids();
    if(window._expenses){ renderExpenses(window._expenses); updateBalances(window._expenses); }
    showToast(lang==='es'?'✅ Nombre actualizado':'✅ Name updated');
  }catch(e){ console.error(e); showToast(t('errSave')); }
}
