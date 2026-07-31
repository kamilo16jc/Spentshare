// Bootstrap — splash fade, expose functions to window for inline onclick handlers

// Apply the active language to the whole UI on load. Without this, the app
// kept whatever hardcoded default text each element had in index.html (a mix
// of English and Spanish), so e.g. the expense placeholder showed Spanish even
// in English mode. Also restores the user's saved language choice.
try{
  let _saved; try{ _saved=localStorage.getItem('lang'); }catch(e){}
  setLang(_saved==='en'||_saved==='es' ? _saved : lang);
}catch(e){}

setTimeout(()=>{
  document.getElementById('splash').classList.add('hide');
  setTimeout(()=>{
    document.getElementById('splash').style.display='none';
    // If auth already restored the session, don't flash the login screen
    if(!window._curUser) document.getElementById('authScreen').classList.add('show');
  },700);
},1600);

// Expose handlers used from inline onclick="" attributes
Object.assign(window,{
  // i18n / ui
  setLang, t, openModal, closeModal, closeOnOverlay, showToast, setTab, initSwipeModals,
  // currency
  fmt, gCur, getCurrency, selectNewGroupCurrency, getNewGroupCurrency,
  resetNewGroupCurrency, promptGroupCurrency,
  // auth
  switchTab, doLogin, doRegister, googleAuth, logoutUser,
  // groups
  loadUserGroups, showGroupScreen, renderGroupList, deleteGroup, selectGroup,
  goToGroupPicker, openCreateGroupModal, selEmoji, addChip, removeChip,
  createGroup, goToNewGroup, joinGroup, copyInviteCode, finalizeDashboard,
  // members
  renderMemberGrids, openMembersModal, sendInviteEmail,
  // avatar
  loadAvatar, saveAvatar, applyAvatarEverywhere, getAvatarForMember,
  loadGroupMemberAvatars, renderAvatarEl, selectAvatarEmoji, handleAvatarUpload,
  // expenses
  subscribeExpenses, renderExpenses, addExpense, deleteExpensePrompt, toggleSeeAll,
  autoDetectCategory, selectPaidBy, selectSplit, updateWithWhomGrid,
  selectWithWhom, selectCat, resetForm,
  // balances / settle
  calcBalances, updateBalances, renderDebtSummary, renderDebtDetail,
  openDebtDetail, quickSettle, addSettle, selectSettleFrom, selectSettleTo,
  openSettleModal,
  // stats
  openStatsModal,
  // profile
  openProfile, closeProfile, setLangProfile, editName, cancelEditName, saveName,
});
