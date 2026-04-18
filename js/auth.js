// Authentication — login, register, Google, logout
window._afterAuthCallback = async function(){
  document.getElementById('authScreen').classList.add('hide');
  setTimeout(async()=>{
    document.getElementById('authScreen').style.display='none';
    await loadUserGroups();
    showGroupScreen();
  },500);
};

function switchTab(tab){
  document.getElementById('tabLogin').classList.toggle('active',tab==='login');
  document.getElementById('tabReg').classList.toggle('active',tab==='register');
  document.getElementById('loginForm').style.display=tab==='login'?'block':'none';
  document.getElementById('registerForm').style.display=tab==='register'?'block':'none';
}

async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPassword').value;
  if(!email.includes('@')){showToast(t('errEmail'));return;}
  if(pass.length<6){showToast(t('errPassword'));return;}
  const btn=document.getElementById('loginBtn');
  btn.disabled=true;btn.textContent=t('loading');
  try{
    await window._doSignIn(email,pass);
    document.getElementById('authSuccess').classList.add('show');
    document.getElementById('authSuccessText').textContent=lang==='es'?'¡Bienvenido!':'Welcome!';
  }catch(e){
    showToast('❌ '+(e.code==='auth/invalid-credential'?'Invalid email or password':e.message));
    document.getElementById('authCard').classList.add('shake');
    setTimeout(()=>document.getElementById('authCard').classList.remove('shake'),500);
  }
  btn.disabled=false;btn.textContent=t('loginBtn');
}

async function doRegister(){
  const name=document.getElementById('regName').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const pass=document.getElementById('regPassword').value;
  if(!name){showToast(t('errName'));return;}
  if(!email.includes('@')){showToast(t('errEmail'));return;}
  if(pass.length<8){showToast(t('errPassword'));return;}
  const btn=document.getElementById('registerBtn');
  btn.disabled=true;btn.textContent=t('loading');
  try{
    await window._doSignUp(email,pass,name);
    document.getElementById('authSuccess').classList.add('show');
    document.getElementById('authSuccessText').textContent=`Welcome, ${name}! 🎉`;
  }catch(e){
    showToast('❌ '+(e.code==='auth/email-already-in-use'?'Email already in use':e.message));
    document.getElementById('authCard').classList.add('shake');
    setTimeout(()=>document.getElementById('authCard').classList.remove('shake'),500);
  }
  btn.disabled=false;btn.textContent=t('registerBtn');
}

async function googleAuth(){
  try{ await window._doGoogle(); }
  catch(e){ showToast('❌ '+e.message); }
}

async function logoutUser(){
  if(groupUnsub){groupUnsub();groupUnsub=null;}
  currentGroup=null;window._expenses=null;window._groupMembers=null;userGroups=[];
  await window._doSignOut();
  ['dashboard','groupScreen'].forEach(id=>{
    const el=document.getElementById(id);
    el.classList.remove('show');el.style.display='none';
  });
  closeModal('addModal');closeModal('settleModal');closeModal('statsModal');
  closeModal('debtModal');closeModal('membersModal');closeModal('createGroupModal');
  document.getElementById('authSuccess').classList.remove('show');
  document.getElementById('loginEmail').value='';
  document.getElementById('loginPassword').value='';
  switchTab('login');
  const auth=document.getElementById('authScreen');
  auth.style.display='flex';auth.classList.remove('hide');
  setTimeout(()=>auth.classList.add('show'),50);
}
