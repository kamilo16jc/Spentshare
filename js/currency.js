// Currency formatting — per group
// Stored in group doc as `currency: 'USD' | 'COP'` (default USD for legacy groups)

const CURRENCIES = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    nameEs: 'Dólar americano',
    flag: '🇺🇸',
    decimals: 2,
    thousandsSep: ',',
    decimalSep: '.'
  },
  COP: {
    code: 'COP',
    symbol: '$',
    name: 'Colombian Peso',
    nameEs: 'Peso colombiano',
    flag: '🇨🇴',
    decimals: 0,
    thousandsSep: '.',
    decimalSep: ','
  }
};

function getCurrency(code){
  return CURRENCIES[code] || CURRENCIES.USD;
}

// Format a (positive) amount as "$1,500.50" (USD) or "$1.500" (COP)
function fmt(amount, code){
  const c = getCurrency(code || gCur());
  const n = Math.abs(Number(amount) || 0);
  const fixed = n.toFixed(c.decimals);
  const [intPart, decPart] = fixed.split('.');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousandsSep);
  return c.symbol + intFmt + (decPart ? c.decimalSep + decPart : '');
}

// Shortcut: current group's currency code (USD default for legacy)
function gCur(){
  return (typeof currentGroup !== 'undefined' && currentGroup?.currency) || 'USD';
}

// Currency picker modal for legacy groups (no currency field yet)
async function promptGroupCurrency(groupId){
  return new Promise(resolve => {
    document.getElementById('currencyPickerUsd').onclick = () => saveGroupCurrency(groupId, 'USD', resolve);
    document.getElementById('currencyPickerCop').onclick = () => saveGroupCurrency(groupId, 'COP', resolve);
    openModal('currencyPickerModal');
  });
}

async function saveGroupCurrency(groupId, code, resolve){
  try{
    await window._setDoc(
      window._docRef(window._db,'groups',groupId),
      { currency: code },
      { merge: true }
    );
    if(currentGroup && currentGroup.id === groupId) currentGroup.currency = code;
    const g = userGroups.find(x => x.id === groupId);
    if(g) g.currency = code;
    closeModal('currencyPickerModal');
    showToast((lang==='es'?'💱 Moneda: ':'💱 Currency: ') + getCurrency(code).flag + ' ' + code);
    resolve(code);
  }catch(e){
    console.error('saveGroupCurrency', e);
    showToast(lang==='es'?'❌ Error guardando moneda':'❌ Error saving currency');
    resolve('USD');
  }
}

// Currency selector used inside the Create Group modal
let _newGroupCurrency = 'USD';
function selectNewGroupCurrency(code){
  _newGroupCurrency = code;
  document.querySelectorAll('.currency-pick-btn').forEach(b => b.classList.toggle('selected', b.dataset.cur === code));
}
function resetNewGroupCurrency(){
  _newGroupCurrency = 'USD';
  document.querySelectorAll('.currency-pick-btn').forEach(b => b.classList.toggle('selected', b.dataset.cur === 'USD'));
}
function getNewGroupCurrency(){ return _newGroupCurrency; }
