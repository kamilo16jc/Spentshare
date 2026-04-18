// Bootstrap — splash fade, expose functions to window for inline onclick handlers
setTimeout(()=>{
  document.getElementById('splash').classList.add('hide');
  setTimeout(()=>{
    document.getElementById('splash').style.display='none';
    document.getElementById('authScreen').classList.add('show');
  },700);
},4800);

// Expose handlers used from inline onclick="" attributes
Object.assign(window,{
  // i18n / ui
  setLang, t, openModal, closeModal, closeOnOverlay, showToast, setTab, initSwipeModals,
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
  subscribeExpenses, renderExpenses, addExpense, deleteExpensePrompt,
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
