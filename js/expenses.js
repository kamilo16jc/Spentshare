// Expense subscription, rendering, add/delete, category auto-detect & form helpers
let expUnsub=null;

function subscribeExpenses(){
  if(expUnsub){expUnsub();expUnsub=null;}
  if(!currentGroup)return;
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

function renderExpenses(expenses){
  const list=document.getElementById('expensesList');
  if(!expenses||expenses.length===0){
    list.innerHTML=`<div class="empty-state"><div class="empty-icon">💸</div><p>${lang==='es'?'No hay gastos aún':'No expenses yet'}</p><small style="font-size:12px;margin-top:4px;display:block">${lang==='es'?'Toca + para agregar el primero':'Tap + to add the first one'}</small></div>`;return;
  }
  const members=window._groupMembers||[];
  list.innerHTML=expenses.slice(0,10).map(e=>{
    const locale=lang==='es'?'es-MX':'en-US';
    const date=e.createdAt?.toDate?e.createdAt.toDate().toLocaleDateString(locale,{day:'numeric',month:'short'}):t('today');
    const emoji=catEmojis[e.category]||'📦';
    const isSettle=e.type==='settle';
    const n=members.length||1;
    const splitLabel=e.split==='all'?(lang==='es'?`÷ ${n} personas`:`÷ ${n} people`):e.split==='two'?(lang==='es'?'÷ 2 personas':'÷ 2 people'):e.split==='full'?(lang==='es'?'💸 Devolver todo':'💸 Full reimburse'):t('solo');
    const paidByName=members.find(m=>m.uid===e.paidByUid)?.name||e.paidBy||'?';
    return `<div class="expense-item" onclick="deleteExpensePrompt('${e.id}')">
      <div class="expense-emoji">${isSettle?'🤝':emoji}</div>
      <div class="expense-info">
        <div class="expense-desc">${e.description}</div>
        <div class="expense-meta">
          <span class="expense-who">${(paidByName).split(' ')[0]}</span>
          <span>${date}</span>
          ${!isSettle?`<span>${splitLabel}</span>`:''}
        </div>
      </div>
      <div>
        <div class="expense-amount">$${parseFloat(e.amount).toFixed(2)}</div>
        ${isSettle?`<div class="expense-split green">${t('paidLabel')} ✓</div>`:
          `<div class="expense-split">${e.split==='all'?'$'+(e.amount/n).toFixed(2)+t('perPerson'):e.split==='two'?'$'+(e.amount/2).toFixed(2)+t('perPerson'):e.split==='full'?'$'+parseFloat(e.amount).toFixed(2)+t('perPerson'):t('solo')}</div>`}
      </div></div>`;
  }).join('');
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
  try{
    await window._addDoc(window._col(window._db,`groups/${currentGroup.id}/expenses`),{
      amount,description:desc,category:selectedCat,
      paidBy:paidByMember?.name||'?',paidByUid:selectedPaidBy,
      split:selectedSplit,
      splitWith:(selectedSplit==='two'||selectedSplit==='full')?(members.find(m=>m.uid===selectedWithWhom)?.name||null):null,
      splitWithUid:(selectedSplit==='two'||selectedSplit==='full')?selectedWithWhom:null,
      createdByUid:window._curUser?.uid,createdAt:window._srvTs(),type:'expense'
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

function autoDetectCategory(text){
  if(!text || text.length < 2) return;
  const lower = text.toLowerCase().trim();
  const words = lower.split(/[\s,.-]+/);

  for(const [cat, keywords] of Object.entries(categoryKeywords)){
    const match = keywords.some(kw => {
      const kwWords = kw.split(' ');
      if(kwWords.length === 1){
        return words.some(w => w === kw || w.startsWith(kw) && kw.length >= 4);
      } else {
        return lower.includes(kw);
      }
    });
    if(match){
      const btn = document.querySelector(`.cat-pill[data-cat="${cat}"]`);
      if(btn && selectedCat !== cat){
        document.querySelectorAll('.cat-pill').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedCat = cat;
        btn.style.transform = 'scale(1.15)';
        setTimeout(()=>btn.style.transform = '', 300);
      }
      return;
    }
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
      <div style="font-size:22px">${getAvatar(m.name,m.uid)}</div>
      <div style="font-size:11px;font-weight:700;margin-top:4px">${(m.name||'?').split(' ')[0]}</div>
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
  selectedCat='food';
  selectedSplit='all';
  selectedWithWhom=null;
  document.querySelectorAll('.cat-pill').forEach(b=>b.classList.remove('selected'));
  const foodBtn=document.querySelector('.cat-pill[data-cat="food"]');
  if(foodBtn) foodBtn.classList.add('selected');
  document.querySelectorAll('.split-btn').forEach(b=>b.classList.remove('selected'));
  const allBtn=document.querySelector('.split-btn[data-split="all"]');
  if(allBtn) allBtn.classList.add('selected');
  const withWhomGroup=document.getElementById('withWhomGroup');
  if(withWhomGroup) withWhomGroup.style.display='none';
}
