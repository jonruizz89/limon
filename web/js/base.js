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
// «00:00» a secas es como la agenda municipal dice «sin hora»: no es medianoche
const SIN_HORA = /^\s*0?0[:.]00(:00)?\s*h?\s*$/i;
// horarios con principio y fin: «de 10 a 14», «desde las 10:00 hasta las 20:00», «19:30-21:00», «19:30 a 21:00»
const RE_RANGO = /(?:de|desde)\s+(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*h?\s*(?:a|hasta)\s+(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?|(\d{1,2})[:.](\d{2})\s*h?\s*(?:[-–]|\s(?:a|hasta)\s+(?:las\s+)?)\s*(\d{1,2})[:.](\d{2})/gi;
function yaPaso(e) {
  const t = String(e.hora || '');
  if (!t || SIN_HORA.test(t) || /todo el d[ií]a|consult|24 ?h/i.test(t)) return false;
  // todos los tramos que diga («11:00-14:00 + 17:00-20:00», «Turno 1: 18:15-19:45 / Turno 2: 19:45-21:15»)
  const rangos = [...t.matchAll(RE_RANGO)].map(m => m[5] == null ? [+m[1] + (+m[2] || 0) / 60, +m[3] + (+m[4] || 0) / 60] : [+m[5] + +m[6] / 60, +m[7] + +m[8] / 60]);
  const rango = rangos[0];
  const horas = [...t.matchAll(/(\d{1,2})[:.](\d{2})|\b(\d{1,2})\s?h\b/gi)].map(m => +(m[1] || m[3]) + (+m[2] || 0) / 60).filter(h => h < 24);
  const ini = rango ? rango[0] : null, fin = rango ? rango[1] : null;
  const cats = e.cats || [], conHora = cats.some(c => ['musica', 'escena', 'cine', 'deporte'].includes(groupOf(c)));
  // un horario de 3 h o más es de entrar cuando quieras. Un teatro de 20:30 a 23:30 sigue siendo «con hora», salvo que
  // diga varios tramos o uno de 6 h o más (eso ya es un horario de apertura)
  const tramo = rango ? Math.max(...rangos.map(([a, b]) => b - a)) : 0;
  const libre = cats.some(c => LIBRE.has(c)) || /desde/i.test(t) || (tramo >= 3 && (!conHora || rangos.length > 1 || tramo >= 6));
  let finH;
  if (libre) {
    if (rango) {
      if (rangos.some(([a, b]) => b < a)) return false;  // pasa de medianoche («23:30 a 06:00»)
      finH = Math.max(...rangos.map(r => r[1]));          // el último cierre del día
    }
    else if (horas.length) finH = Math.max(...horas) + (/desde/i.test(t) ? 5 : 3);
    else return false;
    if (finH <= 6 || finH >= 24) return false;  // acaba de madrugada: hoy no se oculta
  } else {
    // la última sesión que empieza hoy: las horas de fin de un tramo no cuentan, salvo que a esa hora empiece otro
    const empieza = new Set(rangos.map(r => r[0])), acaba = new Set(rangos.map(r => r[1]));
    const ultima = horas.length ? Math.max(...horas.filter(h => !acaba.has(h) || empieza.has(h))) : ini;
    if (ultima == null || !isFinite(ultima)) return false;
    if (ultima < 6) return false;  // de madrugada: es la noche de hoy, no esta mañana
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

// ---------- arranque: los datos de la zona, las etiquetas, lo guardado en el dispositivo y la fecha de hoy
let DATA, TAX, sync, EV, META, CLOSURES, CITY, CENTER, HAS_CALLE, today, HOY0, BYID;  // se fijan al arrancar (iniciaDatos)
let VISITAS, prefs, opts, saved, streets, dismissed, went, nofui, learned, taste, tasteText;
function iniciaDatos() {
  ({ DATA, TAX, sync } = window.LIMON_INICIO);

  EV = DATA.eventos;
  META = DATA.meta;
  TAX.forEach(g => { GROUP_NAME[g.id] = g.name; g.items.forEach(it => { LABEL[it.id] = it.label; GROUP_OF[it.id] = g.id; }); });
  // número de veces que se ha abierto la app en este navegador (una por sesión): para no repetir presentaciones
  VISITAS = store.get('visitas', 0);
  try { if (!sessionStorage.getItem('limon.ses')) { sessionStorage.setItem('limon.ses', '1'); VISITAS += 1; store.set('visitas', VISITAS); } } catch (e) { }
  prefs = store.get('prefs', null) || {};
  opts = store.get('opts', { ninos: false, perro: false });
  saved = store.get('saved', []);
  streets = store.get('streets', []);
  dismissed = store.get('dismissed', []);
  went = store.get('went', []);
  nofui = store.get('nofui', []);    // planes guardados a los que al final no fue («¿Al final fuiste?» → No)
  learned = store.get('learned', {});
  taste = store.get('taste', null);
  tasteText = store.get('taste_text', '');
  CLOSURES = DATA.closures || [];
  // ciudad elegida: centro, distritos, estadios y secciones disponibles vienen de la tabla de ciudades
  CITY = DATA.city || { id: 'madrid', name: 'Madrid', lat: 40.4168, lng: -3.7038, districts: [], stadiums: [], features: { calle: true } };
  CENTER = [CITY.lat, CITY.lng];
  HAS_CALLE = !!(CITY.features && CITY.features.calle);
  // ---------- fechas
  today = new Date();   today.setHours(0, 0, 0, 0);
  HOY0 = +parse(ymd(new Date()));
  BYID = Object.fromEntries(EV.map(e => [e.id, e]));
}

// ---------- arranque: botones del aviso (deshacer y cerrar)
function iniciaAviso() {
  $('toast-undo').addEventListener('click', () => { $('toast').hidden = true; if (toastUndo) toastUndo(); toastUndo = null; });
  $('toast-x').addEventListener('click', () => { $('toast').hidden = true; toastUndo = null; clearTimeout(toastTimer); });
}

// ---------- arranque: clics en enlaces a las webs de los planes
function iniciaEnlacesExternos() {
  // enlaces que sacan de Limón (web del organizador, fuente, cómo llegar): señal fuerte de interés
  document.addEventListener('click', ev => {
    const a = ev.target.closest('.card a[target="_blank"]'); if (!a) return;
    const c = a.closest('[data-eid]'); if (!c) return;
    track('web', c.dataset.eid, { tipo: /google\.com\/maps/.test(a.href) ? 'mapa' : /organizador/i.test(a.textContent) ? 'organizador' : 'fuente' });
  }, true);
}

// ---------- arranque: lo que data.js necesita de la app (sincronizar con la cuenta, repintar…)
function entregaApp() {
  // lo que usa data.js para sincronizar la cuenta
  window.LIMON_INICIO.listo({
    get: () => ({ prefs, opts, saved, streets, dismissed, went, nofui, learned, taste }),
    setUser(v) { logged = v; Object.keys(aiReco).forEach(k => delete aiReco[k]); renderAll(); loadMe(); loadInvites(); loadSocial(); loadIdeas(); loadPast(); },
    set(p) {
      if (p.prefs) prefs = p.prefs; if (p.opts) opts = Object.assign({}, opts, p.opts, { dist: opts.dist });  // la distancia es de cada dispositivo: la cuenta no la pisa
      if (p.saved) saved = p.saved; if (p.streets) streets = p.streets;
      if (p.dismissed) dismissed = p.dismissed; if (p.went) went = p.went; if (p.nofui) nofui = p.nofui; if (p.learned) learned = p.learned;
      if ('taste' in p) { taste = p.taste; try { localStorage.setItem('bureo.taste', JSON.stringify(taste)); } catch (e) { } }
      if ('taste_text' in p) { tasteText = p.taste_text || ''; try { localStorage.setItem('bureo.taste_text', JSON.stringify(tasteText)); } catch (e) { } }
      if ('taste' in p || 'taste_text' in p) { Object.keys(aiReco).forEach(k => delete aiReco[k]); if (!p.prefs) { renderAll(); return; } }
      store.set('prefs', prefs); store.set('opts', opts); store.set('saved', saved); store.set('streets', streets);
      store.set('dismissed', dismissed); store.set('went', went); store.set('nofui', nofui); store.set('learned', learned); renderAll(); loadPast();
    }
  });
}

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicTema(ev) {
  const tm = ev.target.closest('[data-tema]');
  if (tm) {
    const t = tm.dataset.tema;
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    store.set('tema', t); pintaTema(); renderAll(); return true;
  }
  return false;
}
