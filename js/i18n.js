// Translations + language helpers
const TX = {
  en:{
    tabLogin:'Log in',tabRegister:'Sign up',
    loginTitle:'Welcome back 👋',loginSub:'Sign in to your account',
    registerTitle:'Create account 🎉',registerSub:'Free forever, no credit card needed',
    googleBtn:'Continue with Google',orLabel:'or',
    nameLabel:'Full name',emailLabel:'Email',passwordLabel:'Password',
    loginBtn:'Sign in →',registerBtn:'Create account →',logoutBtn:'Log out',
    myGroupsLabel:'MY GROUPS',newGroupBtn:'Create new group',
    joinTitle:'Join with an invite code',joinBtn:'Join',
    createGroupTitle:'✨ New group',groupNameLabel:'Group name',
    groupEmojiLabel:'Icon',currencyLabel:'Currency',inviteEmailsLabel:'Invite members (optional)',
    currencyPickerTitle:'💱 Choose group currency',
    currencyPickerSub:"This group doesn't have a currency yet. Pick one — all amounts will be shown in this currency.",
    createGroupBtn:'Create group →',shareCodeLabel:'Share this code',
    codeValid:'Valid for 30 days',copyBtn:'📋 Copy',openGroupBtn:'Open group →',
    addModalTitle:'💸 New expense',settleModalTitle:'🤝 Settle debt',
    debtModalTitle:'💰 Balance detail',membersModalTitle:'👥 Members',
    amountLabel:'Amount',descLabel:'Description',catLabel:'Category',
    paidByLabel:'Who paid?',splitLabel:'Split between',withWhomLabel:'Split with who?',
    splitAll:'Everyone',splitTwo:'Two people',splitFull:'Pay me back',splitSolo:'Just me',
    addBtn:'Add expense ✓',savePayBtn:'Record payment ✓',
    settleFromLabel:'Who pays?',settleToLabel:'Who receives?',
    inviteMoreLabel:'Invite someone',sendInviteBtn:'Send',groupCodeLabel:'Invite code',
    statsTitle:'Statistics',statsTotal:'Monthly total',statsByMember:'By member',
    statsByCat:'By category',statsTop:'Top expenses',
    balanceLabel:'MONTHLY EXPENSES',quickActions:'Quick actions',
    addExpense:'Add expense',settle:'Settle debt',members:'Members',stats:'Statistics',
    whoOwes:'💸 Who owes who',detail:'Detail →',
    recentExpenses:'Recent expenses',seeAll:'See all →',
    nav2:'Stats',nav3:'Members',nav4:'Groups',
    syncOk:'Synced ✓',syncOff:'Offline',syncLoad:'Connecting...',
    allClear:'All settled! 🎉',allClearSub:'No pending debts this month',
    statusOk:' ok',statusOwedTo:' owed to you',statusOwes:' owes',
    paidLabel:'Paid',owesLabel:'Owes',
    loading:'Loading...',saving:'Saving...',today:'Today',perPerson:' each',solo:'Just me',
    settleDesc:(a,b)=>`${a} settled with ${b}`,settlePayDesc:(a,b)=>`${a} paid ${b}`,
    toastSettledZero:'✅ Debt settled!',
    confirmDelete:'Delete this expense?',toastDeleted:'🗑️ Deleted',
    confirmSettle:(a,b,amt)=>`Confirm ${a} paid ${amt} to ${b}?`,
    errSave:'❌ Error saving',errRegister:'❌ Error recording',errDelete:'❌ Error deleting',
    errAmount:'⚠️ Enter a valid amount',errDesc:'⚠️ Add a description',
    errPaidBy:'⚠️ Who paid?',errWithWhom:'⚠️ Select who to split with',
    errFrom:'⚠️ Who pays?',errTo:'⚠️ Who receives?',errDiff:'⚠️ Select different people',
    errEmail:'⚠️ Enter a valid email',errPassword:'⚠️ Password min 8 characters',
    errName:'⚠️ Enter your name',errGroupName:'⚠️ Enter a group name',
    errJoinCode:'⚠️ Enter a code',errCodeNotFound:'❌ Code not found',
    toastGroupCreated:'✅ Group created!',toastJoined:'✅ Joined!',
    toastInviteSent:'✅ Invite sent!',toastCopied:'📋 Copied!',
    toastAdded:'✅ Expense added',toastSettle:'✅ Payment recorded',
    catFood:'Food',catTransport:'Transport',catUtilities:'Utilities',
    catHealth:'Health',catEntertainment:'Entertainment',catHome:'Home',
    catEducation:'Education',catOther:'Other',
    debtByPerson:'By person',debtPending:'Pending debts',
    membersOf:(n)=>`Members of ${n}`,noGroups:'No groups yet. Create one!',languageLabel:'Language',chooseAvatarLabel:'Choose avatar',uploadPhotoLabel:'Upload photo',editNameLabel:'Edit name'
  },
  es:{
    tabLogin:'Entrar',tabRegister:'Registrarse',
    loginTitle:'¡Bienvenido! 👋',loginSub:'Inicia sesión en tu cuenta',
    registerTitle:'Crear cuenta 🎉',registerSub:'Gratis para siempre',
    googleBtn:'Continuar con Google',orLabel:'o',
    nameLabel:'Nombre completo',emailLabel:'Correo',passwordLabel:'Contraseña',
    loginBtn:'Entrar →',registerBtn:'Crear cuenta →',logoutBtn:'Cerrar sesión',
    myGroupsLabel:'MIS GRUPOS',newGroupBtn:'Crear nuevo grupo',
    joinTitle:'Unirse con código de invitación',joinBtn:'Unirse',
    createGroupTitle:'✨ Nuevo grupo',groupNameLabel:'Nombre del grupo',
    groupEmojiLabel:'Ícono',currencyLabel:'Moneda',inviteEmailsLabel:'Invitar miembros (opcional)',
    currencyPickerTitle:'💱 Elige la moneda del grupo',
    currencyPickerSub:'Este grupo aún no tiene moneda. Elige una — todos los montos se mostrarán en esa moneda.',
    createGroupBtn:'Crear grupo →',shareCodeLabel:'Comparte este código',
    codeValid:'Válido por 30 días',copyBtn:'📋 Copiar',openGroupBtn:'Abrir grupo →',
    addModalTitle:'💸 Nuevo gasto',settleModalTitle:'🤝 Liquidar deuda',
    debtModalTitle:'💰 Detalle de balances',membersModalTitle:'👥 Miembros',
    amountLabel:'Monto',descLabel:'Descripción',catLabel:'Categoría',
    paidByLabel:'¿Quién pagó?',splitLabel:'¿Cómo dividir?',withWhomLabel:'¿Con quién?',
    splitAll:'Todos',splitTwo:'Dos personas',splitFull:'Que me devuelvan',splitSolo:'Solo yo',
    addBtn:'Agregar gasto ✓',savePayBtn:'Registrar pago ✓',
    settleFromLabel:'¿Quién paga?',settleToLabel:'¿A quién?',
    inviteMoreLabel:'Invitar a alguien',sendInviteBtn:'Enviar',groupCodeLabel:'Código de invitación',
    statsTitle:'Estadísticas',statsTotal:'Total del mes',statsByMember:'Por miembro',
    statsByCat:'Por categoría',statsTop:'Top gastos',
    balanceLabel:'GASTOS DEL MES',quickActions:'Acciones rápidas',
    addExpense:'Agregar gasto',settle:'Liquidar deuda',members:'Miembros',stats:'Estadísticas',
    whoOwes:'💸 Quién debe a quién',detail:'Detalle →',
    recentExpenses:'Gastos recientes',seeAll:'Ver todos →',
    nav2:'Stats',nav3:'Miembros',nav4:'Grupos',
    syncOk:'Sincronizado ✓',syncOff:'Sin conexión',syncLoad:'Conectando...',
    allClear:'¡Todo al día! 🎉',allClearSub:'No hay deudas pendientes',
    statusOk:' al día',statusOwedTo:' a favor',statusOwes:' debe',
    paidLabel:'Pagó',owesLabel:'Debe',
    loading:'Cargando...',saving:'Guardando...',today:'Hoy',perPerson:' c/u',solo:'Solo',
    settleDesc:(a,b)=>`${a} liquidó deuda con ${b}`,settlePayDesc:(a,b)=>`${a} le pagó a ${b}`,
    toastSettledZero:'✅ Deuda liquidada',
    confirmDelete:'¿Eliminar este gasto?',toastDeleted:'🗑️ Eliminado',
    confirmSettle:(a,b,amt)=>`¿Registrar que ${a} pagó ${amt} a ${b}?`,
    errSave:'❌ Error al guardar',errRegister:'❌ Error al registrar',errDelete:'❌ Error al eliminar',
    errAmount:'⚠️ Ingresa un monto válido',errDesc:'⚠️ Agrega una descripción',
    errPaidBy:'⚠️ ¿Quién pagó?',errWithWhom:'⚠️ Selecciona con quién dividir',
    errFrom:'⚠️ ¿Quién paga?',errTo:'⚠️ ¿A quién?',errDiff:'⚠️ Selecciona personas diferentes',
    errEmail:'⚠️ Ingresa un correo válido',errPassword:'⚠️ Contraseña mínimo 8 caracteres',
    errName:'⚠️ Ingresa tu nombre',errGroupName:'⚠️ Ingresa el nombre del grupo',
    errJoinCode:'⚠️ Ingresa un código',errCodeNotFound:'❌ Código no encontrado',
    toastGroupCreated:'✅ ¡Grupo creado!',toastJoined:'✅ ¡Te uniste!',
    toastInviteSent:'✅ Invitación enviada',toastCopied:'📋 ¡Copiado!',
    toastAdded:'✅ Gasto agregado',toastSettle:'✅ Pago registrado',
    catFood:'Comida',catTransport:'Transporte',catUtilities:'Servicios',
    catHealth:'Salud',catEntertainment:'Ocio',catHome:'Casa',
    catEducation:'Educación',catOther:'Otro',
    debtByPerson:'Por persona',debtPending:'Deudas pendientes',
    membersOf:(n)=>`Miembros de ${n}`,noGroups:'Sin grupos. ¡Crea uno!',languageLabel:'Idioma',chooseAvatarLabel:'Elegir avatar',uploadPhotoLabel:'Subir foto',editNameLabel:'Editar nombre'
  }
};

function t(k,...a){ const v=TX[lang][k]; return typeof v==='function'?v(...a):(v||k); }

function setLang(l){
  lang=l;
  document.getElementById('btnEn').classList.toggle('active',l==='en');
  document.getElementById('btnEs').classList.toggle('active',l==='es');
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.dataset.i18n; const v=TX[l][k];
    if(v!==undefined && typeof v==='string') el.textContent=v;
  });
  updateDashboardLabels();
  if(window._expenses){renderExpenses(window._expenses);updateBalances(window._expenses);}
}

function updateDashboardLabels(){
  const ids={
    't-balanceLabel':'balanceLabel','t-quickActions':'quickActions',
    't-addExpense':'addExpense','t-settle':'settle','t-members':'members','t-stats':'stats',
    't-whoOwes':'whoOwes','t-detail':'detail',
    't-recentExpenses':'recentExpenses','t-seeAll':'seeAll',
    't-nav2':'nav2','t-nav3':'nav3','t-nav4':'nav4',
  };
  Object.entries(ids).forEach(([id,k])=>{const el=document.getElementById(id);if(el)el.textContent=t(k);});
}
