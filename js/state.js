// Global app state — shared across all classic scripts
let lang = 'en';
let currentGroup = null;
let groupUnsub = null;
let userGroups = [];
let selectedCat = 'food';
let selectedPaidBy = null;
let selectedSplit = 'all';
let selectedWithWhom = null;
let settleFrom = null;
let settleTo = null;
let selEmoji_ = '🏠';
let inviteEmails = [];
let newlyCreatedGroupId = null;
let showAllExpenses = false;
const catEmojis = {food:'🛒',transport:'🚗',utilities:'💡',health:'💊',entertainment:'🎬',home:'🏠',education:'📚',other:'📦',travel:'✈️',shopping:'👗',pets:'🐾',drinks:'🍺',personalcare:'💇',kids:'👶',gifts:'🎁'};

// Escape user-provided strings before inserting into innerHTML templates
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const months_en=['January','February','March','April','May','June','July','August','September','October','November','December'];
const months_es=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
