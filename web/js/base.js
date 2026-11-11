// Limón · base: categorías, almacenamiento local, fechas, tema, avisos en pantalla y aprendizaje

const LABEL = {}, GROUP_OF = {}, GROUP_NAME = {};
const GENERIC = { 'g:musica': 'Música', 'g:cine': 'Cine', 'g:arte': 'Exposiciones', 'g:escena': 'Artes escénicas', 'g:gastro': 'Gastronomía', 'g:deporte': 'Deporte', 'g:naturaleza': 'Naturaleza' };
const groupOf = c => c.startsWith('g:') ? ({ 'g:musica': 'musica', 'g:cine': 'cine', 'g:arte': 'arte', 'g:escena': 'escena', 'g:gastro': 'gastro', 'g:deporte': 'deporte', 'g:naturaleza': 'naturaleza' })[c] : GROUP_OF[c];
const labelOf = c => LABEL[c] || GENERIC[c] || 'Otros';
// ---------- almacenamiento local (con tolerancia a fallos)
const store = {
  get(k, d) { try { const v = localStorage.getItem('bureo.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bureo.' + k, JSON.stringify(v)); } catch (e) { } if (sync) sync(k, v); }
};
const SAMPLE = { pintura: 1, expo_hist: 1, arqueo_cat: 1, fotografia: 1, museos: 1, visitas: 1, historia: 1, cine_clasico: 1,
  preestrenos: 1, documental: 1, teatro: 1, conf: 1, libros: 1, divulgacion: 1, astronomia: 1, catas: 1, tradiciones: 1,
  padel: 1, carreras_perro: 1, jardines: 1, reggaeton: 2, electronica: 2, infantil: 2, cuentacuentos: 2, titeres: 2 };
let logged = false;
const aiReco = {};   // por rango de fechas: { loading, planes, error }
let state = { caKind: 'todo', caDay: null, filter: null, tab: 'parati', when: 'semana', free: false, ptShown: 12, exShown: 20, open: {}, groupsOpen: { arte: true } };
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// se llama miles de veces por pantalla: cada fecha se convierte una sola vez (nadie modifica estas fechas; addDays copia)
const PARSED = new Map();
const parse = s => { let d = PARSED.get(s); if (!d) { const [y, m, dd] = s.split('-').map(Number); d = new Date(y, m - 1, dd); PARSED.set(s, d); } return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function range(when) {
  const s = today;
  // esta semana = hasta el domingo; el sábado y el domingo, hasta el domingo siguiente (si no, el domingo sería solo «hoy»)
  if (when === 'semana') { const dow = (s.getDay() + 6) % 7; return [s, addDays(s, 6 - dow + (dow >= 5 ? 7 : 0))]; }
  if (when === 'finde') { const dow = (s.getDay() + 6) % 7; const sat = dow >= 5 ? (dow === 6 ? addDays(s, -1) : s) : addDays(s, 5 - dow); return [dow >= 5 ? s : sat, addDays(sat, 1)]; }
  if (when === 'mes') return [s, addDays(s, 30)];
  if (when === 'hoy') return [s, s];
  if (when === 'manana') return [addDays(s, 1), addDays(s, 1)];
  if (when === 'rango' && state.rango) return state.rango;
  return [s, addDays(s, 400)];
}
// cómo se llama el rango elegido: en el botón («Esta semana», «25 nov») y en frases («esta semana», «el 25 de noviembre»)
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function pintaTema() {
  const t = store.get('tema', 'auto');
  document.querySelectorAll('[data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === t)));
  const oscuro = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = oscuro ? '#0F1320' : '#FFD43B'; });
}
function yaPaso(e) {
  const t = String(e.hora || '');
  if (!t || /todo el d[ií]a|consult|24 ?h/i.test(t)) return false;
  const rango = t.match(/(?:de|desde)\s+(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*h?\s*(?:a|hasta)\s+(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?/i) || t.match(/(\d{1,2})[:.](\d{2})\s*h?\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  const horas = [...t.matchAll(/(\d{1,2})[:.](\d{2})|\b(\d{1,2})\s?h\b/gi)].map(m => +(m[1] || m[3]) + (+m[2] || 0) / 60).filter(h => h < 24);
  const ini = rango ? +rango[1] + (+rango[2] || 0) / 60 : null, fin = rango ? +rango[3] + (+rango[4] || 0) / 60 : null;
  const cats = e.cats || [], conHora = cats.some(c => ['musica', 'escena', 'cine', 'deporte'].includes(groupOf(c)));  // un teatro de 20:30 a 23:30 sigue siendo «con hora»
  const libre = cats.some(c => LIBRE.has(c)) || /desde/i.test(t) || (rango && fin - ini >= 3 && !conHora);
  let finH;
  if (libre) {
    if (rango) finH = fin;
    else if (horas.length) finH = Math.max(...horas) + (/desde/i.test(t) ? 5 : 3);
    else return false;
    if (finH <= 6 || finH >= 24) return false;  // acaba de madrugada: hoy no se oculta
  } else {
    const ultima = horas.length ? Math.max(...horas.filter(h => !rango || h !== fin)) : ini;  // la última sesión que empieza hoy
    if (ultima == null || !isFinite(ultima)) return false;
    finH = ultima + 10 / 60;
  }
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60 > finH;
}
const pasadoHoy = (e, d) => +d === HOY0 && yaPaso(e);
function occurs(e, a, b) {
  const ini = parse(e.inicio), fin = parse(e.fin);
  if (fin < a || ini > b) return null;
  if (e.sesiones.length > 1) {
    const s = e.sesiones.map(parse).find(x => x >= a && x <= b && !pasadoHoy(e, x));
    return s ? { date: s, ongoing: false } : null;
  }
  if (+ini === +fin) return pasadoHoy(e, ini) ? null : { date: ini, ongoing: false };
  return { date: ini < a ? a : ini, ongoing: ini < a, ini, fin };
}
// plan «largo»: exposición, curso o ciclo de más de una semana (o ya empezado). En las listas van detrás de los planes con fecha
const largo = (e, occ) => !!(occ && occ.ongoing) || (e.sesiones.length <= 1 && (parse(e.fin) - parse(e.inicio)) / 864e5 > 6);
const SEC_LARGOS = '<h2 class="sec-largos">En curso: exposiciones, cursos y ciclos</h2>';
const conSeccion = (lista, html) => { let dentro = false, antes = false; return lista.map((x, i) => { const l = largo(x.e, x.occ); const h = l && !dentro && antes ? SEC_LARGOS : ''; if (l) dentro = true; else antes = true; return h + html(x, i); }).join(''); };
const isFamily = e => e.cats.some(c => c === 'infantil' || c === 'cuentacuentos' || c === 'titeres' || c === 'talleres_familia');
const isPet = e => e.cats.some(c => groupOf(c) === 'mascotas');
// ---------- aprendizaje: guardar, descartar y «fui» mueven pesos por categoría y tema
const SIGNAL = { save: [0.5, 1], unsave: [-0.5, -1], dismiss: [-0.6, -1.2], undismiss: [0.6, 1.2], went: [1, 1.5], unwent: [-1, -1.5] };
// estadísticas de uso (solo si la persona ha dado permiso; ver data.js)
const track = (kind, id, ctx) => { try { if (window.limonTrack) window.limonTrack(kind, id, Object.assign({ tab: state.tab }, ctx || {})); } catch (x) { } };
const TRACK_KIND = { save: 'guardar', unsave: 'quitar', dismiss: 'descartar', undismiss: 'recuperar', went: 'voy', unwent: 'novoy' };
function learn(e, kind) {
  track(TRACK_KIND[kind], e.id);
  const [wc, wt] = SIGNAL[kind];
  e.cats.filter(c => c !== 'sin_categoria').forEach(c => { learned['cat:' + c] = +(((learned['cat:' + c] || 0) + wc).toFixed(2)); });
  (e.temas || []).forEach(t => { learned['tema:' + t] = +(((learned['tema:' + t] || 0) + wt).toFixed(2)); });
  if (e.serie) learned['serie:' + e.serie] = +(((learned['serie:' + e.serie] || 0) + wt).toFixed(2));
  Object.keys(learned).forEach(k => { if (Math.abs(learned[k]) < 0.05) delete learned[k]; else learned[k] = Math.max(-4, Math.min(4, learned[k])); });
  store.set('learned', learned);
}
const isDismissed = e => dismissed.includes(e.id);
let toastTimer = null, toastUndo = null;
function toast(msg, undo, label) {
  $('toast-t').textContent = msg; $('toast-undo').hidden = !undo; $('toast-undo').textContent = label || 'Deshacer'; toastUndo = undo || null;
  $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, label ? 6000 : 5000);
}
