// Limón · calendario de fechas de Para ti, Explorar y Calle

function cuandoTxt(w) {
  const fijo = { semana: ['Esta semana', 'esta semana'], finde: ['Este finde', 'este finde'], mes: ['Próximos 30 días', 'en los próximos 30 días'],
    todo: ['Todo lo disponible', 'en todo lo disponible'], hoy: ['Hoy', 'hoy'], manana: ['Mañana', 'mañana'] }[w];
  if (fijo) return { boton: fijo[0], frase: fijo[1] };
  const [a, b] = range(w);
  if (+a === +b) return { boton: a.getDate() + ' ' + MES[a.getMonth()], frase: 'el ' + a.getDate() + ' de ' + MES_LARGO[a.getMonth()] };
  const mismo = a.getMonth() === b.getMonth();
  return { boton: mismo ? `${a.getDate()}–${b.getDate()} ${MES[b.getMonth()]}` : `${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]}`,
    frase: mismo ? `del ${a.getDate()} al ${b.getDate()} de ${MES_LARGO[b.getMonth()]}` : `del ${a.getDate()} de ${MES_LARGO[a.getMonth()]} al ${b.getDate()} de ${MES_LARGO[b.getMonth()]}` };
}
function pintaCuando() {
  document.querySelectorAll('[data-cuando]').forEach(b => {
    const w = b.dataset.cuando === 'pt' ? state.when : $('ex-when').value;
    b.querySelector('span').textContent = cuandoTxt(w).boton;
  });
}
// ---------- calendario: elegir un día o unos días (tocar el primero y el último)
let CAL = null;
function abrirCalendario(ctx) {
  if (ctx === 'ca') {
    const d = (caDays().find(x => x.id === state.caDay) || { d: today }).d;
    CAL = { ctx, mes: new Date(d.getFullYear(), d.getMonth(), 1), sel: [d, null], max: addDays(today, 30) };
    openSheet('<div id="cal"></div>'); pintaCal(); return;
  }
  const w = ctx === 'pt' ? state.when : $('ex-when').value;
  const [a, b] = range(w);
  CAL = { ctx, mes: new Date(a.getFullYear(), a.getMonth(), 1), sel: w === 'rango' || w === 'hoy' || w === 'manana' ? [a, b] : null };
  openSheet('<div id="cal"></div>');
  pintaCal();
}
function pintaCal() {
  const c = CAL, el = $('cal'); if (!c || !el) return;
  const rapidas = c.ctx === 'ca' ? [['hoy', 'Hoy'], ['manana', 'Mañana']] : [['hoy', 'Hoy'], ['manana', 'Mañana'], ['finde', 'Este finde'], ['semana', 'Esta semana'], ['mes', 'Próximos 30 días']].concat(c.ctx === 'ex' ? [['todo', 'Todo']] : []);
  const y = c.mes.getFullYear(), m = c.mes.getMonth(), primero = (new Date(y, m, 1).getDay() + 6) % 7, nd = new Date(y, m + 1, 0).getDate();
  const max = c.max || addDays(today, 365), [sa, sb] = c.sel || [null, null];
  let celdas = '';
  for (let i = 0; i < primero; i++) celdas += '<span></span>';
  for (let d = 1; d <= nd; d++) {
    const f = new Date(y, m, d), off = f < today || f > max;
    const enSel = sa && f >= sa && f <= (sb || sa), borde = sa && (+f === +sa || (sb && +f === +sb));
    celdas += `<button class="cd${enSel ? ' en' : ''}${borde ? ' bd' : ''}${+f === +today ? ' hoy' : ''}" data-cald="${f.getTime()}"${off ? ' disabled' : ''}>${d}</button>`;
  }
  let n = 0;
  if (sa && c.ctx !== 'ca') { const fb = sb || sa; for (const e of EV) if (!isDismissed(e) && occurs(e, sa, fb)) n++; }
  const prevOk = new Date(y, m, 1) > today, nextOk = new Date(y, m + 1, 1) <= max;
  el.innerHTML = `<div class="seg" style="justify-content:space-between;align-items:center"><h2 style="margin:0">¿Cuándo?</h2><button class="btn ghost" data-sheet-close>Cerrar</button></div>
      <div class="seg calq">${rapidas.map(([v, t]) => `<button class="pill" data-calq="${v}">${t}</button>`).join('')}</div>
      <div class="calhead"><button class="btn ghost" data-calm="-1"${prevOk ? '' : ' disabled'} aria-label="Mes anterior">‹</button><b>${MES_LARGO[m][0].toUpperCase() + MES_LARGO[m].slice(1)} ${y}</b><button class="btn ghost" data-calm="1"${nextOk ? '' : ' disabled'} aria-label="Mes siguiente">›</button></div>
      <div class="calgrid"><i>L</i><i>M</i><i>X</i><i>J</i><i>V</i><i>S</i><i>D</i>${celdas}</div>
      ${c.ctx === 'ca' ? '<p class="note" style="margin:0">Toca un día para ver sus cortes y avisos (hasta 30 días).</p>' : `<p class="note" style="margin:0">${sa ? (sb ? 'Del ' + sa.getDate() + ' ' + MES[sa.getMonth()] + ' al ' + sb.getDate() + ' ' + MES[sb.getMonth()] : 'Toca otro día si quieres elegir varios.') : 'Toca un día, o el primero y el último de tu viaje.'}</p>
      <div class="qfoot seg"><span></span><button class="btn" data-calok${sa ? '' : ' disabled'}>${sa ? `Ver ${n} ${n === 1 ? 'plan' : 'planes'}` : 'Elige un día'}</button></div>`}`;
}
function aplicaCuando(ctx, w) {
  if (ctx === 'pt') { state.when = w; state.ptShown = 12; }
  else { $('ex-when').value = w; state.exShown = 20; state.whenAntesBuscar = null; }
  closeSheets(); track('filtro', null, { k: 'cuando', v: w });
  renderAll(); window.scrollTo(0, 0);
}
// cuándo cae el evento dentro de [a,b]: próxima sesión o tramo en curso
// ¿ya no merece la pena ir hoy? Hay dos tipos de plan:
// - de entrar cuando quieras (exposiciones, mercados, ferias, fiestas, museos…, o un horario de 3 h o más): sale hasta que
//   acaba (hora de fin si la dice; si no, 3 h después del inicio, o 5 h si es «desde las…»);
// - con hora de empezar (conciertos, partidos, funciones, cine, cursos, visitas guiadas…): deja de salir 10 min después de
//   empezar la última sesión del día, porque ya no se puede entrar.
// Sin hora, «todo el día» o de madrugada: no se oculta
const LIBRE = new Set(['pintura', 'fotografia', 'escultura', 'contemporaneo', 'urbano', 'ilustracion', 'diseno', 'expo_hist', 'expo_ciencia', 'galerias',
  'ferias_arte', 'artesania', 'ferias_consumo', 'comic', 'videojuegos', 'coleccionismo', 'moda', 'hogar', 'salones_motor', 'profesionales', 'salones_mascota',
  'adopcion', 'petfriendly', 'fiestas', 'tradiciones', 'ferias', 'mercadillos', 'desfiles', 'noche', 'discotecas', 'mercados_gastro', 'tapas', 'jornadas_gastro',
  'festivales_gastro', 'popups', 'foodtrucks', 'museos', 'monumentos', 'jardines', 'ferias_libro', 'festivales_musica', 'huertos']);

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicCuando(ev) {
  const cu = ev.target.closest('[data-cuando]'); if (cu) { abrirCalendario(cu.dataset.cuando); return true; }
  return false;
}
function clicCalq(ev) {
  const cq = ev.target.closest('[data-calq]');
  if (cq && CAL) { if (CAL.ctx === 'ca') { state.caDay = cq.dataset.calq; closeSheets(); renderCalle(); } else aplicaCuando(CAL.ctx, cq.dataset.calq); return true; }
  return false;
}
function clicCalm(ev) {
  const cmes = ev.target.closest('[data-calm]'); if (cmes && CAL) { CAL.mes = new Date(CAL.mes.getFullYear(), CAL.mes.getMonth() + +cmes.dataset.calm, 1); pintaCal(); return true; }
  return false;
}
function clicCald(ev) {
  const cdia = ev.target.closest('[data-cald]');
  if (cdia && CAL) {
    const f = new Date(+cdia.dataset.cald);
    if (CAL.ctx === 'ca') { state.caOtro = f; state.caDay = +f === +today ? 'hoy' : +f === +addDays(today, 1) ? 'manana' : 'otro'; closeSheets(); renderCalle(); return true; }
    if (!CAL.sel || CAL.sel[1] || f < CAL.sel[0]) CAL.sel = [f, null];  // primer día (o se empieza de nuevo)
    else CAL.sel = +f === +CAL.sel[0] ? [f, null] : [CAL.sel[0], f];
    if (CAL.sel[1] && (CAL.sel[1] - CAL.sel[0]) / 864e5 > 30) CAL.sel = [f, null];  // como mucho un mes
    pintaCal(); return true;
  }
  return false;
}
function clicCalok(ev) {
  if (ev.target.closest('[data-calok]') && CAL && CAL.sel) { state.rango = [CAL.sel[0], CAL.sel[1] || CAL.sel[0]]; aplicaCuando(CAL.ctx, 'rango'); return true; }
  return false;
}
