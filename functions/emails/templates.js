// SpentShare — plantillas de correo: recibo de pago y factura de cobro.
//
// Un solo archivo para dos lugares:
//   - Cloud Functions:  const { renderReceipt, renderInvoice } = require('./emails/templates');
//   - Vista previa:     <script src="functions/emails/templates.js"> -> window.SSEmails
//
// Cada render devuelve { subject, preheader, html, text, lang }.
//
// Identidad: la nueva de spentshare-ui.html (fondo claro, morado #6941F5, lima #D9F76B,
// DM Sans + Manrope). La app todavia usa la anterior; los correos ya van con la nueva.
//
// Idioma: cada correo se arma con `lang` ('es' | 'en') = el idioma de QUIEN LO RECIBE
// (users/{uid}.lang, que la app guarda al cambiar de idioma). Si Ana usa la app en
// inglés y Camilo en español, el cobro que Ana le manda a Camilo le llega en español.
// Lo que escribió la gente (nota, nombre de los gastos, nombre del grupo) va tal cual.
//
// Animaciones, de la mas compatible a la menos:
//   1. GIF (pago.gif / cobro.gif): se mueve en Gmail, Apple Mail, iPhone, Outlook web.
//      Outlook de Windows no anima GIFs -> le damos el PNG fijo con <!--[if mso]>.
//   2. CSS (<style id="ss-anim">): sello "PAGADO", barra de saldo, filas que suben,
//      punto que late. Solo Apple Mail / iPhone / Samsung / Thunderbird.
//      Los estilos en linea son el estado FINAL, asi que donde no hay animacion
//      (Gmail, Outlook) el correo se ve completo y quieto.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSEmails = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APP_URL = 'https://spentshare.com/';
  const ASSET_BASE = 'https://spentshare.com/email/';
  const TIME_ZONE = 'America/Chicago';
  const DEFAULT_LANG = 'es';   // quien todavia no tiene idioma guardado: como hoy

  // Colores de la identidad nueva (spentshare-ui.html)
  const C = {
    page: '#EDEBF3', app: '#F8F7FC', paper: '#FFFFFF', soft: '#EEEBF8', line: '#EAE7F1', row: '#F0EEF5',
    ink: '#252134', ink2: '#5C5470', muted: '#797387',
    purple: '#6941F5', deep: '#4C24CE', lavender: '#EAE3FF',
    secondary: '#F0EBFD', secondaryLine: '#E5DBFC',
    lime: '#D9F76B', limeInk: '#252E16', limeText: '#4D5A30',
    green: '#23735B', pending: '#A25143',
    heroSoft: '#EBE5FF', heroMuted: '#D3C7FF', heroPill: '#7C59F6', heroPillLine: '#8B6CF7',
    track: '#DDD6EE', dashed: '#CFC3E7',
  };
  const BODY = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const DISPLAY = "Manrope,'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  // Avatares pastel del diseño (fondo, letra)
  const AVATARS = [
    ['#E5DCF7', '#553A8F'], ['#F3DEC6', '#754D28'], ['#DED9F4', '#58418C'],
    ['#DCECCD', '#476337'], ['#FFDCD9', '#87433D'],
  ];
  // Colores de categoría del diseño (fondo, color)
  const CAT_COLORS = {
    food: ['#FFF0DF', '#A7651D'], drinks: ['#FFF0DF', '#A7651D'], pets: ['#FFF0DF', '#A7651D'],
    shopping: ['#EAE5FF', '#7851D2'], gifts: ['#EAE5FF', '#7851D2'], kids: ['#EAE5FF', '#7851D2'],
    transport: ['#DFF1E9', '#3C856B'], travel: ['#DFF1E9', '#3C856B'], health: ['#DFF1E9', '#3C856B'],
    home: ['#E4EDFE', '#4B72B9'], utilities: ['#E4EDFE', '#4B72B9'], education: ['#E4EDFE', '#4B72B9'],
    other: ['#F7E3ED', '#AD577F'], entertainment: ['#F7E3ED', '#AD577F'], personalcare: ['#F7E3ED', '#AD577F'],
  };

  // Formas de pago que cada quien configura en "Cómo me pagan".
  // Las que tienen `link` abren la otra app con el monto puesto (solo en dólares).
  // Zelle, Nequi y Bre-B no lo permiten: su botón abre SpentShare, que copia el dato.
  const PAY_METHODS = {
    venmo: {
      name: { es: 'Venmo', en: 'Venmo' }, mark: 'V', colors: ['#E4EDFE', '#4B72B9'],
      link: (v, amt, note) => `https://venmo.com/${encodeURIComponent(String(v).replace(/^@/, ''))}?txn=pay${amt ? `&amount=${amt}` : ''}&note=${encodeURIComponent(note)}`,
    },
    paypal: {
      name: { es: 'PayPal', en: 'PayPal' }, mark: 'P', colors: ['#EAE5FF', '#7851D2'],
      link: (v, amt) => `https://paypal.me/${encodeURIComponent(String(v).replace(/^@/, ''))}${amt ? `/${amt}USD` : ''}`,
    },
    cashapp: {
      name: { es: 'Cash App', en: 'Cash App' }, mark: '$', colors: ['#DFF1E9', '#3C856B'],
      link: (v, amt) => `https://cash.app/$${encodeURIComponent(String(v).replace(/^\$/, ''))}${amt ? `/${amt}` : ''}`,
    },
    zelle: { name: { es: 'Zelle', en: 'Zelle' }, mark: 'Z', colors: ['#EAE3FF', '#6941F5'] },
    nequi: { name: { es: 'Nequi', en: 'Nequi' }, mark: 'N', colors: ['#F7E3ED', '#AD577F'] },
    breb: { name: { es: 'Llave Bre-B', en: 'Bre-B key' }, mark: 'B', colors: ['#FFF0DF', '#A7651D'] },
  };

  // Temas de grupo del diseño final (fondo, tinta, acento)
  const THEMES = {
    violet: ['#EEE7FC', '#6C49B7', '#6941F5'], mint: ['#E1F1E9', '#377761', '#28765A'],
    rose: ['#F9E3ED', '#A65B7B', '#AC4775'], peach: ['#FFF0DF', '#956332', '#A75B2C'],
    lime: ['#EFF5D8', '#667D2D', '#627D29'], blue: ['#E5EDFD', '#4C6FAD', '#3865B8'],
  };

  const CURRENCIES = {
    USD: { symbol: '$', decimals: 2, thousandsSep: ',', decimalSep: '.' },
    COP: { symbol: '$', decimals: 0, thousandsSep: '.', decimalSep: ',' },
  };

  // ───────────────────────── textos por idioma ─────────────────────────
  // Las funciones reciben valores YA escapados cuando van a HTML.
  const STR = {
    es: {
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
      date: (d, m, y) => `${d} ${m}${y ? ' ' + y : ''}`,
      time: (h, min, am) => `${h}:${min} ${am ? 'a. m.' : 'p. m.'}`,
      cats: {
        food: 'Comida', transport: 'Transporte', utilities: 'Servicios', health: 'Salud',
        entertainment: 'Ocio', home: 'Casa', education: 'Educación', other: 'Otro',
        travel: 'Viajes', shopping: 'Compras', pets: 'Mascotas', drinks: 'Bebidas',
        personalcare: 'Cuidado personal', kids: 'Niños', gifts: 'Regalos',
      },
      methods: { zelle: 'Zelle', venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App', nequi: 'Nequi', breb: 'Llave Bre-B', transfer: 'Transferencia', cash: 'Efectivo', other: 'Otro' },
      payNow: amt => `Pagar ${amt}`,
      openApp: n => `Abrir ${n}`,
      copyDetails: 'Copiar datos',
      copyNote: (names, n) => `${names} no ${n > 1 ? 'dejan' : 'deja'} abrir el pago con el monto puesto. Toca “Copiar datos”: SpentShare copia el dato y tú le pagas desde tu banco.`,
      and: 'y',
      payQuick: P => `Pagarle a ${P} ahora`,
      footer: g => `Recibes este correo porque eres parte de ${g} en SpentShare.`,
      footerLegal: 'Es un comprobante entre miembros del grupo, no una factura fiscal.',

      // recibo
      receiptHeader: 'Recibo de pago',
      receiptImg: 'Pago completado',
      receiptLabel: { payer: 'Pago enviado', payee: 'Pago recibido', member: 'Pago registrado' },
      receiptSubject: {
        payer: (P, R, amt) => `Recibo: le pagaste ${amt} a ${R}`,
        payee: (P, R, amt, no) => `${P} te pagó ${amt} · Recibo ${no}`,
        member: (P, R, amt, no, g) => `${P} le pagó ${amt} a ${R} en ${g}`,
      },
      receiptIntro: {
        payer: (P, R, g) => `Listo, ${P}. Tu pago a <strong>${R}</strong> quedó registrado en <strong>${g}</strong>.`,
        payee: (P, R, g) => `${R}, <strong>${P}</strong> te pagó en <strong>${g}</strong>. Aquí está el comprobante.`,
        member: (P, R, g) => `<strong>${P}</strong> le pagó a <strong>${R}</strong> en <strong>${g}</strong>.`,
      },
      settled: (P, R) => `${P} y ${R} están a mano.`,
      remaining: amt => `Quedan ${amt} por pagar.`,
      receiptPre: (status, no, date) => `${status} Recibo ${no} · ${date}.`,
      receiptNo: 'Recibo n.º',
      stampPaid: 'PAGADO', stampPartial: 'ABONO',
      rDate: 'Fecha', rGroup: 'Grupo', rPayer: 'Pagó', rPayee: 'Recibió', rMethod: 'Cómo pagó', rBy: 'Registrado por',
      rInvoiceFull: 'Paga el cobro', rInvoicePart: 'Abona al cobro', rTotal: 'Total pagado',
      balance: (P, R) => `Saldo entre ${P} y ${R}`,
      viewGroup: 'Ver el grupo en SpentShare',
      noMoney: 'Registrar un pago actualiza las cuentas del grupo. SpentShare no mueve dinero.',
      notYou: '¿No reconoces este pago? Ábrelo en el grupo: cualquier miembro puede corregirlo o borrarlo.',
      tReceipt: (P, R, amt, cur, g) => `${P} le pagó ${amt} ${cur} a ${R} en ${g}.`,

      // cobro
      invoiceHeader: no => `Cobro · ${no}`,
      invoiceImg: 'Nuevo cobro',
      invoiceSubject: (F, amt, due) => `${F} te envió un cobro de ${amt}${due ? ` · vence el ${due}` : ''}`,
      invoicePre: (no, g, n) => `Cobro ${no} en ${g} por ${n} ${n === 1 ? 'gasto' : 'gastos'}. Mira el detalle y registra tu pago.`,
      sentYou: F => `${F} te envió un cobro`,
      pending: 'Pendiente',
      dueOn: d => `vence el ${d}`,
      remindPrefix: 'Recordatorio · ',
      remindYou: F => `${F} te recuerda un cobro`,
      overdue: 'Vencido',
      wasDue: d => `venció el ${d}`,
      autoYou: F => `Cobro automático de ${F}`,
      autoSetBy: F => `${F} programó este cobro automático en SpentShare.`,
      days: n => `${n} ${n === 1 ? 'día' : 'días'}`,
      noteBy: F => `${F}, al enviarte el cobro`,
      noteExpBy: A => `${A}, en el gasto`,
      mFrom: 'De', mTo: 'Para', mNo: 'Cobro n.º', mGroup: 'Grupo', mIssued: 'Emitido', mDue: 'Vence', mNoDue: 'Sin fecha',
      includes: 'Qué incluye',
      youPaid: 'pagaste tú', paidBy: F => `pagó ${F}`,
      of: amt => `de ${amt}`, creditTag: 'a tu favor',
      sOwed: F => `Tu parte de lo que pagó ${F}`,
      sCredit: 'A tu favor (lo que pagaste tú)',
      sPaid: 'Pagos que ya hiciste',
      sTotal: 'Total a pagar',
      howToPay: F => `Cómo pagarle a ${F}`,
      btnPaid: 'Ya le pagué · Registrar pago',
      btnDetail: 'Ver el detalle en la app',
      autoTitle: 'Recibo automático',
      afterPay: F => `Cuando registres el pago, ${F} y tú recibirán el recibo en su correo.`,
      tInvoice: (F, amt, cur, g) => `${F} te envió un cobro de ${amt} ${cur} en ${g}.`,
      tDue: d => `Vence: ${d}`,
      tNote: (F, n) => `Nota de ${F}: "${n}"`,
      tTotal: (amt, cur) => `Total a pagar: ${amt} ${cur}`,
      tPayLink: 'Registrar el pago',
      tViewGroup: 'Ver el grupo',
      tBalance: (P, R, a, b, s) => `Saldo entre ${P} y ${R}: ${a} -> ${b}. ${s}`,
      tBy: 'Registrado por', tDate: 'Fecha',

      // gasto compartido
      expHeader: 'Gasto compartido',
      expImg: 'Gasto dividido',
      expSubject: (A, desc, share) => `${A} agregó “${desc}” · tu parte ${share}`,
      expSubjectPayer: (A, desc, owed) => `${A} anotó “${desc}”, que pagaste tú · te deben ${owed}`,
      expEyebrow: P => `Tu parte de lo que pagó ${P}`,
      expEyebrowPayer: A => `${A} anotó un gasto que pagaste tú`,
      expHeroSub: total => `de ${total} en total`,
      expHeroSubPayer: 'te deben en total',
      expPre: (g, total, split, line) => `${g} · ${total} en total, dividido ${split}. ${line}`,
      split: { all: n => `entre todos (${n})`, two: () => 'entre dos', full: who => `todo a cargo de ${who}`, solo: () => 'solo para quien pagó', custom: n => `entre ${n}` },
      paidByMeta: P => `pagó ${P}`, addedByMeta: A => `anotado por ${A}`,
      total: 'total',
      howSplit: 'Cómo se dividió',
      you: 'tú',
      paidAmt: amt => `pagó ${amt}`,
      yourBalance: P => `Tu saldo con ${P}`,
      before: 'Antes', now: 'Ahora',
      capBefore: { pos: 'le debías', neg: 'te debía', zero: 'a mano' },
      capNow: { pos: 'le debes', neg: 'te debe', zero: 'a mano' },
      youOwe: (P, amt) => `Ahora le debes ${amt} a ${P}.`,
      theyOwe: (P, amt) => `${P} todavía te debe ${amt}.`,
      even: P => `${P} y tú están a mano.`,
      btnViewExp: 'Ver el gasto en SpentShare',
      btnSettle: P => `Liquidar con ${P}`,
      noRushTitle: 'Sin prisa',
      noRush: P => `Esto solo suma a tu saldo con ${P}. Puedes liquidar cuando quieras desde la app.`,
      payerTitle: 'Te avisamos',
      payerNote: 'Cuando alguien te pague su parte, te llegará el recibo.',
      fixIt: '¿Algo no cuadra? Cualquiera del grupo puede editar o borrar el gasto.',
      tExp: (A, desc, total, cur, g) => `${A} agregó "${desc}" (${total} ${cur}) en ${g}.`,
      tShare: amt => `Tu parte: ${amt}`,
      tOwed: amt => `Te deben: ${amt}`,
      tView: 'Ver el gasto',

      // invitación a un grupo
      inviteHeader: 'Invitación',
      inviteImg: 'Te invitaron a un grupo',
      inviteSubject: (F, g) => `${F} te invitó a “${g}” en SpentShare`,
      invitePre: (n) => `Únete con un toque y mira quién pagó qué. ${n === 1 ? 'Ya hay 1 persona' : `Ya hay ${n} personas`} adentro.`,
      inviteEyebrow: F => `${F} te invitó a su grupo`,
      inviteMeta: (n, cur) => `${n} ${n === 1 ? 'miembro' : 'miembros'} · ${cur}`,
      inviteIntro: (F, g) => `<strong>${F}</strong> usa SpentShare para llevar las cuentas de <strong>${g}</strong>: quién pagó, cuánto le toca a cada quien y quién le debe a quién.`,
      inviteCardHint: 'Así se ve el grupo en la app',
      joinBtn: 'Unirme al grupo',
      oneLinkTitle: 'Un solo enlace',
      oneLinkNew: 'Si todavía no tienes cuenta, la creas con este mismo botón (con Google o con tu correo) y entras directo al grupo.',
      oneLinkUser: 'Toca el botón, inicia sesión si hace falta y entras directo al grupo.',
      whoIsIn: 'Quiénes están',
      orCode: 'O usa este código en la app',
      codeWhere: 'Grupos › ¿Te invitaron?',
      inviteNoteBy: F => `${F}, al invitarte`,
      inviteFooter: (F, email) => `Te escribimos porque ${F}${email ? ` (${email})` : ''} te invitó a un grupo en SpentShare. Si no conoces a esta persona, puedes ignorar este correo.`,
      tInvite: (F, g) => `${F} te invitó a "${g}" en SpentShare.`,
      tJoin: 'Unirme al grupo',
      tCode: 'Código',
    },

    en: {
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      date: (d, m, y) => `${m} ${d}${y ? ', ' + y : ''}`,
      time: (h, min, am) => `${h}:${min} ${am ? 'AM' : 'PM'}`,
      cats: {
        food: 'Food', transport: 'Transport', utilities: 'Utilities', health: 'Health',
        entertainment: 'Entertainment', home: 'Home', education: 'Education', other: 'Other',
        travel: 'Travel', shopping: 'Shopping', pets: 'Pets', drinks: 'Drinks',
        personalcare: 'Personal care', kids: 'Kids', gifts: 'Gifts',
      },
      methods: { zelle: 'Zelle', venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App', nequi: 'Nequi', breb: 'Bre-B key', transfer: 'Bank transfer', cash: 'Cash', other: 'Other' },
      payNow: amt => `Pay ${amt}`,
      openApp: n => `Open ${n}`,
      copyDetails: 'Copy details',
      copyNote: (names, n) => `${names} ${n > 1 ? 'don’t' : 'doesn’t'} let other apps open a payment with the amount. Tap “Copy details”: SpentShare copies it and you pay from your bank.`,
      and: 'and',
      payQuick: P => `Pay ${P} now`,
      footer: g => `You’re getting this email because you’re part of ${g} on SpentShare.`,
      footerLegal: 'This is a record between group members, not a tax invoice.',

      receiptHeader: 'Payment receipt',
      receiptImg: 'Payment complete',
      receiptLabel: { payer: 'Payment sent', payee: 'Payment received', member: 'Payment recorded' },
      receiptSubject: {
        payer: (P, R, amt) => `Receipt: you paid ${R} ${amt}`,
        payee: (P, R, amt, no) => `${P} paid you ${amt} · Receipt ${no}`,
        member: (P, R, amt, no, g) => `${P} paid ${R} ${amt} in ${g}`,
      },
      receiptIntro: {
        payer: (P, R, g) => `All set, ${P}. Your payment to <strong>${R}</strong> was recorded in <strong>${g}</strong>.`,
        payee: (P, R, g) => `${R}, <strong>${P}</strong> paid you in <strong>${g}</strong>. Here’s your receipt.`,
        member: (P, R, g) => `<strong>${P}</strong> paid <strong>${R}</strong> in <strong>${g}</strong>.`,
      },
      settled: (P, R) => `${P} and ${R} are all square.`,
      remaining: amt => `${amt} left to pay.`,
      receiptPre: (status, no, date) => `${status} Receipt ${no} · ${date}.`,
      receiptNo: 'Receipt no.',
      stampPaid: 'PAID', stampPartial: 'PARTIAL',
      rDate: 'Date', rGroup: 'Group', rPayer: 'Paid by', rPayee: 'Paid to', rMethod: 'Paid with', rBy: 'Recorded by',
      rInvoiceFull: 'Settles request', rInvoicePart: 'Partly pays request', rTotal: 'Total paid',
      balance: (P, R) => `Balance between ${P} and ${R}`,
      viewGroup: 'View the group in SpentShare',
      noMoney: 'Recording a payment updates the group’s balances. SpentShare doesn’t move money.',
      notYou: 'Don’t recognize this payment? Open the group: any member can edit or delete it.',
      tReceipt: (P, R, amt, cur, g) => `${P} paid ${R} ${amt} ${cur} in ${g}.`,

      invoiceHeader: no => `Request · ${no}`,
      invoiceImg: 'New payment request',
      invoiceSubject: (F, amt, due) => `${F} sent you a payment request for ${amt}${due ? ` · due ${due}` : ''}`,
      invoicePre: (no, g, n) => `Request ${no} in ${g} for ${n} ${n === 1 ? 'expense' : 'expenses'}. See the details and record your payment.`,
      sentYou: F => `${F} sent you a request`,
      pending: 'Pending',
      dueOn: d => `due ${d}`,
      remindPrefix: 'Reminder · ',
      remindYou: F => `${F} is reminding you`,
      overdue: 'Overdue',
      wasDue: d => `was due ${d}`,
      autoYou: F => `${F}’s automatic request`,
      autoSetBy: F => `${F} set up this automatic request in SpentShare.`,
      days: n => `${n} ${n === 1 ? 'day' : 'days'}`,
      noteBy: F => `${F}, with the request`,
      noteExpBy: A => `${A}, on the expense`,
      mFrom: 'From', mTo: 'To', mNo: 'Request no.', mGroup: 'Group', mIssued: 'Issued', mDue: 'Due', mNoDue: 'No due date',
      includes: 'What’s included',
      youPaid: 'you paid', paidBy: F => `paid by ${F}`,
      of: amt => `of ${amt}`, creditTag: 'your credit',
      sOwed: F => `Your share of what ${F} paid`,
      sCredit: 'Your credit (what you paid)',
      sPaid: 'Payments you already made',
      sTotal: 'Total due',
      howToPay: F => `How to pay ${F}`,
      btnPaid: 'I paid · Record payment',
      btnDetail: 'See details in the app',
      autoTitle: 'Automatic receipt',
      afterPay: F => `Once you record the payment, you and ${F} will both get the receipt by email.`,
      tInvoice: (F, amt, cur, g) => `${F} sent you a payment request for ${amt} ${cur} in ${g}.`,
      tDue: d => `Due: ${d}`,
      tNote: (F, n) => `Note from ${F}: "${n}"`,
      tTotal: (amt, cur) => `Total due: ${amt} ${cur}`,
      tPayLink: 'Record the payment',
      tViewGroup: 'View the group',
      tBalance: (P, R, a, b, s) => `Balance between ${P} and ${R}: ${a} -> ${b}. ${s}`,
      tBy: 'Recorded by', tDate: 'Date',

      expHeader: 'Shared expense',
      expImg: 'Split expense',
      expSubject: (A, desc, share) => `${A} added “${desc}” · your share ${share}`,
      expSubjectPayer: (A, desc, owed) => `${A} logged “${desc}” that you paid · you’re owed ${owed}`,
      expEyebrow: P => `Your share of what ${P} paid`,
      expEyebrowPayer: A => `${A} logged an expense you paid`,
      expHeroSub: total => `of ${total} total`,
      expHeroSubPayer: 'owed to you in total',
      expPre: (g, total, split, line) => `${g} · ${total} total, split ${split}. ${line}`,
      split: { all: n => `between everyone (${n})`, two: () => 'between two', full: who => `all on ${who}`, solo: () => 'just for whoever paid', custom: n => `between ${n}` },
      paidByMeta: P => `paid by ${P}`, addedByMeta: A => `logged by ${A}`,
      total: 'total',
      howSplit: 'How it was split',
      you: 'you',
      paidAmt: amt => `paid ${amt}`,
      yourBalance: P => `Your balance with ${P}`,
      before: 'Before', now: 'Now',
      capBefore: { pos: 'you owed', neg: 'owed you', zero: 'all square' },
      capNow: { pos: 'you owe', neg: 'owes you', zero: 'all square' },
      youOwe: (P, amt) => `You now owe ${P} ${amt}.`,
      theyOwe: (P, amt) => `${P} still owes you ${amt}.`,
      even: P => `You and ${P} are all square.`,
      btnViewExp: 'View the expense in SpentShare',
      btnSettle: P => `Settle up with ${P}`,
      noRushTitle: 'No rush',
      noRush: P => `This just adds to your balance with ${P}. Settle up whenever you like in the app.`,
      payerTitle: 'We’ll let you know',
      payerNote: 'When someone pays you their share, you’ll get the receipt.',
      fixIt: 'Something off? Anyone in the group can edit or delete the expense.',
      tExp: (A, desc, total, cur, g) => `${A} added "${desc}" (${total} ${cur}) in ${g}.`,
      tShare: amt => `Your share: ${amt}`,
      tOwed: amt => `You’re owed: ${amt}`,
      tView: 'View the expense',

      inviteHeader: 'Invitation',
      inviteImg: 'You’re invited to a group',
      inviteSubject: (F, g) => `${F} invited you to “${g}” on SpentShare`,
      invitePre: (n) => `Join with one tap and see who paid what. ${n === 1 ? '1 person is' : `${n} people are`} already in.`,
      inviteEyebrow: F => `${F} invited you to their group`,
      inviteMeta: (n, cur) => `${n} ${n === 1 ? 'member' : 'members'} · ${cur}`,
      inviteIntro: (F, g) => `<strong>${F}</strong> uses SpentShare to keep track of <strong>${g}</strong>: who paid, each person’s share and who owes whom.`,
      inviteCardHint: 'This is how the group looks in the app',
      joinBtn: 'Join the group',
      oneLinkTitle: 'One link, that’s it',
      oneLinkNew: 'If you don’t have an account yet, you create it with this same button (Google or email) and land right in the group.',
      oneLinkUser: 'Tap the button, sign in if needed and you’re in the group.',
      whoIsIn: 'Who’s in',
      orCode: 'Or use this code in the app',
      codeWhere: 'Groups › Got an invite?',
      inviteNoteBy: F => `${F}, with the invite`,
      inviteFooter: (F, email) => `You’re getting this because ${F}${email ? ` (${email})` : ''} invited you to a group on SpentShare. If you don’t know this person, you can ignore this email.`,
      tInvite: (F, g) => `${F} invited you to "${g}" on SpentShare.`,
      tJoin: 'Join the group',
      tCode: 'Code',
    },
  };

  function pickLang(l) {
    return STR[l] ? l : DEFAULT_LANG;
  }

  // ───────────────────────── utilidades ─────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtMoney(amount, code) {
    const c = CURRENCIES[code] || CURRENCIES.USD;
    const n = Math.abs(Number(amount) || 0);
    const [i, d] = n.toFixed(c.decimals).split('.');
    return c.symbol + i.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousandsSep) + (d ? c.decimalSep + d : '');
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '?';
  }

  function initial(name) {
    return (String(name || '?').trim()[0] || '?').toUpperCase();
  }

  function avatarIndex(name) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % AVATARS.length;
  }

  // Partes de la fecha en la zona horaria del grupo
  function dateParts(value, tz) {
    const d = value instanceof Date ? value : new Date(value);
    const p = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz || TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return p;
  }

  function fmtDate(L, value, tz, { year = true } = {}) {
    const p = dateParts(value, tz);
    return L.date(p.day, L.months[Number(p.month) - 1], year ? p.year : '');
  }

  function fmtDateTime(L, value, tz) {
    const p = dateParts(value, tz);
    return `${fmtDate(L, value, tz)}, ${L.time(p.hour, p.minute, p.dayPeriod === 'AM')}`;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  // ───────────────────────── piezas de HTML ─────────────────────────
  function font(size, weight, color, family, extra) {
    return `font-family:${family || BODY};font-size:${size}px;font-weight:${weight};color:${color};${extra || ''}`;
  }

  function avatar(name, size, colors, ring) {
    const [bg, fg] = colors || AVATARS[avatarIndex(name)];
    const border = ring ? `border:${ring};` : '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
      <td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${bg}"
        style="width:${size}px;height:${size}px;border-radius:50%;background-color:${bg};${border}${font(Math.round(size * 0.38), 700, fg, BODY, `line-height:${size}px;text-align:center;`)}">${esc(initial(name))}</td>
    </tr></table>`;
  }

  function animatedImage(base, name, alt, size) {
    const style = `display:block;margin:0 auto;border:0;outline:none;width:${size}px;height:${size}px`;
    return `<!--[if mso]><img src="${base}${name}.png" width="${size}" height="${size}" alt="${esc(alt)}" style="${style}"><![endif]-->`
      + `<!--[if !mso]><!--><img src="${base}${name}.gif" width="${size}" height="${size}" alt="${esc(alt)}" style="${style}"><!--<![endif]-->`;
  }

  // full-btn del diseño: morado (principal) o lavanda (secundario)
  function button(href, label, { primary = true } = {}) {
    const bg = primary ? C.purple : C.secondary;
    const border = primary ? '' : `border:1px solid ${C.secondaryLine};`;
    const color = primary ? '#FFFFFF' : C.purple;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate"><tr>
      <td align="center" bgcolor="${bg}" style="border-radius:15px;background-color:${bg};${border}">
        <a href="${esc(href)}" target="_blank"
          style="display:block;padding:16px 22px;border-radius:15px;text-decoration:none;${font(15, 700, color, BODY, 'line-height:20px;')}">${label}</a>
      </td></tr></table>`;
  }

  // Tarjeta blanca con borde (expense-list / chart-card del diseño)
  function card(inner, pad) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.paper};border:1px solid ${C.line};border-radius:22px">
      <tr><td style="padding:${pad || '4px 16px'}">${inner}</td></tr></table>`;
  }

  // Cuadro del gasto (como en la app): el logo del comercio si lo hay; si no, el color de la categoría
  function catTile(category, logo) {
    const [cbg, cfg] = CAT_COLORS[category] || CAT_COLORS.other;
    const inner = logo
      ? `<img src="${esc(logo)}" width="30" height="30" alt="" style="display:block;border:0;width:30px;height:30px;margin:0 auto">`
      : `<div style="width:12px;height:12px;border-radius:4px;background-color:${cfg};font-size:0;line-height:0;margin:0 auto">&nbsp;</div>`;
    const bg = logo ? C.paper : cbg;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
            <td width="44" height="44" align="center" valign="middle" bgcolor="${bg}" style="width:44px;height:44px;border-radius:14px;background-color:${bg};${logo ? `border:1px solid ${C.line};` : ''}">${inner}</td></tr></table>`;
  }

  // Burbuja con la nota o el comentario de alguien (opcional)
  function noteBubble(name, text, by) {
    return `
      <div class="ss-a ss-d3" style="margin-bottom:18px;padding:0 2px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="38" valign="top" style="padding-top:2px">${avatar(name, 36)}</td>
          <td valign="top" style="padding-left:10px">
            <div style="background-color:${C.lavender};border-radius:4px 18px 18px 18px;padding:12px 15px;${font(15, 500, C.ink, BODY, 'line-height:22px;')}">${esc(text)}</div>
            <div style="margin-top:6px;${font(12, 500, C.muted)}">${esc(by)}</div>
          </td>
        </tr></table>
      </div>`;
  }

  function sectionHead(text) {
    return `<div style="margin:0 0 12px 2px;${font(17, 800, C.ink, DISPLAY, 'letter-spacing:-0.4px;')}">${text}</div>`;
  }

  function detailRow(label, value, { first = false, strong = false } = {}) {
    const border = first ? '' : `border-top:1px solid ${C.row};`;
    return `<tr>
      <td valign="top" style="padding:12px 0;${border}${font(13, 500, C.muted)}">${label}</td>
      <td valign="top" align="right" style="padding:12px 0 12px 12px;${border}${strong ? font(16, 800, C.ink, DISPLAY, 'letter-spacing:-0.4px;') : font(14, 600, C.ink)}">${value}</td>
    </tr>`;
  }

  function logoHeader(base, rightLabel) {
    return `<tr><td style="padding:0 8px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" width="40"><img src="${base}logo.png" width="40" height="40" alt="SpentShare" style="display:block;border:0;width:40px;height:40px"></td>
            <td valign="middle" style="padding-left:6px;${font(21, 800, C.ink, DISPLAY, 'letter-spacing:-0.9px;')}">Spent<span style="color:${C.purple}">Share</span></td>
          </tr></table>
        </td>
        <td valign="middle" align="right" style="${font(13, 650, C.muted)}">${rightLabel}</td>
      </tr></table>
    </td></tr>`;
  }

  function footer(L, groupName) {
    return `<tr><td align="center" style="padding:22px 18px 6px;${font(12, 500, C.muted, BODY, 'line-height:19px;')}">
      ${L.footer(`<strong style="color:${C.ink2}">${esc(groupName)}</strong>`)}<br>
      ${L.footerLegal}<br>
      <a href="${APP_URL}" style="color:${C.purple};text-decoration:none;font-weight:600">spentshare.com</a>
    </td></tr>`;
  }

  function shell({ lang, L, title, preheader, header, hero, body, groupName, footerHtml }) {
    // Relleno invisible para que el cliente no muestre el HTML en la vista previa
    const pad = '&#8199;&#65279;&#847; '.repeat(40);
    return `<!doctype html>
<html lang="${lang}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table{border-collapse:collapse}
  img{-ms-interpolation-mode:bicubic}
  a{color:${C.purple}}
  @media only screen and (max-width:600px){
    .ss-wrap{padding:14px 8px 24px!important}
    .ss-pad{padding-left:14px!important;padding-right:14px!important}
    .ss-hero{padding:24px 16px 22px!important}
    .ss-amt{font-size:42px!important;letter-spacing:-2px!important}
  }
</style>
<style id="ss-anim">
  .ss-a{animation-duration:.7s;animation-timing-function:cubic-bezier(.2,.8,.2,1);animation-fill-mode:both;animation-name:ssUp}
  .ss-d1{animation-delay:.15s}.ss-d2{animation-delay:.3s}.ss-d3{animation-delay:.45s}.ss-d4{animation-delay:.6s}
  .ss-d5{animation-delay:.75s}.ss-d6{animation-delay:.9s}.ss-d7{animation-delay:1.05s}.ss-d8{animation-delay:1.2s}
  .ss-stamp{animation:ssStamp .6s cubic-bezier(.3,1.4,.5,1) 1.5s both}
  .ss-bar{animation:ssBar 1.2s cubic-bezier(.2,.8,.2,1) 1.2s both}
  .ss-pulse{animation:ssPulse 1.8s ease-out 1.2s infinite}
  @keyframes ssUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ssStamp{0%{opacity:0;transform:scale(2.6) rotate(-22deg)}55%{opacity:1;transform:scale(.92) rotate(-8deg)}100%{opacity:1;transform:scale(1) rotate(-8deg)}}
  @keyframes ssBar{from{width:0}}
  @keyframes ssPulse{0%{box-shadow:0 0 0 0 rgba(217,247,107,.75)}70%{box-shadow:0 0 0 8px rgba(217,247,107,0)}100%{box-shadow:0 0 0 0 rgba(217,247,107,0)}}
  @media (prefers-reduced-motion:reduce){.ss-a,.ss-stamp,.ss-bar,.ss-pulse{animation:none!important}}
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${esc(preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page}">
<tr><td align="center" class="ss-wrap" style="padding:28px 12px 32px">
  <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    ${header}
    <tr><td bgcolor="${C.app}" style="background-color:${C.app};border-radius:32px;padding:10px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="${C.purple}" class="ss-hero" style="background-color:${C.purple};border-radius:28px;padding:28px 22px 24px">${hero}</td></tr>
        <tr><td class="ss-pad" style="padding:24px 14px 18px">${body}</td></tr>
      </table>
    </td></tr>
    ${footerHtml || footer(L, groupName)}
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  }

  // "Cómo pagarle a X": una fila por forma de pago, con su botón.
  // methods: [{type: 'zelle'|'venmo'|..., value}] (o el formato viejo {label, value})
  // copyLink(type): adónde va "Copiar datos" (SpentShare abre, copia el dato y explica)
  function payOptions(L, lang, { methods, amount, cur, note, copyLink }) {
    const list = (methods || []).filter(m => m && m.value).map(m => ({
      ...m, meta: PAY_METHODS[m.type] || null,
    }));
    if (!list.length) return '';
    list.sort((a, b) => (b.meta && b.meta.link ? 1 : 0) - (a.meta && a.meta.link ? 1 : 0));   // directas primero
    const plain = Number(amount || 0).toFixed(2);
    const copyNames = [];
    const rows = list.map((m, k) => {
      const meta = m.meta;
      const name = meta ? meta.name[lang] : (m.label || '');
      const [bg, fg] = meta ? meta.colors : [C.soft, C.purple];
      const direct = !!(meta && meta.link);
      const withAmount = direct && cur === 'USD';
      const href = direct ? meta.link(m.value, withAmount ? plain : '', note) : copyLink(m.type || 'other');
      if (!direct) copyNames.push(name);
      const label = direct ? (withAmount ? L.payNow(fmtMoney(amount, cur)) : L.openApp(name)) : L.copyDetails;
      const pill = direct
        ? `background-color:${C.purple};${font(13, 700, '#FFFFFF')}`
        : `background-color:${C.secondary};border:1px solid ${C.secondaryLine};${font(13, 700, C.purple)}`;
      const border = k ? `border-top:1px solid ${C.row};` : '';
      return `<tr>
        <td width="38" valign="middle" style="width:38px;min-width:38px;padding:13px 0;${border}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
            <td width="38" height="38" align="center" valign="middle" bgcolor="${bg}" style="width:38px;min-width:38px;height:38px;border-radius:12px;background-color:${bg};${font(15, 800, fg, DISPLAY, 'line-height:38px;text-align:center;')}">${esc(meta ? meta.mark : initial(name))}</td>
          </tr></table>
        </td>
        <td valign="middle" style="padding:13px 8px 13px 11px;${border}">
          <div style="${font(14, 650, C.ink)}">${esc(name)}</div>
          <div style="margin-top:2px;${font(12, 500, C.muted, BODY, 'word-break:break-all;')}">${esc(m.value)}</div>
        </td>
        <td valign="middle" align="right" style="padding:13px 0;${border}">
          <a href="${esc(href)}" target="_blank" style="display:inline-block;white-space:nowrap;border-radius:12px;padding:9px 13px;text-decoration:none;${pill}">${esc(label)}</a>
        </td>
      </tr>`;
    }).join('');
    const names = copyNames.length < 2 ? (copyNames[0] || '')
      : `${copyNames.slice(0, -1).join(', ')} ${L.and} ${copyNames[copyNames.length - 1]}`;
    const help = copyNames.length
      ? `<div style="margin:10px 4px 0;${font(12, 500, C.muted, BODY, 'line-height:18px;')}">${esc(L.copyNote(names, copyNames.length))}</div>` : '';
    return card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`, '2px 16px') + help;
  }

  function payMethodName(p, lang) {
    return PAY_METHODS[p.type] ? PAY_METHODS[p.type].name[lang] : (p.label || p.type || '');
  }

  // Bloque "persona → persona" del encabezado morado
  function peopleRow(fromName, toName) {
    const a = avatarIndex(fromName);
    let b = avatarIndex(toName);
    if (b === a) b = (b + 1) % AVATARS.length;
    const name = n => `<td style="padding:0 9px 0 8px;${font(14, 600, '#FFFFFF')}">${esc(firstName(n))}</td>`;
    const ring = '2px solid #FFFFFF';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0"><tr>
      <td>${avatar(fromName, 30, AVATARS[a], ring)}</td>${name(fromName)}
      <td style="padding:0 6px 0 0;${font(16, 600, C.heroMuted)}">&rarr;</td>
      <td style="padding-left:6px">${avatar(toName, 30, AVATARS[b], ring)}</td>${name(toName)}
    </tr></table>`;
  }

  function heroAmount(amount, currency) {
    return `<div class="ss-amt" style="margin-top:4px;${font(48, 800, '#FFFFFF', DISPLAY, 'line-height:56px;letter-spacing:-2.4px;')}">${fmtMoney(amount, currency)}<span style="${font(15, 600, C.heroMuted, BODY, 'letter-spacing:0;')}">&nbsp;${esc(currency)}</span></div>`;
  }

  function heroEyebrow(text) {
    return `<div style="margin-top:14px;${font(14, 600, C.heroSoft)}">${text}</div>`;
  }

  // ───────────────────────── RECIBO ─────────────────────────
  /**
   * @param {object} d
   *   lang ('es'|'en', idioma de quien lo recibe), receiptNo, date, currency, amount,
   *   group{name}, payer{name}, payee{name}, recordedBy{name}, viewer 'payer'|'payee'|'member',
   *   method? ('zelle'|'transfer'|'cash'|'other' o texto libre),
   *   balanceBefore, balanceAfter, invoiceNo?, appUrl?, assetBase?, timeZone?
   */
  function renderReceipt(d) {
    const lang = pickLang(d.lang);
    const L = STR[lang];
    const cur = d.currency || 'USD';
    const base = d.assetBase || ASSET_BASE;
    const app = d.appUrl || APP_URL;
    const tz = d.timeZone || TIME_ZONE;
    const amt = fmtMoney(d.amount, cur);
    const payer = d.payer.name, payee = d.payee.name;
    const P = firstName(payer), R = firstName(payee);
    const viewer = L.receiptLabel[d.viewer] ? d.viewer : 'member';
    const before = Number(d.balanceBefore != null ? d.balanceBefore : d.amount);
    const after = Math.max(0, Number(d.balanceAfter || 0));
    const settled = after < 0.01;
    const paidPct = before > 0 ? Math.max(4, Math.min(100, Math.round(((before - after) / before) * 100))) : 100;
    const g = d.group.name;
    const method = d.method ? (L.methods[d.method] || d.method) : '';

    const subject = L.receiptSubject[viewer](P, R, amt, d.receiptNo, g);
    const statusLine = settled ? L.settled(P, R) : L.remaining(fmtMoney(after, cur));
    const preheader = L.receiptPre(statusLine, d.receiptNo, fmtDate(L, d.date, tz));
    const recordedBy = d.recordedBy && d.recordedBy.name ? d.recordedBy.name : payer;
    const okColor = settled ? C.green : C.pending;

    const hero = `
      ${animatedImage(base, 'pago', L.receiptImg, 120)}
      <div class="ss-a ss-d1">${heroEyebrow(L.receiptLabel[viewer])}</div>
      <div class="ss-a ss-d2">${heroAmount(d.amount, cur)}</div>
      <div class="ss-a ss-d3">${peopleRow(payer, payee)}</div>`;

    const ticketRows = [
      detailRow(L.rDate, esc(fmtDateTime(L, d.date, tz)), { first: true }),
      detailRow(L.rGroup, esc(g)),
      detailRow(L.rPayer, esc(payer)),
      detailRow(L.rPayee, esc(payee)),
      method ? detailRow(L.rMethod, esc(method)) : '',
      detailRow(L.rBy, esc(recordedBy)),
      d.invoiceNo ? detailRow(settled ? L.rInvoiceFull : L.rInvoicePart, `<span style="color:${C.purple}">${esc(d.invoiceNo)}</span>`) : '',
      detailRow(L.rTotal, `${amt}<span style="${font(12, 600, C.muted, BODY, 'letter-spacing:0;')}">&nbsp;${esc(cur)}</span>`, { strong: true }),
    ].join('');

    const ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.paper};border:1px solid ${C.line};border-radius:22px">
      <tr><td style="padding:18px 18px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">
            <div style="${font(12, 600, C.muted)}">${L.receiptNo}</div>
            <div style="margin-top:3px;${font(18, 800, C.ink, DISPLAY, 'letter-spacing:-0.5px;')}">${esc(d.receiptNo)}</div>
          </td>
          <td valign="middle" align="right">
            <span class="ss-stamp" style="display:inline-block;transform:rotate(-8deg);border:2px solid ${okColor};border-radius:10px;padding:5px 11px;${font(13, 800, okColor, DISPLAY, 'letter-spacing:2px;')}">${settled ? L.stampPaid : L.stampPartial}</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 18px 0"><div style="border-top:2px dashed ${C.dashed};font-size:0;line-height:0;height:0">&nbsp;</div></td></tr>
      <tr><td style="padding:4px 18px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${ticketRows}</table>
      </td></tr>
    </table>`;

    // budget-mini del diseño
    const balance = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.soft};border-radius:20px">
      <tr><td style="padding:18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="${font(14, 650, C.ink)}">${L.balance(esc(P), esc(R))}</td>
          <td align="right" style="white-space:nowrap;${font(12, 500, C.muted)}"><span style="text-decoration:line-through">${fmtMoney(before, cur)}</span>
            &nbsp;&rarr;&nbsp;<span style="${font(16, 800, okColor, DISPLAY, 'letter-spacing:-0.4px;')}">${fmtMoney(after, cur)}</span></td>
        </tr></table>
        <div style="margin:13px 0 10px;height:7px;border-radius:9px;background-color:${C.track};overflow:hidden;font-size:0;line-height:0">
          <div class="ss-bar" style="width:${paidPct}%;height:7px;border-radius:9px;background-color:${C.purple};font-size:0;line-height:0">&nbsp;</div>
        </div>
        <div style="${font(13, 650, okColor)}">${settled ? '&#10003;&nbsp; ' : ''}${esc(statusLine)}</div>
      </td></tr></table>`;

    const body = `
      <div class="ss-a ss-d3" style="padding:0 4px;${font(15, 500, C.ink2, BODY, 'line-height:23px;')}">${L.receiptIntro[viewer](esc(P), esc(R), esc(g))}</div>
      <div class="ss-a ss-d4" style="margin-top:18px">${ticket}</div>
      <div class="ss-a ss-d5" style="margin-top:14px">${balance}</div>
      <div class="ss-a ss-d6" style="margin-top:22px">${button(app, L.viewGroup)}</div>
      <div class="ss-a ss-d7" style="margin-top:16px;padding:0 6px;${font(12, 500, C.muted, BODY, 'line-height:18px;text-align:center;')}">${L.noMoney}<br>${L.notYou}</div>`;

    const html = shell({
      lang, L, title: subject, preheader, groupName: g,
      header: logoHeader(base, L.receiptHeader), hero, body,
    });

    const text = [
      `SpentShare · ${L.receiptNo} ${d.receiptNo}`,
      '',
      L.tReceipt(P, R, amt, cur, g),
      `${L.tDate}: ${fmtDateTime(L, d.date, tz)}`,
      method ? `${L.rMethod}: ${method}` : null,
      `${L.tBy}: ${recordedBy}`,
      d.invoiceNo ? `${settled ? L.rInvoiceFull : L.rInvoicePart}: ${d.invoiceNo}` : null,
      L.tBalance(P, R, fmtMoney(before, cur), fmtMoney(after, cur), statusLine),
      '',
      L.noMoney,
      `${L.tViewGroup}: ${app}`,
    ].filter(x => x !== null).join('\n');

    return { subject, preheader, html, text, lang };
  }

  // ───────────────────────── FACTURA (COBRO) ─────────────────────────
  /**
   * @param {object} d
   *   lang ('es'|'en', idioma de quien lo recibe), invoiceNo, requestId, issuedAt, dueAt,
   *   currency, group{name},
   *   from{name,email}  -> quien cobra
   *   to{name}          -> quien debe (destinatario)
   *   note?, items[{date, description, category, logo?, paidBy:'from'|'to', total, share}],
   *   amount? (si falta se calcula), payTo?[{type, value}] ("Cómo me pagan" de quien cobra),
   *   reminder? (true: recordatorio de un cobro vencido; amount = lo que falta por pagar),
   *   auto? (true: cobro automático que programó quien cobra),
   *   appUrl?, assetBase?, timeZone?
   */
  function renderInvoice(d) {
    const lang = pickLang(d.lang);
    const L = STR[lang];
    const cur = d.currency || 'USD';
    const base = d.assetBase || ASSET_BASE;
    const app = d.appUrl || APP_URL;
    const tz = d.timeZone || TIME_ZONE;
    const F = firstName(d.from.name);
    const g = d.group.name;
    const items = d.items || [];
    const owed = items.filter(i => i.paidBy !== 'to').reduce((s, i) => s + Number(i.share || 0), 0);
    const credit = items.filter(i => i.paidBy === 'to').reduce((s, i) => s + Number(i.share || 0), 0);
    const amount = d.amount != null ? Number(d.amount) : owed - credit;
    const amt = fmtMoney(amount, cur);
    const days = d.dueAt ? daysBetween(d.issuedAt, d.dueAt) : null;
    const dueShort = d.dueAt ? fmtDate(L, d.dueAt, tz, { year: false }) : '';
    const payLink = `${app}?pagar=${encodeURIComponent(d.requestId || d.invoiceNo)}`;

    const reminder = !!d.reminder;
    const auto = !!d.auto;
    const subject = (reminder ? L.remindPrefix : '') + L.invoiceSubject(F, amt, dueShort);
    const preheader = L.invoicePre(d.invoiceNo, g, items.length);

    // mini-pill del diseño, con el punto lima que late
    const pillText = reminder
      ? `${L.overdue}${dueShort ? ` · ${L.wasDue(dueShort)}` : ''}`
      : `${L.pending}${dueShort ? ` · ${L.dueOn(dueShort)}` : ''}${days != null ? ` (${L.days(days)})` : ''}`;
    const pill = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 0;border-collapse:separate"><tr>
      <td bgcolor="${C.heroPill}" style="background-color:${C.heroPill};border:1px solid ${C.heroPillLine};border-radius:20px;padding:7px 13px 7px 11px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle"><div class="ss-pulse" style="width:8px;height:8px;border-radius:50%;background-color:${C.lime};font-size:0;line-height:0">&nbsp;</div></td>
          <td valign="middle" style="padding-left:8px;${font(12, 600, '#FFFFFF')}">${esc(pillText)}</td>
        </tr></table>
      </td></tr></table>`;

    const hero = `
      ${animatedImage(base, 'cobro', L.invoiceImg, 120)}
      <div class="ss-a ss-d1">${heroEyebrow(esc(reminder ? L.remindYou(F) : auto ? L.autoYou(F) : L.sentYou(F)))}</div>
      <div class="ss-a ss-d2">${heroAmount(amount, cur)}</div>
      <div class="ss-a ss-d3">${pill}</div>`;

    const note = d.note ? noteBubble(d.from.name, d.note, L.noteBy(F)) : '';

    const meta = (l1, v1, l2, v2, first) => {
      const border = first ? '' : `border-top:1px solid ${C.row};`;
      const cell = (l, v, pad) => `<td width="50%" valign="top" style="padding:12px ${pad};${border}">
        <div style="${font(12, 500, C.muted)}">${l}</div>
        <div style="margin-top:4px;${font(14, 650, C.ink, BODY, 'line-height:20px;')}">${v}</div></td>`;
      return `<tr>${cell(l1, v1, '12px 0 0')}${cell(l2, v2, '0 0 12px')}</tr>`;
    };
    const metaCard = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${meta(L.mFrom, `${esc(d.from.name)}${d.from.email ? `<br><span style="${font(12, 500, C.muted)}">${esc(d.from.email)}</span>` : ''}`, L.mTo, esc(d.to.name), true)}
      ${meta(L.mNo, esc(d.invoiceNo), L.mGroup, esc(g))}
      ${meta(L.mIssued, esc(fmtDate(L, d.issuedAt, tz)), L.mDue, d.dueAt ? `<span style="color:${C.pending}">${esc(fmtDate(L, d.dueAt, tz))}</span>` : L.mNoDue)}
    </table>`);

    // filas como la lista de gastos de la app: cuadro de categoría, título, detalle, monto
    const lines = items.map((i, k) => {
      const mine = i.paidBy === 'to';
      const who = mine ? L.youPaid : L.paidBy(F);
      const border = k ? `border-top:1px solid ${C.row};` : '';
      return `<tr>
        <td width="44" valign="middle" style="padding:15px 0;${border}">${catTile(i.category, i.logo)}</td>
        <td valign="middle" style="padding:15px 10px 15px 12px;${border}">
          <div style="${font(14, 650, C.ink, BODY, 'line-height:19px;')}">${esc(i.description)}</div>
          <div style="margin-top:4px;${font(12, 500, C.muted)}">${esc(L.cats[i.category] || L.cats.other)} · ${esc(who)} · ${esc(fmtDate(L, i.date, tz, { year: false })).replace(/ /g, '&nbsp;')}</div>
        </td>
        <td valign="middle" align="right" style="padding:15px 0;white-space:nowrap;${border}">
          <div style="${font(15, 800, mine ? C.green : C.ink, DISPLAY, 'letter-spacing:-0.4px;')}">${mine ? '&minus;' : ''}${fmtMoney(i.share, cur)}</div>
          <div style="margin-top:4px;${font(12, 500, C.muted)}">${mine ? esc(L.creditTag) : esc(L.of(fmtMoney(i.total, cur)))}</div>
        </td>
      </tr>`;
    }).join('');
    const itemsCard = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}</table>`, '0 16px');

    // summary-strip del diseño
    const sumRow = (label, value, color) => `<tr>
      <td style="padding:4px 0;${font(13, 500, C.ink2)}">${label}</td>
      <td align="right" style="padding:4px 0;white-space:nowrap;${font(14, 700, color, DISPLAY)}">${value}</td></tr>`;
    const summary = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.soft};border-radius:18px">
      <tr><td style="padding:14px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${sumRow(esc(L.sOwed(F)), fmtMoney(owed, cur), C.ink)}
          ${credit > 0 ? sumRow(L.sCredit, `&minus;${fmtMoney(credit, cur)}`, C.green) : ''}
          ${owed - credit - amount > 0.01 ? sumRow(L.sPaid, `&minus;${fmtMoney(owed - credit - amount, cur)}`, C.green) : ''}
          <tr><td colspan="2" style="padding:10px 0 0"><div style="border-top:1px solid ${C.track};font-size:0;line-height:0;height:0">&nbsp;</div></td></tr>
          <tr>
            <td style="padding:12px 0 0;${font(15, 800, C.ink, DISPLAY, 'letter-spacing:-0.3px;')}">${L.sTotal}</td>
            <td align="right" style="padding:12px 0 0;white-space:nowrap;${font(24, 800, C.purple, DISPLAY, 'letter-spacing:-1px;')}">${amt}<span style="${font(12, 600, C.muted, BODY, 'letter-spacing:0;')}">&nbsp;${esc(cur)}</span></td>
          </tr>
        </table>
      </td></tr></table>`;

    const payTo = (d.payTo && d.payTo.length) ? `
      <div class="ss-a ss-d6" style="margin-top:26px">
        ${sectionHead(esc(L.howToPay(F)))}
        ${payOptions(L, lang, { methods: d.payTo, amount, cur, note: `SpentShare ${d.invoiceNo}`, copyLink: t => `${payLink}&via=${t}` })}
      </div>` : '';

    // insight lima del diseño
    const insight = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.lime};border-radius:20px">
      <tr><td style="padding:16px 18px">
        <div style="${font(14, 700, C.limeInk)}">${L.autoTitle}</div>
        <div style="margin-top:5px;${font(13, 500, C.limeText, BODY, 'line-height:19px;')}">${esc(L.afterPay(F))}</div>
      </td></tr></table>`;

    const body = `
      ${note}
      <div class="ss-a ss-d4">${metaCard}</div>
      ${auto ? `<div class="ss-a ss-d4" style="margin-top:10px;padding:0 6px;${font(12, 500, C.muted, BODY, 'line-height:18px;')}">${esc(L.autoSetBy(F))}</div>` : ''}

      <div class="ss-a ss-d5" style="margin-top:26px">
        ${sectionHead(L.includes)}
        ${itemsCard}
        <div style="margin-top:12px">${summary}</div>
      </div>

      ${payTo}

      <div class="ss-a ss-d7" style="margin-top:26px">${button(payLink, L.btnPaid)}</div>
      <div class="ss-a ss-d7" style="margin-top:10px">${button(app, L.btnDetail, { primary: false })}</div>
      <div class="ss-a ss-d8" style="margin-top:16px">${insight}</div>`;

    const html = shell({
      lang, L, title: subject, preheader, groupName: g,
      header: logoHeader(base, esc(L.invoiceHeader(d.invoiceNo))), hero, body,
    });

    const text = [
      `SpentShare · ${L.invoiceHeader(d.invoiceNo)}`,
      '',
      L.tInvoice(F, amt, cur, g),
      d.dueAt ? L.tDue(fmtDate(L, d.dueAt, tz)) : null,
      d.note ? L.tNote(F, d.note) : null,
      auto ? L.autoSetBy(F) : null,
      '',
      `${L.includes}:`,
      ...items.map(i => `- ${fmtDate(L, i.date, tz, { year: false })}  ${i.description} (${i.paidBy === 'to' ? L.youPaid : L.paidBy(F)}): ${i.paidBy === 'to' ? '-' : ''}${fmtMoney(i.share, cur)}`),
      L.tTotal(amt, cur),
      ...(d.payTo || []).map(p => `${payMethodName(p, lang)}: ${p.value}`),
      '',
      `${L.tPayLink}: ${payLink}`,
    ].filter(x => x !== null).join('\n');

    return { subject, preheader, html, text, amount, lang };
  }

  // ───────────────────────── GASTO COMPARTIDO ─────────────────────────
  // Le llega a cada persona que tiene parte en un gasto nuevo (menos a quien lo anotó).
  /**
   * @param {object} d
   *   lang ('es'|'en', idioma de quien lo recibe), currency, group{name}, expenseId?,
   *   date, description, category, total, logo? (URL del logo del comercio), note? (comentario opcional),
   *   paidBy{name, uid?}, addedBy{name}? (si no, quien pagó),
   *   splitType 'all'|'two'|'full'|'solo'|'custom' ('custom': "entre N" = quienes tienen parte > 0),
   *   splits[{name, share, isPayer?, isYou?}],
   *   balanceBefore, balanceAfter  -> saldo de quien recibe con quien pagó
   *                                   (> 0: tú le debes · < 0: te debe · 0: a mano)
   *   payTo? [{type, value}] -> "Cómo me pagan" de quien pagó (botones para pagarle ya)
   *   appUrl?, assetBase?, timeZone?
   */
  function renderExpense(d) {
    const lang = pickLang(d.lang);
    const L = STR[lang];
    const cur = d.currency || 'USD';
    const base = d.assetBase || ASSET_BASE;
    const app = d.appUrl || APP_URL;
    const tz = d.timeZone || TIME_ZONE;
    const g = d.group.name;
    const P = firstName(d.paidBy.name);
    const A = firstName((d.addedBy && d.addedBy.name) || d.paidBy.name);
    const splits = d.splits || [];
    const me = splits.find(s => s.isYou) || { share: 0 };
    const iPaid = !!me.isPayer;
    const owedToMe = splits.filter(s => !s.isPayer).reduce((s, x) => s + Number(x.share || 0), 0);
    const heroValue = iPaid ? owedToMe : Number(me.share || 0);
    const total = fmtMoney(d.total, cur);
    const other = splits.find(s => !s.isPayer) || {};
    const splitTxt = (L.split[d.splitType] || L.split.all)(d.splitType === 'full' ? firstName(other.name)
      : d.splitType === 'custom' ? (splits.filter(s => Number(s.share) > 0).length || splits.length) : splits.length);
    const before = Number(d.balanceBefore || 0), after = Number(d.balanceAfter || 0);
    const sign = v => (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : 'zero');
    const line = sign(after) === 'pos' ? L.youOwe(P, fmtMoney(after, cur))
      : sign(after) === 'neg' ? L.theyOwe(P, fmtMoney(-after, cur)) : L.even(P);
    const viewLink = d.expenseId ? `${app}?gasto=${encodeURIComponent(d.expenseId)}` : app;

    const subject = iPaid
      ? L.expSubjectPayer(A, d.description, fmtMoney(owedToMe, cur))
      : L.expSubject(A, d.description, fmtMoney(me.share, cur));
    const preheader = L.expPre(g, total, splitTxt, iPaid ? '' : line).trim();

    const hero = `
      ${animatedImage(base, 'gasto', L.expImg, 120)}
      <div class="ss-a ss-d1">${heroEyebrow(esc(iPaid ? L.expEyebrowPayer(A) : L.expEyebrow(P)))}</div>
      <div class="ss-a ss-d2">${heroAmount(heroValue, cur)}</div>
      <div class="ss-a ss-d3" style="margin-top:6px;${font(14, 500, C.heroSoft)}">${esc(iPaid ? L.expHeroSubPayer : L.expHeroSub(total))}</div>`;

    // la fila del gasto, como en la lista de la app
    const meta = [L.cats[d.category] || L.cats.other, fmtDate(L, d.date, tz, { year: false }), L.paidByMeta(P)]
      .concat(A !== P ? [L.addedByMeta(A)] : []).map(esc).join(' · ');
    const expenseCard = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="44" valign="middle" style="padding:16px 0">${catTile(d.category, d.logo)}</td>
      <td valign="middle" style="padding:16px 10px 16px 12px">
        <div style="${font(15, 650, C.ink, BODY, 'line-height:20px;')}">${esc(d.description)}</div>
        <div style="margin-top:4px;${font(12, 500, C.muted, BODY, 'line-height:17px;')}">${meta}</div>
      </td>
      <td valign="middle" align="right" style="padding:16px 0;white-space:nowrap">
        <div style="${font(16, 800, C.ink, DISPLAY, 'letter-spacing:-0.4px;')}">${total}</div>
        <div style="margin-top:4px;${font(12, 500, C.muted)}">${L.total}</div>
      </td>
    </tr></table>`);

    // cómo se dividió: una fila por persona, la tuya marcada
    const rows = splits.map((s, k) => {
      const border = k ? `border-top:1px solid ${C.row};` : '';
      const youPill = s.isYou ? `&nbsp;<span style="display:inline-block;background-color:${C.lavender};border-radius:20px;padding:1px 8px;${font(11, 700, C.purple)}">${L.you}</span>` : '';
      return `<tr>
        <td width="36" valign="middle" style="padding:13px 0;${border}">${avatar(s.name, 36)}</td>
        <td valign="middle" style="padding:13px 10px 13px 11px;${border}">
          <div style="${font(14, s.isYou ? 700 : 600, C.ink)}">${esc(firstName(s.name))}${youPill}</div>
          ${s.isPayer ? `<div style="margin-top:3px;${font(12, 500, C.muted)}">${esc(L.paidAmt(total))}</div>` : ''}
        </td>
        <td valign="middle" align="right" style="padding:13px 0;white-space:nowrap;${border}${font(15, 800, s.isYou ? C.purple : C.ink, DISPLAY, 'letter-spacing:-0.4px;')}">${fmtMoney(s.share, cur)}</td>
      </tr>`;
    }).join('');
    const splitCard = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`, '2px 16px');

    // tu saldo con quien pagó: antes / ahora (balance-sub del diseño)
    const col = (label, v, caps, strong) => `<td width="50%" valign="top" style="padding:0 ${strong ? '0 0 16px' : '16px 0 0'};${strong ? `border-left:1px solid ${C.track};` : ''}">
        <div style="${font(12, 500, C.muted)}">${label}</div>
        <div style="margin-top:4px;${font(strong ? 20 : 17, 800, strong ? C.ink : C.muted, DISPLAY, 'letter-spacing:-0.6px;')}">${fmtMoney(Math.abs(v), cur)}</div>
        <div style="margin-top:2px;${font(12, 500, C.muted)}">${caps[sign(v)]}</div></td>`;
    const balance = iPaid ? '' : `
      <div class="ss-a ss-d6" style="margin-top:14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.soft};border-radius:20px">
          <tr><td style="padding:18px">
            <div style="margin-bottom:12px;${font(14, 650, C.ink)}">${esc(L.yourBalance(P))}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${col(L.before, before, L.capBefore, false)}${col(L.now, after, L.capNow, true)}
            </tr></table>
            <div style="margin-top:14px;${font(13, 650, sign(after) === 'zero' ? C.green : C.ink2)}">${sign(after) === 'zero' ? '&#10003;&nbsp; ' : ''}${esc(line)}</div>
          </td></tr></table>
      </div>`;

    const insight = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.lime};border-radius:20px">
      <tr><td style="padding:16px 18px">
        <div style="${font(14, 700, C.limeInk)}">${iPaid ? L.payerTitle : L.noRushTitle}</div>
        <div style="margin-top:5px;${font(13, 500, C.limeText, BODY, 'line-height:19px;')}">${esc(iPaid ? L.payerNote : L.noRush(P))}</div>
      </td></tr></table>`;

    const settleLink = `${app}?liquidar=${encodeURIComponent(d.paidBy.uid || P)}`;
    const settleBtn = !iPaid && sign(after) === 'pos'
      ? `<div class="ss-a ss-d7" style="margin-top:10px">${button(settleLink, esc(L.btnSettle(P)), { primary: false })}</div>` : '';

    // si quien pagó tiene "Cómo me pagan", botones para pagarle ya
    const payNow = !iPaid && sign(after) === 'pos' && d.payTo && d.payTo.length ? `
      <div class="ss-a ss-d6" style="margin-top:26px">
        ${sectionHead(esc(L.payQuick(P)))}
        ${payOptions(L, lang, { methods: d.payTo, amount: after, cur, note: `SpentShare · ${g}`, copyLink: t => `${settleLink}&via=${t}` })}
      </div>` : '';

    const comment = d.note ? noteBubble(A, d.note, L.noteExpBy(A)) : '';
    const body = `
      ${comment}
      <div class="ss-a ss-d3">${expenseCard}</div>

      <div class="ss-a ss-d4" style="margin-top:26px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px"><tr>
          <td style="padding-left:2px;${font(17, 800, C.ink, DISPLAY, 'letter-spacing:-0.4px;')}">${L.howSplit}</td>
          <td align="right" style="${font(12, 500, C.muted)}">${esc(splitTxt)}</td>
        </tr></table>
        ${splitCard}
      </div>
      ${balance}
      ${payNow}

      <div class="ss-a ss-d7" style="margin-top:24px">${button(viewLink, L.btnViewExp)}</div>
      ${settleBtn}
      <div class="ss-a ss-d8" style="margin-top:16px">${insight}</div>
      <div class="ss-a ss-d8" style="margin-top:14px;padding:0 6px;${font(12, 500, C.muted, BODY, 'line-height:18px;text-align:center;')}">${L.fixIt}</div>`;

    const html = shell({
      lang, L, title: subject, preheader, groupName: g,
      header: logoHeader(base, L.expHeader), hero, body,
    });

    const text = [
      `SpentShare · ${L.expHeader}`,
      '',
      L.tExp(A, d.description, total, cur, g),
      d.note ? L.tNote(A, d.note) : null,
      `${L.howSplit}: ${splitTxt}`,
      ...splits.map(s => `- ${firstName(s.name)}${s.isYou ? ` (${L.you})` : ''}: ${fmtMoney(s.share, cur)}`),
      iPaid ? L.tOwed(fmtMoney(owedToMe, cur)) : L.tShare(fmtMoney(me.share, cur)),
      iPaid ? null : line,
      '',
      `${L.tView}: ${viewLink}`,
    ].filter(x => x !== null).join('\n');

    return { subject, preheader, html, text, lang };
  }

  // ───────────────────────── INVITACIÓN A UN GRUPO ─────────────────────────
  /**
   * @param {object} d
   *   lang ('es'|'en': el de quien recibe si ya tiene cuenta; si no, el de quien invita),
   *   inviter{name, email}, group{name, emoji, currency, theme ('violet'|'mint'|...)},
   *   members[{name}] (quiénes están), code (código del grupo),
   *   joinUrl? (si falta: appUrl + '?unirse=' + code), note?, isUser? (ya tiene cuenta),
   *   appUrl?, assetBase?
   */
  function renderInvite(d) {
    const lang = pickLang(d.lang);
    const L = STR[lang];
    const base = d.assetBase || ASSET_BASE;
    const app = d.appUrl || APP_URL;
    const F = firstName(d.inviter.name);
    const g = d.group.name;
    const emoji = d.group.emoji || '✨';
    const members = d.members || [];
    const n = members.length || 1;
    const cur = d.group.currency || 'USD';
    // El enlace también lleva nombre, símbolo y color del grupo: la pantalla de registro
    // los muestra antes de iniciar sesión (sin sesión no se puede leer Firestore).
    const joinUrl = d.joinUrl || `${app}?` + new URLSearchParams({
      unirse: d.code, g, e: emoji, t: d.group.theme || 'violet', f: F, n: String(n),
    }).toString();
    const [tbg, tink] = THEMES[d.group.theme] || THEMES.violet;

    const subject = L.inviteSubject(F, g);
    const preheader = L.invitePre(n);

    // pila de avatares de quienes ya están (con aro blanco, sobre morado)
    const pile = members.slice(0, 4).map(m => `<td>${avatar(m.name, 30, null, '2px solid #FFFFFF')}</td>`).join('');
    const extra = members.length > 4 ? `<td style="padding-left:6px;${font(13, 700, '#FFFFFF')}">+${members.length - 4}</td>` : '';

    const hero = `
      ${animatedImage(base, 'invita', L.inviteImg, 120)}
      <div class="ss-a ss-d1">${heroEyebrow(esc(L.inviteEyebrow(F)))}</div>
      <div class="ss-a ss-d2" style="margin-top:6px;${font(32, 800, '#FFFFFF', DISPLAY, 'line-height:38px;letter-spacing:-1.2px;')}">${esc(emoji)}&nbsp;${esc(g)}</div>
      <div class="ss-a ss-d3">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:14px auto 0"><tr>
          ${pile}${extra}
          <td style="padding-left:10px;${font(13, 600, C.heroSoft)}">${esc(L.inviteMeta(n, cur))}</td>
        </tr></table>
      </div>`;

    const note = d.note ? `
      <div class="ss-a ss-d3" style="margin-bottom:18px;padding:0 2px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="38" valign="top" style="padding-top:2px">${avatar(d.inviter.name, 36)}</td>
          <td valign="top" style="padding-left:10px">
            <div style="background-color:${C.lavender};border-radius:4px 18px 18px 18px;padding:12px 15px;${font(15, 500, C.ink, BODY, 'line-height:22px;')}">${esc(d.note)}</div>
            <div style="margin-top:6px;${font(12, 500, C.muted)}">${esc(L.inviteNoteBy(F))}</div>
          </td>
        </tr></table>
      </div>` : '';

    // la tarjeta del grupo, en su color (como en "Dale tu personalidad")
    const groupCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${tbg};border-radius:24px">
      <tr><td style="padding:18px 18px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="52" valign="middle">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
              <td width="50" height="50" align="center" valign="middle" style="width:50px;height:50px;border-radius:17px;background-color:#FFFFFF;font-size:28px;line-height:50px;text-align:center">${esc(emoji)}</td>
            </tr></table>
          </td>
          <td valign="middle" style="padding-left:13px">
            <div style="${font(17, 800, '#30263F', DISPLAY, 'letter-spacing:-0.45px;line-height:22px;')}">${esc(g)}</div>
            <div style="margin-top:4px;${font(12, 600, tink)}">${esc(L.inviteMeta(n, cur))}</div>
          </td>
        </tr></table>
        <div style="margin-top:12px;padding-top:11px;border-top:1px solid #FFFFFFB3;${font(11, 600, tink)}">${esc(L.inviteCardHint)}</div>
      </td></tr></table>`;

    const who = members.length ? `
      <div class="ss-a ss-d6" style="margin-top:26px">
        ${sectionHead(L.whoIsIn)}
        ${card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${members.slice(0, 8).map((m, k) => `<tr>
          <td width="34" valign="middle" style="padding:11px 0;${k ? `border-top:1px solid ${C.row};` : ''}">${avatar(m.name, 32)}</td>
          <td valign="middle" style="padding:11px 0 11px 11px;${k ? `border-top:1px solid ${C.row};` : ''}${font(14, 650, C.ink)}">${esc(firstName(m.name))}</td>
        </tr>`).join('')}</table>`, '2px 16px')}
      </div>` : '';

    const insight = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${C.lime};border-radius:20px">
      <tr><td style="padding:16px 18px">
        <div style="${font(14, 700, C.limeInk)}">${L.oneLinkTitle}</div>
        <div style="margin-top:5px;${font(13, 500, C.limeText, BODY, 'line-height:19px;')}">${esc(d.isUser ? L.oneLinkUser : L.oneLinkNew)}</div>
      </td></tr></table>`;

    const codeBox = `<div style="text-align:center">
        <div style="${font(12, 600, C.muted)}">${L.orCode}</div>
        <div style="margin:10px auto 0;padding:18px 10px;border:1px dashed #CBB9FC;border-radius:18px;background-color:#EFE9FD;${font(28, 800, C.purple, DISPLAY, 'letter-spacing:5px;')}">${esc(d.code)}</div>
        <div style="margin-top:8px;${font(12, 500, C.muted)}">${esc(L.codeWhere)}</div>
      </div>`;

    const body = `
      ${note}
      <div class="ss-a ss-d3" style="padding:0 4px;${font(15, 500, C.ink2, BODY, 'line-height:23px;')}">${L.inviteIntro(esc(F), esc(g))}</div>
      <div class="ss-a ss-d4" style="margin-top:18px">${groupCard}</div>
      <div class="ss-a ss-d5" style="margin-top:20px">${button(joinUrl, L.joinBtn)}</div>
      <div class="ss-a ss-d5" style="margin-top:12px">${insight}</div>
      ${who}
      <div class="ss-a ss-d7" style="margin-top:26px">${codeBox}</div>`;

    const footerHtml = `<tr><td align="center" style="padding:22px 18px 6px;${font(12, 500, C.muted, BODY, 'line-height:19px;')}">
      ${esc(L.inviteFooter(d.inviter.name, d.inviter.email))}<br>
      <a href="${APP_URL}" style="color:${C.purple};text-decoration:none;font-weight:600">spentshare.com</a>
    </td></tr>`;

    const html = shell({
      lang, L, title: subject, preheader, groupName: g, footerHtml,
      header: logoHeader(base, L.inviteHeader), hero, body,
    });

    const text = [
      `SpentShare · ${L.inviteHeader}`,
      '',
      L.tInvite(F, g),
      d.note ? `"${d.note}"` : null,
      '',
      `${L.tJoin}: ${joinUrl}`,
      `${L.tCode}: ${d.code}`,
      '',
      d.isUser ? L.oneLinkUser : L.oneLinkNew,
    ].filter(x => x !== null).join('\n');

    return { subject, preheader, html, text, lang, joinUrl };
  }

  return { renderReceipt, renderInvoice, renderExpense, renderInvite, fmtMoney, esc, pickLang, PAY_METHODS, THEMES, LANGS: Object.keys(STR) };
}));
