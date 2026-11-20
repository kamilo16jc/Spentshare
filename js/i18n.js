// SpentShare — textos en español e inglés. t('clave', ...args)
// El idioma se guarda en el teléfono y en el perfil (users/{uid}.lang): los correos
// automáticos se escriben en el idioma de quien los recibe.
'use strict';

let lang = 'es';

const LOCALES = {
  es: {
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    monthsShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    daysShort: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    daysMed: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    daysLong: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
    fmtDay: (d, m) => `${d} ${m.toLowerCase()}`,
    fmtLong: (d, m, y) => `${d} de ${m.toLowerCase()}${y ? ' de ' + y : ''}`,
  },
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    daysShort: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    daysMed: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    daysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    fmtDay: (d, m) => `${m} ${d}`,
    fmtLong: (d, m, y) => `${m} ${d}${y ? ', ' + y : ''}`,
  },
};
const L = () => LOCALES[lang];

const TX = {
  es: {
    today: 'Hoy', yesterday: 'Ayer', you: 'tú', youCap: 'Tú', loading: 'Cargando…', saving: 'Guardando…', saved: 'Guardado',
    hello: n => `Hola, ${n}`,
    members: n => `${n} ${n === 1 ? 'miembro' : 'miembros'}`,
    people: n => `${n} ${n === 1 ? 'persona' : 'personas'}`,
    days: n => `${n} días`,
    settleDesc: (a, b) => `${a} le pagó a ${b}`,

    'nav.home': 'Inicio', 'nav.activity': 'Actividad', 'nav.stats': 'Estadísticas', 'nav.groups': 'Grupos',
    'aria.lang': 'Cambiar idioma', 'aria.profile': 'Abrir tu perfil', 'aria.editGroup': 'Personalizar grupo', 'aria.members': 'Miembros del grupo',
    'aria.period': 'Elegir periodo', 'aria.info': 'Información', 'aria.byCat': 'Filtrar por categoría', 'aria.byPerson': 'Filtrar por persona',
    'aria.bars': 'Gastos por periodo; toca o desliza para explorar', 'aria.showPass': 'Mostrar contraseña', 'aria.hidePass': 'Ocultar contraseña',

    'btn.addExpense': 'Agregar gasto', 'btn.settle': 'Liquidar', 'btn.request': 'Cobrar', 'btn.viewRequest': 'Ver cobro',
    'btn.seeAll': 'Ver todos', 'btn.seeDetail': 'Ver detalle', 'btn.clearFilters': 'Limpiar filtros', 'btn.seeMembers': 'Ver miembros',
    'btn.newGroup': 'Nuevo grupo', 'btn.haveCode': 'Tengo un código', 'btn.close': 'Cerrar', 'btn.done': 'Listo', 'btn.ok': 'Entendido',
    'btn.backHome': 'Volver al resumen', 'btn.invite': 'Invitar a alguien', 'btn.save': 'Guardar',

    'row.settle': (a, b) => `${a} le pagó a ${b}`, 'row.payment': 'Pago', 'row.solo': 'Solo quien pagó', 'row.refund': 'Reembolso',
    'row.perPerson': x => `${x} / pers.`,

    'empty.planH': 'El primer plan empieza aquí.', 'empty.planP': 'Agrega un gasto para empezar a compartirlo.',
    'empty.statsH': 'Cada plan empieza en cero.', 'empty.statsP': 'Tus gráficas aparecerán cuando compartas el primer gasto.',
    'empty.groupsH': 'Todo empieza con un grupo.', 'empty.groupsP': 'Una casa, un viaje o lo que venga. Crea uno o únete con el código que te compartieron.',

    'home.title': 'Cuentas claras.', 'home.yourBalance': 'Tu balance', 'home.owedToYou': 'Te deben', 'home.groupSpend': 'Gasto del grupo',
    'home.oweTo': n => `Debes a <strong>${n}</strong>`, 'home.oweMany': n => `Debes a <strong>${n} personas</strong>`,
    'home.toReceive': 'Tienes dinero por recibir', 'home.allClear': 'Todo saldado. A por el próximo plan.', 'home.blank': 'Un nuevo plan, una cuenta en blanco.',
    'home.with': n => `Con ${n}`, 'home.youOwe': a => `Le debes ${a}`, 'home.owesYou': a => `Te debe ${a}`,
    'home.reqDue': d => `cobro, vence el ${d}`, 'home.reqSent': 'cobro enviado',
    'home.square': 'Estamos a mano', 'home.squareSub': 'Sin pagos pendientes en este grupo.',
    'home.recent': 'Últimos movimientos', 'home.month': 'Tu mes, en perspectiva',

    'budget.title': 'Un mes con margen', 'budget.group': 'Presupuesto del grupo', 'budget.used': p => `${p}% usado`,
    'budget.of': x => `de ${x}`, 'budget.left': x => `Quedan ${x}`, 'budget.over': x => `Te pasaste ${x}`, 'budget.available': x => `${x} disponibles`,
    'budget.emptyTitle': 'Ponle un tope al mes', 'budget.new': 'Nuevo', 'budget.emptyHint': 'Créalo con una frase: «500 para comida»',
    'budget.monthOf': m => `Presupuesto de ${m}`, 'budget.delete': 'Quitar', 'budget.deleteConfirm': 'Toca otra vez para quitarlo',
    'budget.deleted': 'Presupuesto quitado', 'budget.intro': 'Escribe el tope como se lo dirías a alguien y la IA lo arma por ti.',
    'budget.newLbl': 'Nuevo presupuesto', 'budget.ph': 'Ej.: 500 al mes para comida y salidas', 'budget.create': 'Crear con IA',
    'budget.creating': 'Creando…', 'budget.created': n => `Listo: ${n}`, 'budget.fail': 'No lo entendí. Prueba: «300 para transporte».',
    'budget.stats': 'Ver estadísticas',

    'act.hello': 'Cada gasto tiene su historia', 'act.search': 'Buscar un gasto', 'act.all': 'Todos', 'act.payments': 'Pagos',
    'act.count': n => `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`,
    'act.noneH': 'Probemos con otra búsqueda.', 'act.noneP': 'No hay movimientos que coincidan con estos filtros.',
    'period.title': '¿Qué periodo revisamos?', 'period.intro': 'Elige un periodo o unas fechas.', 'period.all': 'Todo',
    'period.month': 'Este mes', 'period.last': 'Mes pasado', 'period.custom': 'Unas fechas', 'period.from': 'Desde', 'period.to': 'Hasta', 'period.apply': 'Aplicar',

    'st.hello': 'Una mirada a tus hábitos', 'st.week': 'Semana', 'st.month': 'Mes', 'st.year': 'Año',
    'st.thisWeek': 'esta semana', 'st.thisMonth': 'este mes', 'st.thisYear': 'este año',
    'st.shared': n => `Gasto compartido ${n}`, 'st.less': x => `${x} menos que el periodo anterior`, 'st.more': x => `${x} más que el periodo anterior`,
    'st.firstPeriod': 'Primer periodo con gastos', 'st.avgDay': 'Media diaria', 'st.avgMonth': 'Media mensual',
    'st.gesture': 'Toca o desliza sobre las barras.', 'st.whereH': '¿En qué se fue?', 'st.byCat': 'Por categoría',
    'st.cats': n => n === 1 ? 'categoría' : 'categorías', 'st.tapCat': 'Toca una categoría para ver sus gastos.', 'st.noSpend': n => `Sin gastos ${n}.`,
    'st.rest': 'Otras', 'st.insightH': 'Más planes este periodo', 'st.insightLessH': 'Un pequeño cambio, un buen ahorro',
    'st.insightLess': x => `El gasto del grupo bajó ${x} frente al periodo anterior.`, 'st.insightMore': x => `El gasto del grupo subió ${x} frente al periodo anterior.`,
    'st.insightTop': c => `${c} es la categoría principal.`, 'st.insightNone': 'Agrega gastos para ver cómo cambia el grupo.',
    'st.together': 'Entre todos', 'st.paidIn': n => `Pagado ${n}`, 'st.seeInActivity': 'Ver en actividad',

    'groups.hello': 'Cada plan, su espacio.', 'groups.title': 'Tus grupos', 'groups.total': 'Balance total',
    'groups.between': n => `Entre tus ${n} ${n === 1 ? 'grupo' : 'grupos'}`, 'groups.all': 'Todos tus grupos', 'groups.spaces': n => `${n} ${n === 1 ? 'espacio' : 'espacios'}`,
    'groups.newSub': 'Para lo que venga.', 'groups.invited': '¿Te invitaron?', 'groups.invitedSub': 'Usa tu código.', 'groups.endnote': 'Más planes juntos. Menos cuentas pendientes.',
    'tile.owe': 'Debes', 'tile.owed': 'Te deben', 'tile.none': 'Sin pendientes', 'tile.even': 'Al día', 'tile.current': 'Actual',

    'auth.loginH': 'Comparte sin<br>complicaciones.', 'auth.loginP': 'Gastos compartidos. Cuentas claras.',
    'auth.signupH': 'Crea tu cuenta.', 'auth.signupP': 'Un buen plan empieza por compartir.',
    'auth.joinSignupH': 'Crea tu cuenta<br>y entras directo.', 'auth.joinLoginH': 'Entra y quedas<br>dentro del grupo.', 'auth.joinP': 'Un solo paso. Al terminar ya estás en el grupo.',
    'auth.google': 'Continuar con Google', 'auth.or': 'o con tu correo', 'auth.name': 'Tu nombre', 'auth.namePh': '¿Cómo te llamas?',
    'auth.email': 'Correo electrónico', 'auth.emailPh': 'tu@correo.com', 'auth.password': 'Contraseña', 'auth.passwordPh': 'Al menos 8 caracteres',
    'auth.create': 'Crear cuenta', 'auth.createJoin': 'Crear cuenta y unirme', 'auth.enter': 'Entrar', 'auth.enterJoin': 'Entrar y unirme',
    'auth.haveAccount': '¿Ya tienes cuenta?', 'auth.firstTime': '¿Primera vez por aquí?', 'auth.toLogin': 'Inicia sesión', 'auth.toSignup': 'Crea una cuenta',
    'auth.forgot': '¿Olvidaste tu contraseña?',
    'auth.errCred': 'Correo o contraseña incorrectos.', 'auth.errInUse': 'Ese correo ya tiene cuenta. Inicia sesión.', 'auth.errWeak': 'La contraseña necesita al menos 8 caracteres.',
    'auth.errMany': 'Demasiados intentos. Espera un momento.', 'auth.errNet': 'Sin conexión. Revisa tu internet.', 'auth.errGeneric': 'No se pudo entrar. Intenta de nuevo.',
    'forgot.title': 'Recupera tu contraseña', 'forgot.intro': 'Te mandamos un enlace para crear una nueva.', 'forgot.send': 'Enviar enlace', 'forgot.sent': 'Revisa tu correo',

    'join.invitedBy': f => `${f} te invitó a`, 'join.invited': 'Te invitaron a', 'join.aGroup': 'un grupo',
    'join.title': 'Aquí empieza el plan', 'join.intro': 'Escribe el código que te compartieron.', 'join.code': 'Código de invitación',
    'join.btn': 'Unirme al grupo', 'join.empty': 'Escribe el código.', 'join.joining': 'Uniéndote…', 'join.notFound': 'No encontramos ese código. Revísalo.',
    'join.done': g => `Ya estás en ${g}`, 'join.already': g => `Ya eras parte de ${g}`, 'join.sheetTitle': 'Te invitaron a un plan',
    'join.sheetP': f => f ? `${f} quiere que lleven las cuentas juntos.` : 'Únete y lleven las cuentas juntos.', 'join.notNow': 'Ahora no',
    'link.notFound': 'No encontramos ese enlace en tus grupos.',

    'split.one': 'Una persona', 'split.many': n => `${n} personas, por igual`, 'split.choose': 'Elige a los participantes',
    'split.empty': 'Toca al menos un avatar para repartir el gasto.',
    'add.title': 'Un nuevo gasto', 'add.howMuch': '¿Cuánto fue?', 'add.scan': 'Escanear recibo', 'add.ai': 'Escribir con IA',
    'add.aiPh': 'Ej.: cena 45 con Ana, pagué yo', 'add.aiGo': 'Interpretar', 'add.what': '¿En qué lo gastaron?', 'add.whatPh': 'Una cena, el súper, un viaje…',
    'add.category': 'Categoría', 'add.paid': 'Pagó', 'add.date': 'Fecha', 'add.shareWith': 'Compartir con', 'add.save': 'Guardar gasto',
    'add.savedTitle': 'Gasto guardado', 'add.savedH': 'Uno menos por recordar.', 'add.savedSolo': 'Reparto guardado',
    'add.aiDone': 'Listo, revisa y guarda', 'add.aiFail': 'No lo entendí. Prueba con otras palabras.', 'add.reading': 'Leyendo…',
    'add.scanDone': 'Recibo leído', 'add.scanFail': 'No pude leer el recibo',

    'detail.title': 'Detalle del gasto', 'detail.payTitle': 'Detalle del pago', 'detail.paid': 'Pagó', 'detail.category': 'Categoría', 'detail.split': 'Reparto',
    'detail.equal': n => `${n} personas, por igual`, 'detail.solo': 'Solo quien pagó', 'detail.refund': 'Reembolso completo', 'detail.by': 'Anotado por',
    'detail.from': 'Pagó', 'detail.to': 'Recibió', 'detail.method': 'Cómo pagó', 'detail.receipt': 'Recibo n.º',
    'detail.delete': 'Borrar gasto', 'detail.deletePay': 'Borrar pago', 'detail.deleteConfirm': 'Toca otra vez para borrar', 'detail.deleted': 'Borrado',

    'settle.title': 'Una cuenta menos', 'settle.recording': 'Vas a registrar un pago de', 'settle.amount': 'Monto', 'settle.partial': 'Pagar otra cantidad',
    'settle.paysRequest': no => `Este pago abona al cobro ${no}.`, 'settle.how': '¿Cómo lo pagaste?',
    'settle.notice': 'Registrar un pago actualiza las cuentas del grupo. No envía dinero a otra persona.', 'settle.record': 'Registrar pago',
    'settle.doneTitle': 'Cuenta saldada', 'settle.doneH': 'Estamos a mano.', 'settle.doneP': 'Un pendiente menos.<br>Y más espacio para el próximo plan.',
    'settle.doneTag': 'Les llegó el recibo a los dos',
    'pay.with': n => `Págale a ${n} con`, 'pay.payAmt': x => `Pagar ${x}`, 'pay.open': n => `Abrir ${n}`, 'pay.copy': 'Copiar',
    'pay.copied': 'Copiado', 'pay.copyThis': 'Copia este dato', 'pay.step1': 'Abre la app de tu banco', 'pay.step2': n => `Entra a ${n} y elige enviar`,
    'pay.step3': x => `Pega el dato y pon ${x}`,
    'pay.title': 'Cómo me pagan', 'pay.intro': 'Así te pagarán más fácil: aparece cuando alguien te liquida o le llega tu cobro. Solo lo ven las personas de tus grupos.',
    'pay.direct': 'abre con el monto', 'pay.copies': 'se copia el dato', 'pay.foot': 'SpentShare nunca mueve dinero: solo abre la app o copia el dato.', 'pay.saved': 'Guardado. Así te van a pagar.',
    'pay.ph.zelle': 'Correo o celular de Zelle', 'pay.ph.venmo': '@usuario', 'pay.ph.paypal': 'Usuario de paypal.me', 'pay.ph.cashapp': '$cashtag',
    'pay.ph.nequi': 'Celular de Nequi', 'pay.ph.breb': 'Tu llave (@, celular o correo)', 'pay.breb': 'Llave Bre-B',
    'method.transfer': 'Transferencia', 'method.cash': 'Efectivo', 'method.other': 'Otro',

    'req.title': n => `Cobrarle a ${n}`, 'req.youAsk': 'Le vas a cobrar', 'req.noteLbl': 'Una nota (opcional)', 'req.notePh': 'Lo del mercado y la luz. ¡Gracias!',
    'req.dueIn': 'Vence en', 'req.notice': n => `A ${n} le llega un correo con el detalle, en su idioma. Cuando pague, les llega el recibo a los dos.`,
    'req.send': 'Enviar cobro', 'req.sending': 'Enviando…', 'req.alreadyPaid': 'Ya me pagó', 'req.doneTitle': 'Cobro enviado', 'req.doneH': 'Ya le llegó el cobro.',
    'req.doneP': (n, d) => `${n} tiene el detalle en su correo${d ? `.<br>Vence el ${d}` : ''}.`, 'req.noDebt': 'No te debe nada en este grupo.', 'req.fail': 'No se pudo enviar el cobro. Intenta de nuevo.',
    'req.sentTitle': 'Cobro enviado', 'req.number': no => `Cobro ${no}`, 'req.sentOn': 'Enviado', 'req.due': 'Vence', 'req.paidSoFar': 'Abonado', 'req.note': 'Nota',
    'req.received': 'Ya me pagó', 'req.receivedP': n => `Registraste el pago de ${n}.`, 'req.cancel': 'Cancelar cobro', 'req.cancelConfirm': 'Toca otra vez para cancelar', 'req.cancelled': 'Cobro cancelado',

    'auto.section': 'Automático', 'auto.chargeTitle': 'Cobro automático', 'auto.on': 'Activo', 'auto.off': 'Apagado', 'auto.paused': 'Pausado',
    'auto.chargeIntro': 'SpentShare le manda el cobro a quien te deba, con el detalle y tus datos para pagarte. Tú no tienes que acordarte.',
    'auto.enable': 'Enviar cobros automáticos', 'auto.frequency': 'Cada cuánto', 'auto.weekday': 'Qué día', 'auto.monthDay': 'Qué día del mes',
    'auto.biweeklyHint': 'Los días 1 y 15 de cada mes.', 'auto.min': 'No cobrar si es menos de', 'auto.dueIn': 'Plazo para pagar',
    'auto.noteLbl': 'Nota del cobro (opcional)', 'auto.notePh': 'Las cuentas del mes. ¡Gracias!',
    'auto.next': d => `Próximo cobro: <b>${d}</b>`, 'auto.nextShort': d => `próximo ${d}`, 'auto.wouldCharge': 'Si fuera hoy, le llegaría a:',
    'auto.nobody': 'Hoy nadie te debe más del mínimo.', 'auto.hasPending': 'ya tiene un cobro pendiente', 'auto.offNote': 'Apagado: no se envía nada.',
    'auto.saved': 'Cobro automático guardado', 'auto.savedOff': 'Cobro automático apagado', 'auto.rowOff': 'Tócalo para programarlo',
    'auto.fromReq': 'Programar cobros automáticos', 'auto.foot': 'Si alguien ya tiene un cobro tuyo pendiente, no le llega otro. Puedes apagarlo cuando quieras.',
    'auto.save': 'Guardar', 'auto.errMin': 'Revisa el mínimo.',
    'auto.what': '¿Qué se cobra?', 'auto.modeFixed': 'Gastos fijos', 'auto.modeBalance': 'Todo lo que te deben',
    'auto.whichFixed': 'Elige cuáles (uno o varios)', 'auto.fixedHint': 'Cada vez que se anota uno, a cada persona le llega el cobro de su parte, con el logo del gasto.',
    'auto.noFixed': 'Todavía no tienes gastos fijos que pagues tú. Crea uno y vuelve aquí.', 'auto.errFixed': 'Elige al menos un gasto fijo.',
    'auto.fixedRow': n => `${n} · cuando se anotan`, 'auto.fixedPreview': 'Así le llegará a cada uno:',
    'rec.viaAuto': 'Este gasto lo cobra tu cobro automático: a cada uno le llega su parte.',
    'freq.weekly': 'Cada semana', 'freq.biweekly': 'Cada quincena', 'freq.monthly': 'Cada mes',
    'sched.weekly': d => `Cada ${d}`, 'sched.biweekly': 'Los días 1 y 15', 'sched.monthly': n => `Cada mes, el día ${n}`,
    'rec.add': 'Gasto fijo', 'rec.title': 'Gasto fijo', 'rec.intro': 'Se anota solo cada vez que toca: el arriendo, el internet, las suscripciones.',
    'rec.sendCharge': 'Enviar el cobro a cada uno', 'rec.sendChargeHint': 'Cuando se anote, a cada uno le llega el cobro con lo que te debe.',
    'rec.notifyHint': 'Cuando se anote, a cada uno le llega el aviso del gasto, como siempre.', 'rec.onlyPayer': 'Solo quien lo paga puede enviar el cobro automático.',
    'rec.first': d => `Primera vez: <b>${d}</b>`, 'rec.next': d => `Próxima vez: <b>${d}</b>`, 'rec.save': 'Guardar gasto fijo', 'rec.saved': 'Gasto fijo guardado',
    'rec.pause': 'Pausar', 'rec.resume': 'Reanudar', 'rec.paused': 'Gasto fijo pausado', 'rec.resumed': 'Gasto fijo activo otra vez',
    'rec.delete': 'Eliminar gasto fijo', 'rec.deleteConfirm': 'Toca otra vez para eliminarlo', 'rec.deleted': 'Gasto fijo eliminado',
    'rec.notMine': n => `Lo creó ${n}. Solo ${n} lo puede cambiar.`, 'rec.paidBy': 'Lo paga', 'rec.split': 'Se reparte entre', 'rec.when': 'Cuándo',
    'rec.whatIs': '¿De qué es?', 'rec.optional': '(opcional)', 'rec.searchPh': 'Buscar: Netflix, ComEd, T-Mobile…',
    'rec.noMerchant': 'No está en la lista. Escríbelo arriba y queda con el ícono de su categoría.',
    'rec.noteLbl': 'Comentario (opcional)', 'rec.notePh': 'Ej.: el plan familiar de 4 pantallas', 'detail.note': 'Comentario',
    'rec.charges': 'Cobro automático', 'rec.yes': 'Sí', 'rec.no': 'No', 'rec.ph': 'Arriendo, internet, Netflix…', 'row.fixed': 'fijo',

    'members.title': 'Las personas del grupo', 'members.admin': 'Administrador', 'members.member': 'Miembro',
    'members.legend': 'En verde, a quien le deben; en rojo, quien debe.', 'members.delete': 'Eliminar grupo',
    'members.deleteConfirm': 'Toca otra vez: se borran todos los gastos', 'members.deleted': 'Grupo eliminado',
    'switch.title': '¿Qué plan revisamos?', 'switch.intro': 'Elige un grupo para ver sus cuentas.', 'switch.new': 'Un nuevo grupo',
    'invite.title': 'El plan necesita compañía', 'invite.intro': g => `Comparte el enlace o el código para invitar a alguien<br>a <strong>${g}</strong>.`,
    'invite.copyLink': 'Copiar enlace', 'invite.copied': 'Enlace copiado', 'invite.share': 'Compartir', 'invite.shareText': g => `Únete a ${g} en SpentShare`,
    'invite.byEmail': 'O mándale la invitación por correo', 'invite.send': 'Enviar invitación', 'invite.sending': 'Enviando…',
    'invite.sent': e => `Invitación enviada a ${e}`, 'invite.already': 'Esa persona ya está en el grupo.', 'invite.fail': 'No se pudo enviar. Intenta de nuevo.',
    'invite.foot': 'Con el enlace, quien no tiene cuenta la crea y entra directo al grupo.',

    'design.newTitle': 'Un nuevo plan', 'design.editTitle': 'Dale tu personalidad', 'design.placeholderName': 'Tu próximo plan', 'design.looks': 'Así se verá tu grupo',
    'design.name': 'Nombre del grupo', 'design.namePh': 'Por ejemplo: Verano entre amigos', 'design.symbol': 'Un símbolo que los represente',
    'design.color': 'Tu color', 'design.cover': 'Una pequeña portada', 'design.currency': 'Moneda', 'design.save': 'Guardar diseño', 'design.create': 'Crear grupo',
    'design.foot': 'El color acompañará a tu grupo en sus pantallas.', 'design.saved': 'El grupo ya tiene tu estilo', 'design.created': 'Tu nuevo plan está listo',
    'theme.violet': 'Violeta', 'theme.mint': 'Menta', 'theme.rose': 'Rosa', 'theme.peach': 'Melocotón', 'theme.lime': 'Lima', 'theme.blue': 'Azul',
    'cover.waves': 'Ondas', 'cover.orbit': 'Órbitas', 'cover.blocks': 'Bloques',

    'profile.title': 'Tu espacio', 'profile.photo': 'Cambiar foto', 'profile.photoSaved': 'Foto guardada', 'profile.name': 'Tu nombre', 'profile.nameSaved': 'Nombre guardado',
    'profile.payMethods': 'Cómo me pagan', 'profile.editGroup': 'Personalizar grupo', 'profile.members': 'Miembros del grupo', 'profile.invite': 'Invitar al grupo',
    'profile.lang': 'Idioma', 'profile.motion': 'Animaciones', 'profile.logout': 'Cerrar sesión', 'profile.foot': 'SpentShare · Gastos compartidos, cuentas claras.',

    'info.actTitle': 'Cada movimiento, en su lugar', 'info.act': 'Busca por nombre o filtra por categoría, persona y fechas. Toca un gasto para ver cómo se repartió.',
    'info.periodTitle': 'Tu periodo de un vistazo', 'info.period': 'Toca o desliza sobre las barras para explorar una fecha y su importe. Las categorías abren un detalle con sus movimientos.',

    'err.amount': 'Revisa el importe.', 'err.title': 'Escribe en qué lo gastaron.', 'err.split': 'Elige al menos una persona.',
    'err.save': 'No se pudo guardar. Revisa tu conexión.', 'err.email': 'Revisa el correo.', 'err.name': 'Escribe tu nombre.', 'err.image': 'Elige una imagen.',
    'err.groupName': 'Ponle un nombre al grupo.',

    'cat.food': 'Comida', 'cat.drinks': 'Bebidas', 'cat.pets': 'Mascotas', 'cat.shopping': 'Compras', 'cat.gifts': 'Regalos', 'cat.kids': 'Niños',
    'cat.transport': 'Transporte', 'cat.travel': 'Viajes', 'cat.health': 'Salud', 'cat.home': 'Hogar', 'cat.utilities': 'Servicios', 'cat.education': 'Educación',
    'cat.other': 'Otros', 'cat.entertainment': 'Ocio', 'cat.personalcare': 'Cuidado personal',
  },

  en: {
    today: 'Today', yesterday: 'Yesterday', you: 'you', youCap: 'You', loading: 'Loading…', saving: 'Saving…', saved: 'Saved',
    hello: n => `Hi, ${n}`,
    members: n => `${n} ${n === 1 ? 'member' : 'members'}`,
    people: n => `${n} ${n === 1 ? 'person' : 'people'}`,
    days: n => `${n} days`,
    settleDesc: (a, b) => `${a} paid ${b}`,

    'nav.home': 'Home', 'nav.activity': 'Activity', 'nav.stats': 'Stats', 'nav.groups': 'Groups',
    'aria.lang': 'Change language', 'aria.profile': 'Open your profile', 'aria.editGroup': 'Customize group', 'aria.members': 'Group members',
    'aria.period': 'Choose period', 'aria.info': 'Information', 'aria.byCat': 'Filter by category', 'aria.byPerson': 'Filter by person',
    'aria.bars': 'Spending by period; tap or slide to explore', 'aria.showPass': 'Show password', 'aria.hidePass': 'Hide password',

    'btn.addExpense': 'Add expense', 'btn.settle': 'Settle', 'btn.request': 'Request', 'btn.viewRequest': 'View request',
    'btn.seeAll': 'See all', 'btn.seeDetail': 'See details', 'btn.clearFilters': 'Clear filters', 'btn.seeMembers': 'See members',
    'btn.newGroup': 'New group', 'btn.haveCode': 'I have a code', 'btn.close': 'Close', 'btn.done': 'Done', 'btn.ok': 'Got it',
    'btn.backHome': 'Back to summary', 'btn.invite': 'Invite someone', 'btn.save': 'Save',

    'row.settle': (a, b) => `${a} paid ${b}`, 'row.payment': 'Payment', 'row.solo': 'Only the payer', 'row.refund': 'Reimbursement',
    'row.perPerson': x => `${x} / person`,

    'empty.planH': 'The first plan starts here.', 'empty.planP': 'Add an expense to start sharing it.',
    'empty.statsH': 'Every plan starts at zero.', 'empty.statsP': 'Your charts will show up once you share the first expense.',
    'empty.groupsH': 'It all starts with a group.', 'empty.groupsP': 'A home, a trip or whatever comes next. Create one or join with the code you got.',

    'home.title': 'Clear accounts.', 'home.yourBalance': 'Your balance', 'home.owedToYou': 'You’re owed', 'home.groupSpend': 'Group spending',
    'home.oweTo': n => `You owe <strong>${n}</strong>`, 'home.oweMany': n => `You owe <strong>${n} people</strong>`,
    'home.toReceive': 'You have money coming', 'home.allClear': 'All settled. On to the next plan.', 'home.blank': 'A new plan, a blank slate.',
    'home.with': n => `With ${n}`, 'home.youOwe': a => `You owe ${a}`, 'home.owesYou': a => `Owes you ${a}`,
    'home.reqDue': d => `request, due ${d}`, 'home.reqSent': 'request sent',
    'home.square': 'We’re all square', 'home.squareSub': 'No pending payments in this group.',
    'home.recent': 'Latest activity', 'home.month': 'Your month, in perspective',

    'budget.title': 'A month with room', 'budget.group': 'Group budget', 'budget.used': p => `${p}% used`,
    'budget.of': x => `of ${x}`, 'budget.left': x => `${x} left`, 'budget.over': x => `${x} over`, 'budget.available': x => `${x} available`,
    'budget.emptyTitle': 'Set a monthly cap', 'budget.new': 'New', 'budget.emptyHint': 'Create it with a sentence: “500 for food”',
    'budget.monthOf': m => `${m.charAt(0).toUpperCase() + m.slice(1)} budget`, 'budget.delete': 'Remove', 'budget.deleteConfirm': 'Tap again to remove',
    'budget.deleted': 'Budget removed', 'budget.intro': 'Write the cap the way you’d say it and AI builds it for you.',
    'budget.newLbl': 'New budget', 'budget.ph': 'E.g.: 500 a month for food and going out', 'budget.create': 'Create with AI',
    'budget.creating': 'Creating…', 'budget.created': n => `Done: ${n}`, 'budget.fail': 'I didn’t get that. Try: “300 for transport”.',
    'budget.stats': 'See stats',

    'act.hello': 'Every expense has a story', 'act.search': 'Search an expense', 'act.all': 'All', 'act.payments': 'Payments',
    'act.count': n => `${n} ${n === 1 ? 'item' : 'items'}`,
    'act.noneH': 'Let’s try another search.', 'act.noneP': 'Nothing matches these filters.',
    'period.title': 'Which period?', 'period.intro': 'Pick a period or some dates.', 'period.all': 'All time',
    'period.month': 'This month', 'period.last': 'Last month', 'period.custom': 'Some dates', 'period.from': 'From', 'period.to': 'To', 'period.apply': 'Apply',

    'st.hello': 'A look at your habits', 'st.week': 'Week', 'st.month': 'Month', 'st.year': 'Year',
    'st.thisWeek': 'this week', 'st.thisMonth': 'this month', 'st.thisYear': 'this year',
    'st.shared': n => `Shared spending ${n}`, 'st.less': x => `${x} less than the previous period`, 'st.more': x => `${x} more than the previous period`,
    'st.firstPeriod': 'First period with expenses', 'st.avgDay': 'Daily average', 'st.avgMonth': 'Monthly average',
    'st.gesture': 'Tap or slide over the bars.', 'st.whereH': 'Where did it go?', 'st.byCat': 'By category',
    'st.cats': n => n === 1 ? 'category' : 'categories', 'st.tapCat': 'Tap a category to see its expenses.', 'st.noSpend': n => `No spending ${n}.`,
    'st.rest': 'Others', 'st.insightH': 'More plans this period', 'st.insightLessH': 'A small change, a good saving',
    'st.insightLess': x => `Group spending went down ${x} from the previous period.`, 'st.insightMore': x => `Group spending went up ${x} from the previous period.`,
    'st.insightTop': c => `${c} is the top category.`, 'st.insightNone': 'Add expenses to see how the group changes.',
    'st.together': 'All together', 'st.paidIn': n => `Paid ${n}`, 'st.seeInActivity': 'See in activity',

    'groups.hello': 'Every plan, its own space.', 'groups.title': 'Your groups', 'groups.total': 'Total balance',
    'groups.between': n => `Across your ${n} ${n === 1 ? 'group' : 'groups'}`, 'groups.all': 'All your groups', 'groups.spaces': n => `${n} ${n === 1 ? 'space' : 'spaces'}`,
    'groups.newSub': 'For whatever comes.', 'groups.invited': 'Got an invite?', 'groups.invitedSub': 'Use your code.', 'groups.endnote': 'More plans together. Fewer pending accounts.',
    'tile.owe': 'You owe', 'tile.owed': 'You’re owed', 'tile.none': 'Nothing pending', 'tile.even': 'All square', 'tile.current': 'Current',

    'auth.loginH': 'Share without<br>the hassle.', 'auth.loginP': 'Shared expenses. Clear accounts.',
    'auth.signupH': 'Create your account.', 'auth.signupP': 'A good plan starts with sharing.',
    'auth.joinSignupH': 'Create your account<br>and you’re in.', 'auth.joinLoginH': 'Sign in and<br>you’re in the group.', 'auth.joinP': 'Just one step. When you finish, you’re in the group.',
    'auth.google': 'Continue with Google', 'auth.or': 'or with your email', 'auth.name': 'Your name', 'auth.namePh': 'What’s your name?',
    'auth.email': 'Email', 'auth.emailPh': 'you@email.com', 'auth.password': 'Password', 'auth.passwordPh': 'At least 8 characters',
    'auth.create': 'Create account', 'auth.createJoin': 'Create account and join', 'auth.enter': 'Sign in', 'auth.enterJoin': 'Sign in and join',
    'auth.haveAccount': 'Already have an account?', 'auth.firstTime': 'First time here?', 'auth.toLogin': 'Sign in', 'auth.toSignup': 'Create an account',
    'auth.forgot': 'Forgot your password?',
    'auth.errCred': 'Wrong email or password.', 'auth.errInUse': 'That email already has an account. Sign in.', 'auth.errWeak': 'The password needs at least 8 characters.',
    'auth.errMany': 'Too many attempts. Wait a moment.', 'auth.errNet': 'You’re offline. Check your internet.', 'auth.errGeneric': 'Couldn’t sign in. Try again.',
    'forgot.title': 'Reset your password', 'forgot.intro': 'We’ll send you a link to create a new one.', 'forgot.send': 'Send link', 'forgot.sent': 'Check your email',

    'join.invitedBy': f => `${f} invited you to`, 'join.invited': 'You’re invited to', 'join.aGroup': 'a group',
    'join.title': 'The plan starts here', 'join.intro': 'Type the code you were given.', 'join.code': 'Invite code',
    'join.btn': 'Join the group', 'join.empty': 'Type the code.', 'join.joining': 'Joining…', 'join.notFound': 'We couldn’t find that code. Check it.',
    'join.done': g => `You’re in ${g}`, 'join.already': g => `You were already in ${g}`, 'join.sheetTitle': 'You’re invited to a plan',
    'join.sheetP': f => f ? `${f} wants to keep the accounts together.` : 'Join and keep the accounts together.', 'join.notNow': 'Not now',
    'link.notFound': 'We couldn’t find that link in your groups.',

    'split.one': 'One person', 'split.many': n => `${n} people, equally`, 'split.choose': 'Choose who’s in',
    'split.empty': 'Tap at least one avatar to split the expense.',
    'add.title': 'A new expense', 'add.howMuch': 'How much was it?', 'add.scan': 'Scan receipt', 'add.ai': 'Write with AI',
    'add.aiPh': 'E.g.: dinner 45 with Ana, I paid', 'add.aiGo': 'Interpret', 'add.what': 'What was it for?', 'add.whatPh': 'A dinner, groceries, a trip…',
    'add.category': 'Category', 'add.paid': 'Paid by', 'add.date': 'Date', 'add.shareWith': 'Share with', 'add.save': 'Save expense',
    'add.savedTitle': 'Expense saved', 'add.savedH': 'One less thing to remember.', 'add.savedSolo': 'Split saved',
    'add.aiDone': 'Done, check it and save', 'add.aiFail': 'I didn’t get that. Try other words.', 'add.reading': 'Reading…',
    'add.scanDone': 'Receipt read', 'add.scanFail': 'Couldn’t read the receipt',

    'detail.title': 'Expense details', 'detail.payTitle': 'Payment details', 'detail.paid': 'Paid by', 'detail.category': 'Category', 'detail.split': 'Split',
    'detail.equal': n => `${n} people, equally`, 'detail.solo': 'Only the payer', 'detail.refund': 'Full reimbursement', 'detail.by': 'Logged by',
    'detail.from': 'Paid by', 'detail.to': 'Paid to', 'detail.method': 'Paid with', 'detail.receipt': 'Receipt no.',
    'detail.delete': 'Delete expense', 'detail.deletePay': 'Delete payment', 'detail.deleteConfirm': 'Tap again to delete', 'detail.deleted': 'Deleted',

    'settle.title': 'One less debt', 'settle.recording': 'You’re recording a payment of', 'settle.amount': 'Amount', 'settle.partial': 'Pay a different amount',
    'settle.paysRequest': no => `This payment goes toward request ${no}.`, 'settle.how': 'How did you pay?',
    'settle.notice': 'Recording a payment updates the group’s balances. It doesn’t send money to anyone.', 'settle.record': 'Record payment',
    'settle.doneTitle': 'Debt settled', 'settle.doneH': 'We’re all square.', 'settle.doneP': 'One less thing pending.<br>And more room for the next plan.',
    'settle.doneTag': 'You both got the receipt',
    'pay.with': n => `Pay ${n} with`, 'pay.payAmt': x => `Pay ${x}`, 'pay.open': n => `Open ${n}`, 'pay.copy': 'Copy',
    'pay.copied': 'Copied', 'pay.copyThis': 'Copy this', 'pay.step1': 'Open your bank’s app', 'pay.step2': n => `Go to ${n} and choose send`,
    'pay.step3': x => `Paste it and enter ${x}`,
    'pay.title': 'How people pay me', 'pay.intro': 'Make it easy to pay you: this shows up when someone settles with you or gets your request. Only people in your groups see it.',
    'pay.direct': 'opens with the amount', 'pay.copies': 'copies your details', 'pay.foot': 'SpentShare never moves money: it only opens the app or copies the details.', 'pay.saved': 'Saved. This is how people will pay you.',
    'pay.ph.zelle': 'Zelle email or phone', 'pay.ph.venmo': '@username', 'pay.ph.paypal': 'paypal.me username', 'pay.ph.cashapp': '$cashtag',
    'pay.ph.nequi': 'Nequi phone', 'pay.ph.breb': 'Your key (@, phone or email)', 'pay.breb': 'Bre-B key',
    'method.transfer': 'Bank transfer', 'method.cash': 'Cash', 'method.other': 'Other',

    'req.title': n => `Request from ${n}`, 'req.youAsk': 'You’re requesting', 'req.noteLbl': 'A note (optional)', 'req.notePh': 'Groceries and the power bill. Thanks!',
    'req.dueIn': 'Due in', 'req.notice': n => `${n} gets an email with the details, in their language. When they pay, you both get the receipt.`,
    'req.send': 'Send request', 'req.sending': 'Sending…', 'req.alreadyPaid': 'They already paid me', 'req.doneTitle': 'Request sent', 'req.doneH': 'The request is on its way.',
    'req.doneP': (n, d) => `${n} has the details in their email${d ? `.<br>Due ${d}` : ''}.`, 'req.noDebt': 'They don’t owe you anything in this group.', 'req.fail': 'Couldn’t send the request. Try again.',
    'req.sentTitle': 'Request sent', 'req.number': no => `Request ${no}`, 'req.sentOn': 'Sent', 'req.due': 'Due', 'req.paidSoFar': 'Paid so far', 'req.note': 'Note',
    'req.received': 'They paid me', 'req.receivedP': n => `You recorded ${n}’s payment.`, 'req.cancel': 'Cancel request', 'req.cancelConfirm': 'Tap again to cancel', 'req.cancelled': 'Request cancelled',

    'auto.section': 'Automatic', 'auto.chargeTitle': 'Automatic requests', 'auto.on': 'On', 'auto.off': 'Off', 'auto.paused': 'Paused',
    'auto.chargeIntro': 'SpentShare sends a payment request to whoever owes you, with the details and how to pay you. You don’t have to remember.',
    'auto.enable': 'Send automatic requests', 'auto.frequency': 'How often', 'auto.weekday': 'Which day', 'auto.monthDay': 'Day of the month',
    'auto.biweeklyHint': 'On the 1st and the 15th of every month.', 'auto.min': 'Don’t request less than', 'auto.dueIn': 'Time to pay',
    'auto.noteLbl': 'Note (optional)', 'auto.notePh': 'This month’s bills. Thanks!',
    'auto.next': d => `Next request: <b>${d}</b>`, 'auto.nextShort': d => `next ${d}`, 'auto.wouldCharge': 'If it were today, it would go to:',
    'auto.nobody': 'Nobody owes you more than the minimum today.', 'auto.hasPending': 'already has a pending request', 'auto.offNote': 'Off: nothing is sent.',
    'auto.saved': 'Automatic requests saved', 'auto.savedOff': 'Automatic requests turned off', 'auto.rowOff': 'Tap to set it up',
    'auto.fromReq': 'Schedule automatic requests', 'auto.foot': 'If someone already has a pending request from you, they don’t get another one. Turn it off anytime.',
    'auto.save': 'Save', 'auto.errMin': 'Check the minimum.',
    'auto.what': 'What gets requested?', 'auto.modeFixed': 'Fixed expenses', 'auto.modeBalance': 'Everything they owe you',
    'auto.whichFixed': 'Pick which ones (one or more)', 'auto.fixedHint': 'Each time one is added, everyone gets a request for their share, with the expense’s logo.',
    'auto.noFixed': 'You don’t have fixed expenses that you pay yet. Create one and come back.', 'auto.errFixed': 'Pick at least one fixed expense.',
    'auto.fixedRow': n => `${n} · when they’re added`, 'auto.fixedPreview': 'This is what each person will get:',
    'rec.viaAuto': 'Your automatic request charges this expense: everyone gets their share.',
    'freq.weekly': 'Weekly', 'freq.biweekly': 'Twice a month', 'freq.monthly': 'Monthly',
    'sched.weekly': d => `Every ${d}`, 'sched.biweekly': 'On the 1st and 15th', 'sched.monthly': n => `Monthly, on day ${n}`,
    'rec.add': 'Fixed expense', 'rec.title': 'Fixed expense', 'rec.intro': 'It’s added on its own every time: rent, internet, subscriptions.',
    'rec.sendCharge': 'Send everyone a request', 'rec.sendChargeHint': 'When it’s added, everyone gets a request for what they owe you.',
    'rec.notifyHint': 'When it’s added, everyone gets the usual expense email.', 'rec.onlyPayer': 'Only the person who pays it can send automatic requests.',
    'rec.first': d => `First time: <b>${d}</b>`, 'rec.next': d => `Next time: <b>${d}</b>`, 'rec.save': 'Save fixed expense', 'rec.saved': 'Fixed expense saved',
    'rec.pause': 'Pause', 'rec.resume': 'Resume', 'rec.paused': 'Fixed expense paused', 'rec.resumed': 'Fixed expense is back on',
    'rec.delete': 'Delete fixed expense', 'rec.deleteConfirm': 'Tap again to delete it', 'rec.deleted': 'Fixed expense deleted',
    'rec.notMine': n => `${n} created it. Only ${n} can change it.`, 'rec.paidBy': 'Paid by', 'rec.split': 'Split between', 'rec.when': 'When',
    'rec.whatIs': 'What is it?', 'rec.optional': '(optional)', 'rec.searchPh': 'Search: Netflix, ComEd, T-Mobile…',
    'rec.noMerchant': 'Not on the list. Type it above and it keeps its category icon.',
    'rec.noteLbl': 'Comment (optional)', 'rec.notePh': 'E.g. the family plan with 4 screens', 'detail.note': 'Comment',
    'rec.charges': 'Automatic request', 'rec.yes': 'Yes', 'rec.no': 'No', 'rec.ph': 'Rent, internet, Netflix…', 'row.fixed': 'fixed',

    'members.title': 'The people in the group', 'members.admin': 'Admin', 'members.member': 'Member',
    'members.legend': 'Green: they’re owed; red: they owe.', 'members.delete': 'Delete group',
    'members.deleteConfirm': 'Tap again: all expenses get deleted', 'members.deleted': 'Group deleted',
    'switch.title': 'Which plan are we checking?', 'switch.intro': 'Pick a group to see its accounts.', 'switch.new': 'A new group',
    'invite.title': 'The plan needs company', 'invite.intro': g => `Share the link or the code to invite someone<br>to <strong>${g}</strong>.`,
    'invite.copyLink': 'Copy link', 'invite.copied': 'Link copied', 'invite.share': 'Share', 'invite.shareText': g => `Join ${g} on SpentShare`,
    'invite.byEmail': 'Or send the invite by email', 'invite.send': 'Send invite', 'invite.sending': 'Sending…',
    'invite.sent': e => `Invite sent to ${e}`, 'invite.already': 'That person is already in the group.', 'invite.fail': 'Couldn’t send it. Try again.',
    'invite.foot': 'With the link, people without an account create one and land right in the group.',

    'design.newTitle': 'A new plan', 'design.editTitle': 'Give it your style', 'design.placeholderName': 'Your next plan', 'design.looks': 'This is how your group will look',
    'design.name': 'Group name', 'design.namePh': 'E.g.: Summer with friends', 'design.symbol': 'A symbol that represents you',
    'design.color': 'Your color', 'design.cover': 'A small cover', 'design.currency': 'Currency', 'design.save': 'Save design', 'design.create': 'Create group',
    'design.foot': 'The color will follow your group across its screens.', 'design.saved': 'The group has your style now', 'design.created': 'Your new plan is ready',
    'theme.violet': 'Violet', 'theme.mint': 'Mint', 'theme.rose': 'Rose', 'theme.peach': 'Peach', 'theme.lime': 'Lime', 'theme.blue': 'Blue',
    'cover.waves': 'Waves', 'cover.orbit': 'Orbits', 'cover.blocks': 'Blocks',

    'profile.title': 'Your space', 'profile.photo': 'Change photo', 'profile.photoSaved': 'Photo saved', 'profile.name': 'Your name', 'profile.nameSaved': 'Name saved',
    'profile.payMethods': 'How people pay me', 'profile.editGroup': 'Customize group', 'profile.members': 'Group members', 'profile.invite': 'Invite to the group',
    'profile.lang': 'Language', 'profile.motion': 'Animations', 'profile.logout': 'Sign out', 'profile.foot': 'SpentShare · Shared expenses, clear accounts.',

    'info.actTitle': 'Every item, in its place', 'info.act': 'Search by name or filter by category, person and dates. Tap an expense to see how it was split.',
    'info.periodTitle': 'Your period at a glance', 'info.period': 'Tap or slide over the bars to explore a date and its amount. Categories open a detail with their items.',

    'err.amount': 'Check the amount.', 'err.title': 'Say what it was for.', 'err.split': 'Choose at least one person.',
    'err.save': 'Couldn’t save. Check your connection.', 'err.email': 'Check the email.', 'err.name': 'Type your name.', 'err.image': 'Pick an image.',
    'err.groupName': 'Give the group a name.',

    'cat.food': 'Food', 'cat.drinks': 'Drinks', 'cat.pets': 'Pets', 'cat.shopping': 'Shopping', 'cat.gifts': 'Gifts', 'cat.kids': 'Kids',
    'cat.transport': 'Transport', 'cat.travel': 'Travel', 'cat.health': 'Health', 'cat.home': 'Home', 'cat.utilities': 'Utilities', 'cat.education': 'Education',
    'cat.other': 'Other', 'cat.entertainment': 'Fun', 'cat.personalcare': 'Personal care',
  },
};

function t(k, ...a) {
  const v = (TX[lang] && TX[lang][k]) ?? TX.es[k];
  return typeof v === 'function' ? v(...a) : (v ?? k);
}

function initLang() {
  let l = null;
  try { l = localStorage.getItem('lang'); } catch (e) {}
  if (l !== 'es' && l !== 'en') l = (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
  lang = l;
  document.documentElement.lang = lang;
}

function setLang(l) {
  if (l !== 'es' && l !== 'en') return;
  const changed = l !== lang;
  lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('lang', l); } catch (e) {}
  // También en el perfil: los correos se escriben en el idioma de quien los recibe
  if (changed && window._curUser && window._setDoc) {
    window._setDoc(window._docRef(window._db, 'users', window._curUser.uid), { lang: l }, { merge: true }).catch(() => {});
  }
}
