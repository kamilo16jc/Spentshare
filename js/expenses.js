// Expense subscription, rendering, add/delete, category auto-detect & form helpers
let expUnsub=null;

function subscribeExpenses(){
  if(expUnsub){expUnsub();expUnsub=null;}
  if(!currentGroup)return;
  // Reset the view for the new group — otherwise the previous group's
  // expenses and balances stay on screen until the first snapshot arrives
  showAllExpenses=false;
  const seeAllBtn=document.getElementById('t-seeAll');
  if(seeAllBtn) seeAllBtn.textContent=t('seeAll');
  document.getElementById('loadingSkeletons').style.display='block';
  document.getElementById('expensesList').innerHTML='';
  document.getElementById('debtSummary').innerHTML='';
  document.getElementById('balanceMembers').innerHTML='';
  document.getElementById('totalMonth').textContent=fmt(0);
  document.getElementById('syncLabel').textContent=t('syncLoad');
  const q=window._query(window._col(window._db,`groups/${currentGroup.id}/expenses`),window._orderBy('createdAt','desc'));
  expUnsub=window._onSnap(q,snap=>{
    document.getElementById('syncDot').classList.remove('offline');
    document.getElementById('syncLabel').textContent=t('syncOk');
    const expenses=snap.docs.map(d=>({id:d.id,...d.data()}));
    window._expenses=expenses;
    renderExpenses(expenses);updateBalances(expenses);
    document.getElementById('loadingSkeletons').style.display='none';
  },()=>{
    document.getElementById('syncDot').classList.add('offline');
    document.getElementById('syncLabel').textContent=t('syncOff');
    document.getElementById('loadingSkeletons').style.display='none';
  });
  groupUnsub=expUnsub;
}

// ── RECEIPT SCAN (photo → total + merchant + category + logo, via Claude vision) ──
function downscaleImage(file, maxSide, quality){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      const scale=Math.min(1, maxSide/Math.max(w,h));
      w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      resolve(c.toDataURL('image/jpeg',quality).split(',')[1]);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src=url;
  });
}

async function handleReceiptScan(ev){
  const file=ev.target.files&&ev.target.files[0];
  ev.target.value=''; // allow re-picking the same file
  if(!file) return;
  if(!file.type||!file.type.startsWith('image/')){ showToast(lang==='es'?'Elegí una imagen':'Pick an image'); return; }
  const btn=document.getElementById('scanReceiptBtn');
  const label=document.getElementById('scanReceiptLabel');
  const original=label?label.textContent:'';
  if(btn) btn.classList.add('loading');
  if(label) label.textContent=t('scanReading');
  try{
    const base64=await downscaleImage(file,1600,0.72);
    const res=await window._callFn('scanReceipt',{ imageBase64:base64, mediaType:'image/jpeg' });
    const d=(res&&res.data)?res.data:res;
    if(!d||!d.found){
      showToast(t('scanFail'));
    }else{
      if(d.amount>0) document.getElementById('inputAmount').value=d.amount;
      const descEl=document.getElementById('inputDesc');
      if(d.merchant){ descEl.value=d.merchant; if(typeof autoDetectCategory==='function') autoDetectCategory(d.merchant); }
      if(d.category) selectedCat=d.category;
      // stash so the saved expense shows the logo instantly (no second AI call)
      window.pendingReceipt={ logoDomain:d.domain||'', logoEmoji:d.emoji||'', merchant:d.merchant||'', category:d.category||'other' };
      showToast(t('scanDone'));
    }
  }catch(e){
    console.error('scanReceipt error',e);
    showToast(lang==='es'?'Error al leer el recibo':'Error reading the receipt');
  }finally{
    if(btn) btn.classList.remove('loading');
    if(label) label.textContent=original||t('scanReceipt');
  }
}

// The expense tile: real store logo (from Claude's detected domain) on top of an
// emoji/monogram fallback. If the logo image fails to load, it removes itself and
// the fallback underneath shows through.
function expenseGlyph(e, mono){
  const glyph = e.logoEmoji ? esc(e.logoEmoji) : esc(mono);
  if(e.logoDomain){
    // Free brand-icon service (no API key). 404s on unknown domains -> the img
    // removes itself and the emoji/monogram underneath shows through.
    const src='https://icons.duckduckgo.com/ip3/'+encodeURIComponent(e.logoDomain)+'.ico';
    return `<img class="exp-logo" src="${src}" alt="" loading="lazy" onerror="this.remove()"><span class="exp-glyph">${glyph}</span>`;
  }
  return `<span class="exp-glyph">${glyph}</span>`;
}

function renderExpenses(expenses){
  const list=document.getElementById('expensesList');
  if(!expenses||expenses.length===0){
    list.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l1 18-4-2-3 2-3-2-4 2z"/><path d="M9 8h6M9 12h6"/></svg></div><p>${lang==='es'?'No hay gastos aún':'No expenses yet'}</p><small style="font-size:12px;margin-top:4px;display:block">${lang==='es'?'Agrega el primero desde Acciones rápidas':'Add the first one from Quick actions'}</small></div>`;return;
  }
  const members=window._groupMembers||[];
  const visible=showAllExpenses?expenses:expenses.slice(0,10);
  list.innerHTML=visible.map(e=>{
    const locale=lang==='es'?'es-MX':'en-US';
    const date=e.createdAt?.toDate?e.createdAt.toDate().toLocaleDateString(locale,{day:'numeric',month:'short'}):t('today');
    // Monogram fallback; Claude enriches the expense with a store logo / emoji.
    const mono=((e.description||'?').trim().charAt(0)||'?').toUpperCase();
    const isSettle=e.type==='settle';
    const n=members.length||1;
    const splitLabel=e.split==='all'?(lang==='es'?`÷ ${n} personas`:`÷ ${n} people`):e.split==='two'?(lang==='es'?'÷ 2 personas':'÷ 2 people'):e.split==='full'?(lang==='es'?'Devolver todo':'Full reimburse'):t('solo');
    const paidByName=members.find(m=>m.uid===e.paidByUid)?.name||e.paidBy||'?';
    return `<div class="expense-item" onclick="deleteExpensePrompt('${e.id}')">
      <div class="expense-emoji${isSettle?' is-settle':''}">${expenseGlyph(e,mono)}</div>
      <div class="expense-info">
        <div class="expense-desc">${esc(e.description)}</div>
        <div class="expense-meta">
          <span class="expense-who">${esc((paidByName).split(' ')[0])}</span>
          <span>${date}</span>
          ${!isSettle?`<span>${splitLabel}</span>`:''}
        </div>
      </div>
      <div>
        <div class="expense-amount">${fmt(e.amount)}</div>
        ${isSettle?`<div class="expense-split green">${t('paidLabel')} ✓</div>`:
          `<div class="expense-split">${e.split==='all'?fmt(e.amount/n)+t('perPerson'):e.split==='two'?fmt(e.amount/2)+t('perPerson'):e.split==='full'?fmt(e.amount)+t('perPerson'):t('solo')}</div>`}
      </div></div>`;
  }).join('');
}

function toggleSeeAll(){
  showAllExpenses=!showAllExpenses;
  const btn=document.getElementById('t-seeAll');
  if(btn) btn.textContent=t(showAllExpenses?'seeLess':'seeAll');
  renderExpenses(window._expenses||[]);
}

async function addExpense(){
  const amount=parseFloat(document.getElementById('inputAmount').value);
  const desc=document.getElementById('inputDesc').value.trim();
  if(!amount||amount<=0){showToast(t('errAmount'));return;}
  if(!desc){showToast(t('errDesc'));return;}
  if(!selectedPaidBy){showToast(t('errPaidBy'));return;}
  if((selectedSplit==='two'||selectedSplit==='full')&&!selectedWithWhom){showToast(t('errWithWhom'));return;}
  const btn=document.getElementById('submitBtn');
  btn.disabled=true;btn.textContent=t('saving');
  const members=window._groupMembers||[];
  const paidByMember=members.find(m=>m.uid===selectedPaidBy);
  // If a receipt was scanned, carry its logo/merchant so the expense shows the
  // logo instantly and enrichExpense skips the redundant AI call.
  const receipt=(window.pendingReceipt&&desc&&window.pendingReceipt.merchant&&desc===window.pendingReceipt.merchant)?window.pendingReceipt:null;
  const extra=receipt?{ logoDomain:receipt.logoDomain||'', logoEmoji:receipt.logoEmoji||'', merchant:receipt.merchant||'', aiEnriched:true }:{};
  try{
    await window._addDoc(window._col(window._db,`groups/${currentGroup.id}/expenses`),{
      amount,description:desc,category:selectedCat,
      paidBy:paidByMember?.name||'?',paidByUid:selectedPaidBy,
      split:selectedSplit,
      splitWith:(selectedSplit==='two'||selectedSplit==='full')?(members.find(m=>m.uid===selectedWithWhom)?.name||null):null,
      splitWithUid:(selectedSplit==='two'||selectedSplit==='full')?selectedWithWhom:null,
      createdByUid:window._curUser?.uid,createdAt:window._srvTs(),type:'expense',
      ...extra
    });
    closeModal('addModal');showToast(t('toastAdded'));resetForm();
  }catch(e){console.error('addExpense error:',e);showToast(t('errSave'));}
  btn.disabled=false;btn.textContent=t('addBtn');
}

async function deleteExpensePrompt(id){
  if(!confirm(t('confirmDelete')))return;
  try{await window._delDoc(window._docRef(window._db,`groups/${currentGroup.id}/expenses`,id));showToast(t('toastDeleted'));}
  catch(e){showToast(t('errDelete'));}
}

// ── AUTO CATEGORY DETECTION ──
const categoryKeywords = {
  food: [
    'grocery','groceries','supermarket','walmart','costco','aldi','kroger','whole foods',
    'trader joe','restaurant','dinner','lunch','breakfast','pizza','burger','taco','sushi',
    'food','cafe','coffee','starbucks','mcdonald','subway','chipotle','donut','bakery',
    'ice cream','snack','meal','domino','kfc','wendy','popeyes','chick','dairy','deli',
    'mercado','supermercado','tienda','abarrotes','cena','comida','almuerzo','desayuno',
    'pollo','carne','verdura','fruta','pan','leche','huevo','arroz','restaurante',
    'cocina','cafeteria','hamburgesa','torta','antojito','lonche','chedraui','soriana',
    'oxxo','seven eleven','sam club','heb','wingstop','little caesars','applebee'
  ],
  transport: [
    'uber','lyft','taxi','gasoline','fuel','parking','bus','train','metro','flight',
    'airline','airport','toll','transit','transport','travel ticket','grab','bolt','didi',
    'gasolina','combustible','camion','autobus','tren','vuelo','aerolinea','aeropuerto',
    'peaje','transporte','estacionamiento','caseta','pemex','shell','bp','exxon',
    'amtrak','greyhound','flixbus','inegi'
  ],
  utilities: [
    'electric','electricity','water bill','internet','wifi','phone bill','mobile bill',
    'cable tv','subscription','rent','mortgage','insurance','utility','att','verizon',
    'comcast','tmobile','spectrum','pg&e','con edison',
    'luz','electricidad','agua','internet','wifi','telefono','celular','cable','renta',
    'seguro','predial','recibo','servicio','telmex','telcel','izzi','totalplay',
    'megacable','factura','cfe','gas natural','biogas','scdf'
  ],
  health: [
    'doctor','hospital','pharmacy','medicine','pill','pills','tablet','capsule','drug',
    'health','medical','dental','dentist','vision','gym','fitness','workout','vitamin',
    'supplement','clinic','urgent care','therapy','prescription','vaccine','injection',
    'walgreens','cvs','rite aid','bandage','first aid','blood test','xray','mri','serum',
    'skincare','moisturizer','sunscreen','face wash','toner','eye drops','inhaler',
    'doctor','hospital','farmacia','medicina','medicamento','pastilla','capsula',
    'salud','medico','dental','dentista','gimnasio','vitamina','clinica','terapia',
    'receta','vacuna','inyeccion','farmacias guadalajara','similares','suero','venda',
    'curacion','consulta','laboratorio','analisis','rayos','ultrasonido','crema','gel'
  ],
  entertainment: [
    'movie','cinema','theater','concert','show','sport','bowling','golf','museum',
    'netflix','spotify','hulu','disney','amazon prime','youtube','twitch','steam',
    'xbox','playstation','nintendo','ticket','event','festival','escape room','arcade',
    'pelicula','cine','teatro','concierto','partido','juego','museo','boliche',
    'entretenimiento','evento','festival','videojuego','streaming','funko'
  ],
  drinks: [
    'beer','wine','alcohol','liquor','cocktail','nightclub','brewery','winery',
    'tequila','whiskey','vodka','champagne','happy hour','six pack',
    'bar','cantina','cerveza','vino','licor','antro','discoteca',
    'copa','chela','caguama','pulque','mezcal','michelada','destilado','brandy','gin'
  ],
  home: [
    'home depot','lowes','ikea','furniture','repair','cleaning','garden','hardware',
    'decoration','paint','plumber','electrician','maintenance','tools','renovate','lawn',
    'rent house','lease','hoa','condo fee',
    'ferreteria','mueble','reparacion','limpieza','jardin','decoracion','pintura',
    'plomero','mantenimiento','herramienta','arreglo','remodelacion','maceta',
    'impermeabilizante','cortina','alfombra','colchon','sofa','mesa','silla'
  ],
  education: [
    'school','university','college','course','book','tuition','class','lesson',
    'education','training','workshop','certificate','udemy','coursera','textbook',
    'pencil','notebook','backpack school',
    'escuela','universidad','colegio','curso','libro','colegiatura','clase',
    'educacion','capacitacion','taller','certificado','cuaderno','lapiz','utiles',
    'papeleria','libreria','kinder','preescolar','primaria','secundaria','preparatoria'
  ],
  travel: [
    'hotel','airbnb','hostel','vacation','cruise','resort','booking','expedia',
    'kayak','luggage','passport','visa','holiday','suitcase','rental car','airfare','tour',
    'hospedaje','maleta','pasaporte','playa','excursion','paquete turistico',
    'renta carro','boleto avion','viaje vacaciones'
  ],
  shopping: [
    'amazon','target','ebay','etsy','shein','zara','hm','clothing','shirt','shoes',
    'pants','dress','jacket','bag','purse','mall','online order','delivery package',
    'liverpool','palacio hierro','ropa','zapatos','pantalon','vestido','chamarra',
    'bolsa','plaza','pedido','mercadolibre','fashion','outlet','boutique','mango',
    'forever 21','pull bear','bershka','gap','nike','adidas','vans','converse'
  ],
  pets: [
    'vet','veterinary','veterinarian','pet food','dog food','cat food','leash','collar',
    'pet medicine','kennel','boarding','grooming pet','petco','petsmart','aquarium',
    'veterinario','veterinaria','comida perro','comida gato','correa','vacuna mascota',
    'guarderia mascota','pension perro','acuario','arena gato','hueso perro'
  ],
  personalcare: [
    'haircut','hair salon','barber','spa','massage','nails','manicure','pedicure',
    'wax','facial','beauty','makeup','cosmetics','perfume','shampoo','conditioner',
    'eyebrows','eyelash','tanning','botox',
    'peluqueria','corte pelo','salon belleza','barberia','masaje','unas','cera depilacion',
    'facial belleza','maquillaje','cosmeticos','perfumeria','tinte cabello','depilacion',
    'pestanas','cejas','botox','relleno'
  ],
  kids: [
    'baby','diaper','formula milk','toy','stroller','crib','daycare','nursery',
    'children clothes','infant','toddler','uniform school','lunch box','birthday party kids',
    'bebe','pañal','formula','juguete','carriola','cuna','guarderia',
    'kinder','utiles escolares','uniforme','mochila','lonchera','ropa bebe','leche bebe'
  ],
  gifts: [
    'gift','present','birthday gift','anniversary gift','christmas gift','surprise gift',
    'wrapping','flowers','bouquet','chocolate gift','cake','wedding gift',
    'baby shower','graduation gift','valentine gift',
    'regalo','presente','regalo cumpleanos','regalo navidad','sorpresa','flores ramo',
    'chocolate regalo','pastel cumpleanos','regalo boda','regalo graduacion',
    'dia madres','dia padres','quinceanera'
  ]
};

// The category picker is gone: as the user types the description, we silently
// set the category and show a live monogram preview. Later, Claude reads the
// same description to fetch/generate the store logo that drops into this tile.
function autoDetectCategory(text){
  const tile = document.getElementById('autoIconTile');
  if(tile){
    const ch = (text||'').trim().charAt(0);
    tile.firstChild ? tile.firstChild.textContent = (ch ? ch.toUpperCase() : '·') : null;
    tile.classList.toggle('filled', !!ch);
  }
  if(!text || text.length < 2) return;
  const lower = text.toLowerCase().trim();
  const words = lower.split(/[\s,.-]+/);

  for(const [cat, keywords] of Object.entries(categoryKeywords)){
    const match = keywords.some(kw => {
      const kwWords = kw.split(' ');
      if(kwWords.length === 1){
        return words.some(w => w === kw || (w.startsWith(kw) && kw.length >= 4));
      } else {
        return lower.includes(kw);
      }
    });
    if(match){ selectedCat = cat; return; }
  }
}

function selectPaidBy(el){
  document.querySelectorAll('.paid-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  selectedPaidBy=el.dataset.uid;
  if(selectedSplit==='two'){
    const others=(window._groupMembers||[]).filter(m=>m.uid!==selectedPaidBy);
    if(others.length===1){
      selectedWithWhom=others[0].uid;
      setTimeout(()=>{
        document.querySelectorAll('#withWhomGrid .paid-btn').forEach(b=>b.classList.remove('selected'));
        const btn=document.querySelector('#withWhomGrid .paid-btn[data-uid="'+others[0].uid+'"]');
        if(btn) btn.classList.add('selected');
      },50);
    }
  }
}

function selectSplit(el){
  document.querySelectorAll('.split-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  selectedSplit=el.dataset.split;
  const g=document.getElementById('withWhomGroup');
  if(selectedSplit==='two'||selectedSplit==='full'){
    const label=document.querySelector('[data-i18n="withWhomLabel"]');
    if(label) label.textContent=selectedSplit==='full'?(lang==='es'?'¿Quién te debe devolver el total?':'Who owes you back 100%?'):(lang==='es'?'¿Con quién?':'Split with who?');
    g.style.display='block';
    updateWithWhomGrid();
    const others=(window._groupMembers||[]).filter(m=>m.uid!==selectedPaidBy);
    if(others.length===1){
      selectedWithWhom=others[0].uid;
      setTimeout(()=>{
        const btn=document.querySelector('#withWhomGrid .paid-btn[data-uid="'+others[0].uid+'"]');
        if(btn) btn.classList.add('selected');
      },50);
    }
  } else { g.style.display='none'; selectedWithWhom=null; }
}

function updateWithWhomGrid(){
  const others=(window._groupMembers||[]).filter(m=>m.uid!==selectedPaidBy);
  document.getElementById('withWhomGrid').innerHTML=others.map(m=>`
    <button class="paid-btn${selectedWithWhom===m.uid?' selected':''}" data-uid="${m.uid}" onclick="selectWithWhom(this)">
      <div style="font-size:22px">${renderAvatarEl(m.uid,m.name,22)}</div>
      <div style="font-size:11px;font-weight:700;margin-top:4px">${esc((m.name||'?').split(' ')[0])}</div>
    </button>`).join('');
}

function selectWithWhom(el){
  document.querySelectorAll('#withWhomGrid .paid-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  selectedWithWhom=el.dataset.uid;
}

function selectCat(el){
  document.querySelectorAll('.cat-pill').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  selectedCat = el.dataset.cat;
}

function resetForm(){
  document.getElementById('inputAmount').value='';
  document.getElementById('inputDesc').value='';
  selectedCat='other';
  selectedSplit='all';
  selectedWithWhom=null;
  window.pendingReceipt=null;
  const tile=document.getElementById('autoIconTile');
  if(tile){ if(tile.firstChild) tile.firstChild.textContent='·'; tile.classList.remove('filled'); }
  document.querySelectorAll('.split-btn').forEach(b=>b.classList.remove('selected'));
  const allBtn=document.querySelector('.split-btn[data-split="all"]');
  if(allBtn) allBtn.classList.add('selected');
  const withWhomGroup=document.getElementById('withWhomGroup');
  if(withWhomGroup) withWhomGroup.style.display='none';
}
