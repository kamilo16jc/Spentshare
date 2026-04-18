// Avatar rendering, upload, and cache
let userAvatar = null; // emoji string or base64 image
const avatarCache = {}; // in-memory cache for all group members

function getAvatar(name, uid){
  if(uid){ const saved=localStorage.getItem('avatar_'+uid); if(saved) return saved; }
  const av=['👤','👩','👨','🧑','👦','👧'];
  return av[(name||'?').charCodeAt(0)%av.length];
}

async function loadAvatar(){
  const uid = window._curUser?.uid;
  if(!uid) return;
  // First apply from localStorage instantly (fast)
  const cached = localStorage.getItem('avatar_'+uid);
  if(cached){ userAvatar = cached; avatarCache[uid] = cached; applyAvatarEverywhere(cached); }
  // Then sync from Firestore (source of truth)
  try{
    const doc = await window._getDoc(window._docRef(window._db,'users',uid));
    if(doc.exists()){
      const data = doc.data();
      if(data.avatar){
        userAvatar = data.avatar;
        localStorage.setItem('avatar_'+uid, data.avatar);
        applyAvatarEverywhere(data.avatar);
      }
    }
  }catch(e){ console.log('loadAvatar error',e); }
}

async function saveAvatar(val){
  const uid = window._curUser?.uid;
  if(!uid) return;
  userAvatar = val;
  avatarCache[uid] = val;
  localStorage.setItem('avatar_'+uid, val);
  applyAvatarEverywhere(val);
  renderMemberGrids();
  showToast(lang==='es'?'✅ Avatar guardado':'✅ Avatar saved');
  try{
    await window._setDoc(window._docRef(window._db,'users',uid),{avatar:val},{merge:true});
  }catch(e){ console.log('saveAvatar error',e); }
}

function applyAvatarEverywhere(val){
  const isEmoji = val && !val.startsWith('data:');
  const circle = document.getElementById('userInitialCircle');
  if(circle){
    if(isEmoji){ circle.classList.remove('initials'); circle.textContent=val; circle.style.background='transparent'; circle.style.fontSize='22px'; }
    else if(val){ circle.classList.remove('initials'); circle.innerHTML=`<img src="${val}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }
    else{ circle.classList.add('initials'); circle.textContent=(window._curUser?.displayName||window._curUser?.email||'?')[0].toUpperCase(); circle.style.background=''; }
  }
  const big = document.getElementById('profileAvatarBig');
  if(big){
    if(isEmoji){ big.classList.remove('initials'); big.textContent=val; big.style.background='transparent'; big.style.fontSize='42px'; }
    else if(val){ big.classList.remove('initials'); big.innerHTML=`<img src="${val}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }
    else{ big.classList.add('initials'); big.textContent=(window._curUser?.displayName||window._curUser?.email||'?')[0].toUpperCase(); big.style.background=''; }
  }
  renderAllAvatars();
}

function renderAllAvatars(){
  if(window._expenses){ renderExpenses(window._expenses); updateBalances(window._expenses); }
}

function getAvatarForMember(uid, name){
  if(uid){
    if(avatarCache[uid]) return avatarCache[uid];
    const cached = localStorage.getItem('avatar_'+uid);
    if(cached){ avatarCache[uid] = cached; return cached; }
  }
  const av=['👤','👩','👨','🧑','👦','👧'];
  return av[(name||'?').charCodeAt(0)%av.length];
}

async function loadGroupMemberAvatars(){
  const members = window._groupMembers||[];
  await Promise.all(members.map(async m => {
    if(!m.uid) return;
    try{
      const doc = await window._getDoc(window._docRef(window._db,'users',m.uid));
      if(doc.exists() && doc.data().avatar){
        const av = doc.data().avatar;
        avatarCache[m.uid] = av;
        localStorage.setItem('avatar_'+m.uid, av);
        if(m.uid === window._curUser?.uid){
          userAvatar = av;
          applyAvatarEverywhere(av);
        }
      }
    }catch(e){}
  }));
  renderMemberGrids();
  if(window._expenses){ renderExpenses(window._expenses); updateBalances(window._expenses); }
}

function renderAvatarEl(uid, name, size=28){
  const val = getAvatarForMember(uid, name);
  const isEmoji = val && !val.startsWith('data:');
  if(isEmoji) return `<span style="font-size:${size}px;line-height:1">${val}</span>`;
  if(val && val.startsWith('data:')) return `<img src="${val}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover">`;
  const initial = (name||'?')[0].toUpperCase();
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,var(--orange),var(--green));display:inline-flex;align-items:center;justify-content:center;font-family:'Nunito',sans-serif;font-size:${Math.round(size*0.45)}px;font-weight:900;color:white;flex-shrink:0">${initial}</span>`;
}

function selectAvatarEmoji(emoji){
  document.querySelectorAll('.avatar-emoji-btn').forEach(b=>b.classList.toggle('selected', b.textContent===emoji));
  saveAvatar(emoji);
}

function handleAvatarUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 500000){ showToast(lang==='es'?'⚠️ Imagen muy grande (max 500KB)':'⚠️ Image too large (max 500KB)'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    saveAvatar(ev.target.result);
    document.querySelectorAll('.avatar-emoji-btn').forEach(b=>b.classList.remove('selected'));
  };
  reader.readAsDataURL(file);
}
