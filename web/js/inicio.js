// Limón · inicio: estado, eventos de interfaz y arranque
// Se carga cuando llegan los datos (js/app.js) y se ejecuta de una vez, en este orden.
const { DATA, TAX, sync } = window.LIMON_INICIO;

const EV = DATA.eventos;
const META = DATA.meta;
TAX.forEach(g => { GROUP_NAME[g.id] = g.name; g.items.forEach(it => { LABEL[it.id] = it.label; GROUP_OF[it.id] = g.id; }); });
// número de veces que se ha abierto la app en este navegador (una por sesión): para no repetir presentaciones
let VISITAS = store.get('visitas', 0);
try { if (!sessionStorage.getItem('limon.ses')) { sessionStorage.setItem('limon.ses', '1'); VISITAS += 1; store.set('visitas', VISITAS); } } catch (e) { }
let prefs = store.get('prefs', null) || {};
let opts = store.get('opts', { ninos: false, perro: false });
let saved = store.get('saved', []);
let streets = store.get('streets', []);
let dismissed = store.get('dismissed', []);
let went = store.get('went', []);
let nofui = store.get('nofui', []);  // planes guardados a los que al final no fue («¿Al final fuiste?» → No)
let learned = store.get('learned', {});
let taste = store.get('taste', null);
let tasteText = store.get('taste_text', '');
const CLOSURES = DATA.closures || [];
// ciudad elegida: centro, distritos, estadios y secciones disponibles vienen de la tabla de ciudades
const CITY = DATA.city || { id: 'madrid', name: 'Madrid', lat: 40.4168, lng: -3.7038, districts: [], stadiums: [], features: { calle: true } };
const CENTER = [CITY.lat, CITY.lng];
const HAS_CALLE = !!(CITY.features && CITY.features.calle);
// ---------- fechas
const today = new Date(); today.setHours(0, 0, 0, 0);
const HOY0 = +parse(ymd(new Date()));
const BYID = Object.fromEntries(EV.map(e => [e.id, e]));
// ---------- filtros: zona, hora del día, días y precio (compartidos por Para ti y Explorar)
let F = Object.assign({ dist: '', near: 0, pos: null, franja: '', dias: '', precio: '' }, store.get('filters', {}));
F.pos = null; F.near = 0;  // la ubicación no se guarda: se pide cada vez
// si ya diste permiso antes (o activaste la opción), se usa sin volver a preguntar
try {
  if (opts.dist) askPos(true);
  else if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') askPos(true); }).catch(() => { });
} catch (e) { }
const DISTRITOS = (CITY.districts || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
// ---------- municipio elegido: sus planes primero y después los de alrededor, del más cercano al más lejano
const ZONE = CITY.muni ? { name: CITY.muni, c: [CITY.lat, CITY.lng], r: 40 } : null;
if (ZONE) {  // radio: el menor que junte un buen puñado de planes este mes (un pueblo pequeño mira más lejos)
  const t0 = new Date(), t1 = new Date(Date.now() + 30 * 864e5);
  const near = EV.filter(e => e.lat || e.distrito === ZONE.name).filter(e => occurs(e, t0, t1)).map(zkm);
  ZONE.own = near.filter(d => d === 0).length;
  ZONE.r = [5, 10, 15, 25, 40].find(r => near.filter(d => d <= r).length >= 40) || 40;
}
// ---------- planes nuevos: los que no habías visto en este dispositivo antes de esta visita.
// «Visto» = la ficha estuvo en pantalla. La lista de vistos se guarda por zona y solo en este dispositivo.
// La primera vez en una zona no sabemos qué viste: cuentan como nuevos los planes que entraron en Limón en las últimas 24 horas.
// ?nuevos=reset: olvida lo visto en este dispositivo (vuelven a salir como nuevos los planes de las últimas 24 h)
if (new URLSearchParams(location.search).get('nuevos') === 'reset') {
  try { Object.keys(localStorage).filter(k => /^bureo\.seen\d?\./.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { }
  history.replaceState(null, '', location.pathname);
}
const SEEN_KEY = 'seen3.' + window.limonCity.zone();
const seen0 = store.get(SEEN_KEY, null), first = !(Array.isArray(seen0) && seen0.length);
const sinAlta = EV.length && !EV.some(e => e.alta);  // datos de una versión vieja: no se puede saber qué es nuevo, mejor no guardar nada
const muchos = EV.filter(reciente0).length > EV.length * 0.3;  // zona recién cargada entera: no tendría sentido marcarlo todo
const NEW = new Set(EV.filter(e => first ? reciente(e) : !seen0.includes(e.id)).map(e => e.id));
const seenNow = new Set(first ? EV.filter(e => !reciente(e)).map(e => e.id) : seen0.filter(id => BYID[id]));
saveSeen();
const seenObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => {
  if (!x.isIntersecting) return; const id = x.target.dataset.eid; seenObs.unobserve(x.target);
  if (id && !seenNow.has(id)) { seenNow.add(id); saveSeen(); }
}), { threshold: 0.6 }) : null;
const TEMPORADA = TEMPORADAS.find(t => enVentana(t.ver, md(today))) || null;
const AHORRO = !!(navigator.connection && navigator.connection.saveData);
window.addEventListener('popstate', ev => {
  if (fichaHist && !(ev.state && ev.state.ev)) { state.open[fichaHist] = false; fichaHist = null; renderAll(); }
});
// icono de compartir como el del sistema: en Apple, la caja con la flecha; en el resto, los tres puntos unidos
const SHARE_ICO = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)
  ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg>'
  : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>';
const C_ZONA = window.limonCity.zone().split('|')[0];
// ---------- avisos de calle en cada evento: cortes y cierres cerca del lugar ese día
// cada tramo lleva su nombre; un tramo a más de 2,5 km del resto del corte es una calle mal situada (homónima de otro barrio) y se ignora
const GEOCUTS = CLOSURES.filter(c => c.geom).map(c => {
  let segs = (c.geom.segs || []).filter(s => s.l && s.l.length).map(s => ({ l: s.l, n: s.n }));
  if (segs.length >= 3) {
    const cen = segs.map(s => [s.l.reduce((a, p) => a + p[0], 0) / s.l.length, s.l.reduce((a, p) => a + p[1], 0) / s.l.length]);
    const med = i => cen.map(x => x[i]).sort((a, b) => a - b)[cen.length >> 1], mc = [med(0), med(1)];
    const ok = segs.filter((s, i) => km(cen[i], mc) <= 2.5);
    if (ok.length) segs = ok;
  }
  return { c, segs, pts: c.geom.pts || [] };
});
// ---------- estadios: unir cortes con el partido o concierto de ese día
const STADIUMS = (CITY.stadiums || []).map(x => ({ re: new RegExp(x.re, 'i'), name: x.name, ll: x.ll, big: !!x.big }));
fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CENTER[0]}&longitude=${CENTER[1]}&hourly=precipitation_probability&daily=precipitation_probability_max&timezone=Europe%2FMadrid&forecast_days=8`)
  .then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.daily) return;
    const R = { daily: {}, hourly: {} };
    j.daily.time.forEach((d, i) => { R.daily[d] = j.daily.precipitation_probability_max[i] || 0; });
    j.hourly.time.forEach((t, i) => { const d = t.slice(0, 10); (R.hourly[d] = R.hourly[d] || [])[+t.slice(11, 13)] = j.hourly.precipitation_probability[i] || 0; });
    RAIN = R; renderAll();
  }).catch(() => { });
if (window.limonAvisos) window.limonAvisos().then(a => { AVISOS = a || []; if (AVISOS.length) renderAll(); });
let TOPICS = store.get('topics', []);  // [{ kind: 'sala' | 'ciclo' | 'tema' | 'artista', value }]
let DIARY = store.get('diary', {});    // 'e123' → { rating, note }
const ORIGIN = location.origin + location.pathname;
let ventajas = store.get('ventajas', []);
// ---------- cuenta: organizadores, revisión (admin) y calendario
const CONF = window.BUREO_CONFIG;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// ---------- proponer instalar la app: a partir de la 3.ª visita, en el móvil, y nunca más si se descarta
const esSafariIOS = isIOS && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
window.addEventListener('limon-install', () => { if (state.tab === 'parati') renderAll(); });
window.addEventListener('appinstalled', () => { store.set('instalar_no', true); renderAll(); });
clearBadge(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') clearBadge(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(refreshPush).catch(e => console.warn('sw', e));
pageVersion().then(v => { myVersion = v; });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (!hiddenAt || Date.now() - hiddenAt < 10 * 60e3) return;
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => { });
  const v = await pageVersion();
  const busy = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.querySelector('dialog[open]');
  if (v && myVersion && v !== myVersion && !busy) location.reload();
});
document.addEventListener('change', async ev => {
  const vj = ev.target.closest('[data-ventaja]');
  if (vj) {
    ventajas = vj.checked ? ventajas.concat(vj.dataset.ventaja) : ventajas.filter(x => x !== vj.dataset.ventaja); store.set('ventajas', ventajas);
    const sb = sbx(), id = uid(); if (sb && id) sb.from('profiles').update({ ventajas }).eq('id', id);
    renderFilters();
    renderAll(); return;
  }
  const lt = ev.target.closest('[data-li-toggle]');
  if (lt) {
    const l = MYLISTS.find(x => x.id === +lt.dataset.liToggle), evId = lt.dataset.ev, sb = sbx();
    if (lt.checked) await sb.from('list_items').insert({ list_id: l.id, event_id: +evId.slice(1) }); else await sb.from('list_items').delete().eq('list_id', l.id).eq('event_id', +evId.slice(1));
    await sb.from('user_lists').update({ updated_at: new Date().toISOString() }).eq('id', l.id);
    toast(lt.checked ? `Añadido a «${l.title}».` : `Quitado de «${l.title}».`); await loadSocial(); return;
  }
  const dm = ev.target.closest('[data-demo]');
  if (dm && me) {
    const db = window.limonDB, u = db && db.user(); if (!u) return;
    const v = dm.value === '' ? null : dm.dataset.demo === 'birth_year' ? +dm.value : dm.value;
    const { error } = await db.sb.from('profiles').update({ [dm.dataset.demo]: v }).eq('id', u.id);
    if (error) { toast('No se ha podido guardar: ' + error.message); return; }
    me[dm.dataset.demo] = v; toast('Guardado.'); return;
  }
  const pc = ev.target.closest('[data-push]');
  if (pc && me) {
    const db = window.limonDB, u = db && db.user(); if (!u) return;
    me.notify = Object.assign({}, me.notify || {}); me.notify.push = Object.assign({}, me.notify.push || {}, { [pc.dataset.push]: pc.checked });
    const { error } = await db.sb.from('profiles').update({ notify: me.notify }).eq('id', u.id);
    toast(error ? 'No se ha podido guardar: ' + error.message : pc.checked ? 'Activado.' : 'Desactivado.'); return;
  }
  const cb = ev.target.closest('[data-notify]'); if (!cb || !me) return;
  const db = window.limonDB, u = db && db.user(); if (!u) return;
  me.notify = Object.assign({ semanal: false, calle: false, lluvia: false, organizador: true, admin: true, quedadas: true, amigos: true, ideas: true }, me.notify || {}, { [cb.dataset.notify]: cb.checked });
  const { error } = await db.sb.from('profiles').update({ notify: me.notify }).eq('id', u.id);
  toast(error ? 'No se ha podido guardar: ' + error.message
    : cb.dataset.notify === 'calle' && cb.checked && !streets.length && !saved.length ? 'Activado. Guarda planes o añade tus calles en «Calle» para recibir avisos.'
    : cb.checked ? 'Activado.' : 'Desactivado.');
  renderAccountExtras();
});
document.addEventListener('submit', async ev => {
  const db = window.limonDB, u = db && db.user();
  if (ev.target.id === 'idea-form') {
    ev.preventDefault(); const f = new FormData(ev.target);
    $('idea-msg').textContent = 'Enviando…';
    const { error } = await db.sb.from('ideas').insert({ author: u.id, kind: f.get('kind'), title: String(f.get('title')).trim(), body: String(f.get('body') || '').trim() || null });
    if (error) { $('idea-msg').textContent = error.message; return; }
    IDEAS_SIM = []; IDEAS_TAB = 'nuevas'; flushMail(); await loadIdeas(); toast('¡Gracias! La revisamos y en cuanto la aprobemos saldrá en el tablón.'); return;
  }
  const ia = ev.target.closest('[data-idea-adm]');
  if (ia) {
    ev.preventDefault(); const f = new FormData(ia);
    const { error } = await db.sb.from('ideas').update({ status: f.get('s'), admin_note: String(f.get('n') || '').trim() || null }).eq('id', +ia.dataset.ideaAdm);
    toast(error ? 'No se ha podido: ' + error.message : 'Guardado.'); flushMail(); await loadIdeas(); return;
  }
  if (ev.target.id === 'soc-form') {
    ev.preventDefault(); const f = new FormData(ev.target);
    const username = String(f.get('username') || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) { $('soc-msg').textContent = 'El usuario debe tener de 3 a 20 caracteres: letras sin tildes, números, punto o guion bajo.'; return; }
    $('soc-msg').textContent = 'Guardando…';
    const { error } = await db.sb.from('profiles').update({ username, display_name: String(f.get('name')).trim(), bio: String(f.get('bio') || '').trim() || null,
      is_public: f.get('vis') === 'pub', findable_email: !!f.get('findable') }).eq('id', u.id);
    if (error) { $('soc-msg').textContent = /duplicate|unique/i.test(error.message) ? 'Ese usuario ya existe: prueba otro.' : 'No se ha podido guardar: ' + error.message; return; }
    SOC.editing = false; await loadSocial(); toast('Perfil guardado.'); return;
  }
  if (ev.target.id === 'soc-search') {
    ev.preventDefault(); const q = String(new FormData(ev.target).get('q') || '').trim(); if (q.length < 2) return;
    const { data } = await db.sb.rpc('profile_search', { p_q: q }); SOC.results = data || []; SOC.lastQ = q; SOC.resultsMsg = 'No he encontrado a nadie con ese nombre o usuario.'; renderSocial(); return;
  }
  if (ev.target.id === 'seguir-form') {
    ev.preventDefault(); const v = String(new FormData(ev.target).get('v') || '').trim(); if (v.length < 2) return;
    const tema = Object.values(BYID).some(e => (e.temas || []).some(t => nf(t) === nf(v)));
    if (!following(tema ? 'tema' : 'artista', v)) await toggleTopic(tema ? 'tema' : 'artista', v); return;
  }
  const nl = ev.target.closest('[data-newlist]');
  if (nl) {
    ev.preventDefault(); const f = new FormData(nl), e = BYID[nl.dataset.newlist];
    const { data, error } = await db.sb.from('user_lists').insert({ owner: u.id, title: String(f.get('t')).trim(), is_public: !!f.get('pub') }).select('id').single();
    if (error) { toast('No se ha podido crear: ' + error.message); return; }
    await db.sb.from('list_items').insert({ list_id: data.id, event_id: +e.id.slice(1) });
    toast('Lista creada con este plan.'); await loadSocial(); return;
  }
  const nf2 = ev.target.closest('[data-note-form]');
  if (nf2) { ev.preventDefault(); await saveDiary(nf2.dataset.noteForm, { note: String(new FormData(nf2).get('note') || '').trim() || null }); toast('Apunte guardado.'); renderAll(); return; }
  const inf = ev.target.closest('[data-invite-form]');
  if (inf) {
    ev.preventDefault(); if (!u) return;
    const e = BYID[inf.dataset.inviteForm], f = new FormData(inf), from = String(f.get('from') || '').trim(), note = String(f.get('note') || '').trim();
    store.set('myname', from);
    const occ = occurs(e, today, addDays(today, 400));
    const { data, error } = await db.sb.from('plan_invites').insert({ owner: u.id, event_id: +e.id.slice(1), on_date: occ && !occ.ongoing ? ymd(occ.date) : null, from_name: from, note: note || null }).select('token').single();
    if (error) { toast('No se ha podido crear: ' + error.message); return; }
    if (!saved.includes(e.id)) { saved = saved.concat(e.id); store.set('saved', saved); learn(e, 'save'); }
    state.inviting = null; await loadInvites();
    track('quedar', e.id);
    shareInvite(e, data.token, from);
    return;
  }
  if (ev.target.id === 'q-form') {
    ev.preventDefault();
    const f = new FormData(ev.target), name = String(f.get('name') || '').trim(), st = ev.submitter && ev.submitter.value;
    if (!name || !st) return;
    store.set('myname', name);
    const { data, error } = await db.sb.rpc('invite_reply', { p_token: QD.token, p_device: deviceKey(), p_name: name, p_status: st });
    if (error) { toast(error.message); return; }
    QD.data = data; store.set('rsvp:' + QD.token, st);
    const e = BYID['e' + data.event_id];
    if (st === 'voy' && e && !saved.includes(e.id)) { saved = saved.concat(e.id); store.set('saved', saved); learn(e, 'save'); }
    toast(st === 'voy' ? '¡Apuntado! Lo tienes en tu agenda.' : st === 'quizas' ? 'Anotado como «quizá».' : 'Anotado: no puedes ir.');
    renderQuedar(); renderAll();
    return;
  }
  if (ev.target.id === 'ed-form') {
    ev.preventDefault(); const f = new FormData(ev.target);
    const { error } = await db.sb.from('profiles').update({ organizer: { nombre: f.get('nombre'), web: f.get('web'), que: f.get('que') }, editor_status: 'solicitado' }).eq('id', u.id);
    $('ed-msg').textContent = error ? 'No se ha podido enviar: ' + error.message : 'Enviado.'; if (!error) { flushMail(); loadMe(); }
  }
  if (ev.target.id === 'org-form') {
    ev.preventDefault(); const f = new FormData(ev.target), id = ev.target.dataset.id;
    const row = { title: f.get('title').trim(), starts_on: f.get('starts_on'), ends_on: f.get('ends_on') || f.get('starts_on'), time_text: f.get('time_text').trim() || null,
      price_text: f.get('price_text').trim() || null, venue_name: f.get('venue_name').trim() || null, address: f.get('address').trim() || null,
      url: f.get('url').trim() || null, description: f.get('description').trim() || null, is_free: !!f.get('is_free'), status: 'revision' };
    if (row.ends_on < row.starts_on) { $('org-msg').textContent = 'La fecha de fin es anterior a la de inicio.'; return; }
    $('org-msg').textContent = 'Guardando…';
    const r = id ? await db.sb.from('submitted_events').update(row).eq('id', +id).select('id').single()
      : await db.sb.from('submitted_events').insert(Object.assign({ owner: u.id, city_id: CITY.id }, row)).select('id').single();
    if (r.error) { $('org-msg').textContent = 'No se ha podido guardar: ' + r.error.message; return; }
    $('org-msg').textContent = 'Revisando…';
    const res = await db.fn('limon-org', { id: r.data.id });
    flushMail(); orgEdit = null; await loadMe();
    toast(res.error ? res.error : res.estado === 'publicado' ? 'Publicado. Saldrá en Limón al recargar la página.' : (res.motivo || 'Enviado a revisión.'));
  }
});
let fuiSnooze = store.get('fui_snooze', {});
let fuiFocus = new URLSearchParams(location.search).get('fui');
fetch('/planes/finde.json').then(r => r.ok ? r.json() : {}).then(j => { FINDE = j || {}; renderAll(); }).catch(() => { FINDE = {}; });
EV.forEach(e => { if (parse(e.fin) >= today) e.cats.forEach(c => { counts[c] = (counts[c] || 0) + 1; }); });
// ---------- eventos de interfaz
const tabs = ['parati', 'calle', 'unicos', 'explorar', 'agenda', 'intereses', 'fuentes'].filter(t => t !== 'calle' || HAS_CALLE);
// nombre de la ciudad en textos fijos; sin datos de cortes, la pestaña Calle no aparece
document.querySelectorAll('.cityname').forEach(x => { x.textContent = CITY.name; });
document.title = (window.LIMON_STAGING ? '[Pruebas] ' : '') + 'Limón · ' + CITY.name;
// redes de la zona (cities.features.instagram / .x): solo se enseñan las que existen, como iconos
{ const f = CITY.features || {}, ok = v => v && /^[a-z0-9._]{1,30}$/i.test(v);
  const svg = (n, d) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const redes = [
    ok(f.instagram) && { url: 'https://www.instagram.com/' + f.instagram + '/', nombre: 'Instagram: @' + f.instagram,
      d: '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></g><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>' },
    ok(f.x) && { url: 'https://x.com/' + f.x, nombre: 'X: @' + f.x,
      d: '<path fill="currentColor" d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9zm-1.1 16.2h1.7L7.4 4.7H5.6z"/>' }
  ].filter(Boolean);
  if (redes.length) {
    const a = (r, n, cls, st) => `<a class="${cls}" href="${r.url}" target="_blank" rel="noopener" title="${esc(r.nombre)}" aria-label="${esc(r.nombre)}" style="${st}">${svg(n, r.d)}</a>`;
    const box = $('ig-perfil'); box.innerHTML = redes.map(r => a(r, 22, 'btn ghost', 'display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0')).join(''); box.hidden = false;
    const p = $('ig-pt'); p.innerHTML = redes.map(r => a(r, 24, '', 'color:inherit;display:inline-flex;padding:10px')).join(''); p.hidden = false;
  } }
// textos de la pestaña Calle propios de cada ciudad (tabla cities, campo features)
{ const f = CITY.features || {};
  if (f.calle_lead) $('ca-lead').textContent = f.calle_lead;
  if (f.calle_fuentes) $('ca-src').textContent = f.calle_fuentes;
  if (f.calle_ejemplo) $('ca-street').placeholder = f.calle_ejemplo; }
if (!HAS_CALLE) { ['t-calle'].forEach(id => { const el = $(id); if (el) el.hidden = true; }); document.querySelectorAll('[data-bnav="calle"]').forEach(b => { b.hidden = true; b.style.display = 'none'; }); }
tabs.forEach(t => $('t-' + t).addEventListener('click', ev => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return; ev.preventDefault(); go(t); }));
document.querySelectorAll('[data-when]').forEach(b => b.addEventListener('click', () => { state.when = b.dataset.when; state.ptShown = 12; renderParaTi(); }));
$('pt-free').addEventListener('click', () => setF('precio', 'gratis'));
// en Para ti solo se ven los mejores de esta semana; los nuevos se repasan todos, por fecha, en Explorar
document.querySelectorAll('[data-fventaja]').forEach(b => b.addEventListener('click', () => { F.ventaja = !F.ventaja; renderAll(); }));
document.querySelectorAll('[data-ftemp]').forEach(b => b.addEventListener('click', () => { F.temp = !F.temp; store.set('filters', F); track('filtro', null, { temporada: TEMPORADA && TEMPORADA.id, on: F.temp }); renderAll(); }));
document.querySelectorAll('[data-nuevos]').forEach(b => b.addEventListener('click', () => { F.nuevos = !F.nuevos; if (F.nuevos && state.tab === 'parati') go('explorar'); else renderAll(); }));
$('pt-more').addEventListener('click', () => { state.ptShown += 12; renderParaTi(); });
$('ex-more').addEventListener('click', () => { state.exShown += 20; renderExplorar(); });
['ex-q', 'ex-grp', 'ex-when'].forEach(id => $(id).addEventListener('input', () => { state.exShown = 20; renderExplorar(); }));
$('ex-free').addEventListener('click', () => setF('precio', 'gratis'));
document.addEventListener('change', ev => { const sl = ev.target.closest('[data-fsel]'); if (sl) { F[sl.dataset.fsel] = ''; setF(sl.dataset.fsel, sl.value); } });
$('ex-grp').innerHTML = '<option value="">Todas las categorías</option>' + TAX.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
$('in-q').addEventListener('input', renderIntereses);
$('ca-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const v = $('ca-street').value.trim();
  if (v && !streets.some(x => streetKey(x) === streetKey(v))) { streets = streets.concat(v); store.set('streets', streets); }
  $('ca-street').value = ''; renderAll();
});
$('q-global').addEventListener('input', () => {
  clearTimeout(qTimer); qTimer = setTimeout(() => { const q = $('q-global').value.trim(); if (q.length >= 3) track('buscar', null, { q: q.slice(0, 80) }); }, 1500);
  $('ex-q').value = $('q-global').value;
  // al buscar se mira todo lo disponible; al vaciar la búsqueda vuelve el rango que había
  const qv = $('q-global').value.trim();
  if (qv && state.whenAntesBuscar == null) { state.whenAntesBuscar = $('ex-when').value; $('ex-when').value = 'todo'; }
  else if (!qv && state.whenAntesBuscar != null) { $('ex-when').value = state.whenAntesBuscar; state.whenAntesBuscar = null; }
  state.exShown = 20;
  if (state.tab !== 'explorar') go('explorar'); else renderExplorar();
  $('q-global').focus();
});
$('ex-q').addEventListener('input', () => { $('q-global').value = $('ex-q').value; });
$('o-ninos').addEventListener('change', e => { opts.ninos = e.target.checked; store.set('opts', opts); });
$('o-stats').checked = !!(window.limonConsent && window.limonConsent.get() === '1');
$('o-stats').addEventListener('change', async e => { await window.limonConsent.set(e.target.checked); toast(e.target.checked ? 'Gracias por ayudar.' : 'Hecho: dejamos de guardar estadísticas de tu uso.'); renderAll(); });
$('o-perro').addEventListener('change', e => { opts.perro = e.target.checked; store.set('opts', opts); });
$('o-dist').addEventListener('change', e => { opts.dist = e.target.checked; store.set('opts', opts); if (opts.dist) askPos(false); else { userPos = null; renderAll(); } });
$('in-reset').addEventListener('click', () => { prefs = Object.assign({}, SAMPLE); store.set('prefs', prefs); renderIntereses(); });
$('in-clear').addEventListener('click', () => { prefs = {}; store.set('prefs', prefs); renderIntereses(); });
$('ts-go').addEventListener('click', async () => {
  const text = $('ts-text').value.trim();
  if (text.length < 8) { $('ts-msg').textContent = 'Cuéntame un poco más.'; return; }
  $('ts-go').disabled = true; $('ts-msg').textContent = 'Interpretando…';
  const res = await window.limonAI({ action: 'taste', text });
  $('ts-go').disabled = false;
  if (!res || res.error) { $('ts-msg').textContent = (res && res.error) || 'No se ha podido conectar. Prueba en un rato.'; return; }
  tasteText = text; store.set('taste_text', text); setTaste(res.taste);
  $('ts-msg').textContent = 'Listo. Para ti ya usa este perfil.'; renderIntereses();
});
$('near-go').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Tu navegador no permite saber dónde estás.'); return; }
  $('near-go').disabled = true; $('near-go').textContent = 'Buscando dónde estás…';
  navigator.geolocation.getCurrentPosition(p => {
    nearPos = [p.coords.latitude, p.coords.longitude]; userPos = nearPos; keepDist();
    $('near-go').disabled = false; $('near-go').textContent = '📍 Ahora cerca de ti';
    if (km(nearPos, CENTER) > 25) toast(`Pareces estar fuera de ${CITY.name}: te enseño lo que hay cerca del centro.`), nearPos = CENTER;
    $('near').hidden = false; $('near-go').hidden = true; renderNear(); $('near').scrollIntoView({ behavior: 'smooth' });
  }, () => { $('near-go').disabled = false; $('near-go').textContent = '📍 Ahora cerca de ti'; toast('Sin permiso de ubicación no puedo saber qué tienes cerca.'); }, { timeout: 12000, maximumAge: 120000 });
});
$('near-close').addEventListener('click', () => { $('near').hidden = true; $('near-go').hidden = false; });
$('toast-undo').addEventListener('click', () => { $('toast').hidden = true; if (toastUndo) toastUndo(); toastUndo = null; });
$('toast-x').addEventListener('click', () => { $('toast').hidden = true; toastUndo = null; clearTimeout(toastTimer); });
document.addEventListener('click', ev => {
  // enlaces de la app (pestañas, planes): clic normal se queda en la app; Ctrl/Cmd/Mayús o botón central, pestaña nueva
  const lk = ev.target.closest('a[data-goto], a[data-open]');
  if (lk) { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return; ev.preventDefault(); }
  if (ev.target.closest('#org, #adm, #ag-cal, #mail') && ev.target.closest('button, a[data-copy]')) { onAccountClick(ev).then(done => { if (done) ev.preventDefault(); }); if (ev.target.closest('[data-org-new],[data-org-edit],[data-org-cancel],[data-org-retire],[data-adm-ed],[data-adm-pub],[data-adm-idea],[data-copy],[data-mail-test]')) return; }
  const ck = ev.target.closest('[data-cakind]');
  if (ck) { state.caKind = ck.dataset.cakind; renderCalle(); return; }
  const cd = ev.target.closest('[data-caday]');
  if (cd) { state.caDay = cd.dataset.caday; renderCalle(); return; }
  const cg = ev.target.closest('[data-caday-go]');
  if (cg) { state.caDay = cg.dataset.cadayGo; go('calle'); return; }
  const rt = ev.target.closest('[data-rmtema]');
  if (rt) { const t = Object.assign({}, taste); t.temas = t.temas.filter((_, i) => i !== +rt.dataset.rmtema); setTaste(t); renderIntereses(); return; }
  const rc = ev.target.closest('[data-rmtcat]');
  if (rc) { const t = Object.assign({}, taste); t.categorias = t.categorias.filter(c => c.id !== rc.dataset.rmtcat); setTaste(t); renderIntereses(); return; }
  if (ev.target.closest('[data-ai-refresh]')) { loadAI(state.when, true); renderParaTi(); return; }
  const ft = ev.target.closest('[data-ftoggle]');
  if (ft) { const p = $(ft.dataset.ftoggle + '-fpanel'); p.hidden = !p.hidden; ft.setAttribute('aria-expanded', !p.hidden); renderFilters(); return; }
  const fs = ev.target.closest('[data-fset]');
  if (fs) { setF(fs.dataset.fset, fs.dataset.fval); return; }
  if (ev.target.closest('[data-fclear]')) { F = { dist: '', near: 0, pos: F.pos, franja: '', dias: '', precio: '', temp: false }; setF('dist', ''); return; }
  const cm = ev.target.closest('[data-cutmap]');
  if (cm) { focusCut(+cm.dataset.cutmap); return; }
  const cgo = ev.target.closest('[data-cutgo]');
  if (cgo) { goCut(+cgo.dataset.cutgo); return; }
  const rm = ev.target.closest('[data-rmstreet]');
  if (rm) { streets = streets.filter((_, i) => i !== Number(rm.dataset.rmstreet)); store.set('streets', streets); renderAll(); return; }
  const ff = ev.target.closest('[data-f-cat], [data-f-tema], [data-f-serie]');
  if (ff) {
    const kind = ff.dataset.fCat ? 'cat' : ff.dataset.fTema ? 'tema' : 'serie';
    state.filter = { kind, value: ff.dataset.fCat || ff.dataset.fTema || ff.dataset.fSerie };
    $('q-global').value = ''; $('ex-q').value = ''; $('ex-grp').value = ''; $('ex-when').value = 'todo';
    state.exShown = 20; go('explorar'); return;
  }
  if (ev.target.closest('#ex-clear')) { state.filter = null; state.exShown = 20; renderExplorar(); return; }
  const gt = ev.target.closest('[data-goto]');
  if (gt) { if (gt.dataset.fold) openFold(gt.dataset.fold, true); go(gt.dataset.goto); return; }
  const s = ev.target.closest('[data-save]');
  if (s) {
    const id = s.dataset.save, on = !saved.includes(id);
    saved = on ? saved.concat(id) : saved.filter(x => x !== id); store.set('saved', saved);
    if (BYID[id]) learn(BYID[id], on ? 'save' : 'unsave');
    // al repintar, la lista puede reordenarse (aprende de lo guardado): la tarjeta tocada se queda donde estaba en pantalla
    const art = s.closest('article'), y0 = art ? art.getBoundingClientRect().top : null, vista = art && art.closest('section, .view, [id^="v-"]');
    renderAll();
    if (y0 != null && vista) {
      const otra = [...vista.querySelectorAll('[data-save]')].find(b => b.dataset.save === id);
      const a2 = otra && otra.closest('article');
      if (a2) window.scrollBy(0, a2.getBoundingClientRect().top - y0);
    }
    const deshacer = () => { saved = on ? saved.filter(x => x !== id) : saved.concat(id); store.set('saved', saved); if (BYID[id]) learn(BYID[id], on ? 'unsave' : 'save'); renderAll(); };
    if (on && !logged && (saved.length === 1 || saved.length === 3)) toast('Guardado. Con una cuenta gratis te avisamos antes de que empiece.', () => go('intereses'), 'Crear cuenta');
    else toast(on ? 'Guardado en tu agenda.' : 'Quitado de tu agenda.', deshacer);
    return;
  }
  const dm = ev.target.closest('[data-dismiss]');
  if (dm) {
    const id = dm.dataset.dismiss, on = !dismissed.includes(id);
    dismissed = on ? dismissed.concat(id) : dismissed.filter(x => x !== id); store.set('dismissed', dismissed);
    if (BYID[id]) learn(BYID[id], on ? 'dismiss' : 'undismiss');
    if (on) toast('No volverá a salir en tus recomendaciones.', () => { dismissed = dismissed.filter(x => x !== id); store.set('dismissed', dismissed); learn(BYID[id], 'undismiss'); renderAll(); });
    renderAll(); return;
  }
  const wn = ev.target.closest('[data-went]');
  if (wn) {
    const id = wn.dataset.went, on = !went.includes(id);
    went = on ? went.concat(id) : went.filter(x => x !== id); store.set('went', went);
    if (BYID[id]) learn(BYID[id], on ? 'went' : 'unwent');
    if (on) toast('Anotado. Te recomendaremos más planes así.');
    renderAll(); return;
  }
  if (ev.target.closest('[data-sheet-close]')) { closeSheets(); return; }
  if (ev.target.closest('#city-btn') || ev.target.closest('[data-zone-pick]')) { openZone(); return; }
  if (ev.target.closest('[data-nuevos-ver]')) { F.nuevos = true; go('explorar'); return; }
  if (ev.target.closest('[data-intereses-rapido]')) { interesesRapido(); return; }
  const tm = ev.target.closest('[data-tema]');
  if (tm) {
    const t = tm.dataset.tema;
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    store.set('tema', t); pintaTema(); renderAll(); return;
  }
  const cu = ev.target.closest('[data-cuando]'); if (cu) { abrirCalendario(cu.dataset.cuando); return; }
  const cq = ev.target.closest('[data-calq]');
  if (cq && CAL) { if (CAL.ctx === 'ca') { state.caDay = cq.dataset.calq; closeSheets(); renderCalle(); } else aplicaCuando(CAL.ctx, cq.dataset.calq); return; }
  const cmes = ev.target.closest('[data-calm]'); if (cmes && CAL) { CAL.mes = new Date(CAL.mes.getFullYear(), CAL.mes.getMonth() + +cmes.dataset.calm, 1); pintaCal(); return; }
  const cdia = ev.target.closest('[data-cald]');
  if (cdia && CAL) {
    const f = new Date(+cdia.dataset.cald);
    if (CAL.ctx === 'ca') { state.caOtro = f; state.caDay = +f === +today ? 'hoy' : +f === +addDays(today, 1) ? 'manana' : 'otro'; closeSheets(); renderCalle(); return; }
    if (!CAL.sel || CAL.sel[1] || f < CAL.sel[0]) CAL.sel = [f, null];  // primer día (o se empieza de nuevo)
    else CAL.sel = +f === +CAL.sel[0] ? [f, null] : [CAL.sel[0], f];
    if (CAL.sel[1] && (CAL.sel[1] - CAL.sel[0]) / 864e5 > 30) CAL.sel = [f, null];  // como mucho un mes
    pintaCal(); return;
  }
  if (ev.target.closest('[data-calok]') && CAL && CAL.sel) { state.rango = [CAL.sel[0], CAL.sel[1] || CAL.sel[0]]; aplicaCuando(CAL.ctx, 'rango'); return; }
  if (ev.target.closest('[data-instalar-no]')) { store.set('instalar_no', true); renderAll(); return; }
  if (ev.target.closest('[data-instalar]') && window.__limonInstall) {
    const p = window.__limonInstall; window.__limonInstall = null;
    p.prompt(); p.userChoice.then(r => { if (r && r.outcome === 'accepted') store.set('instalar_no', true); renderAll(); }).catch(() => { });
    return;
  }
  const qg = ev.target.closest('[data-qgrp]');
  if (qg) {
    const g = TAX.find(x => x.id === qg.dataset.qgrp); if (!g) return;
    const all = g.items.every(it => prefs[it.id] === 1);
    g.items.forEach(it => { if (all) delete prefs[it.id]; else prefs[it.id] = 1; });
    store.set('prefs', prefs); qg.setAttribute('aria-pressed', String(!all)); return;
  }
  if (ev.target.closest('[data-qver]')) { closeSheets(); state.ptShown = 20; go('parati'); window.scrollTo(0, 0); renderAll(); return; }
  if (ev.target.closest('[data-qmas]')) { closeSheets(); go('intereses'); if (!logged) openFold('account', false); openFold('in-panel', true); setTimeout(() => { const p = $('in-panel'); if (p) p.scrollIntoView({ block: 'start' }); }, 50); return; }
  const shv = ev.target.closest('[data-sharev]'); if (shv && BYID[shv.dataset.sharev]) { shareEv(BYID[shv.dataset.sharev]); return; }
  if (ev.target.closest('[data-share-finde]')) { shareFinde(ev.target.closest('[data-share-finde]').dataset.shareFinde); return; }
  if (ev.target.closest('[data-zone-wider]')) { ZONE.r = +ev.target.closest('[data-zone-wider]').dataset.zoneWider; renderAll(); return; }
  if (ev.target.closest('[data-zone-locate]')) { locateZone(ev.target.closest('[data-zone-locate]')); return; }
  if (ev.target.closest('[data-zone-hint-x]')) { store.set('zoneAsked', 1); $('zone-hint').hidden = true; return; }
  const cb2 = ev.target.closest('[data-city]'); if (cb2) { if (cb2.dataset.city !== CITY.id) zonaSet(cb2.dataset.city); else closeSheets(); return; }
  if (ev.target.closest('[data-vote],[data-idea-tab],[data-idea-del]')) { ideasClick(ev.target); return; }
  const pf = ev.target.closest('[data-prof]'); if (pf) { openProfile(pf.dataset.prof); return; }
  const ol = ev.target.closest('[data-list]'); if (ol) { openList(ol.dataset.list); return; }
  if (ev.target.closest('[data-follow],[data-unfollow],[data-req-ok],[data-req-no]')) { socialAction(ev.target); return; }
  const tp = ev.target.closest('[data-topic]'); if (tp) { toggleTopic(tp.dataset.topicKind, tp.dataset.topic); return; }
  const al = ev.target.closest('[data-addlist]'); if (al) { state.listing = state.listing === al.dataset.addlist ? null : al.dataset.addlist; renderAll(); return; }
  const rate = ev.target.closest('[data-rate]'); if (rate) { saveDiary(rate.dataset.rate, { rating: +rate.dataset.n }).then(() => { renderAll(); }); return; }
  if (ev.target.closest('[data-soc-edit]')) { SOC.editing = true; renderSocial(); return; }
  if (ev.target.closest('[data-soc-cancel]')) { SOC.editing = false; renderSocial(); return; }
  if (ev.target.closest('[data-soc-share]') && SOC.me) { shareLink(ORIGIN + '?u=' + SOC.me.username, 'Limón', `Sígueme en Limón para ver a qué planes voy en ${CITY.name}:`); return; }
  if (ev.target.closest('[data-soc-contacts]')) {
    (async () => {
      try {
        const cs = await navigator.contacts.select(['email'], { multiple: true });
        const emails = cs.flatMap(c => c.email || []).slice(0, 500);
        if (!emails.length) { toast('Esos contactos no tienen correo.'); return; }
        const { data } = await sbx().rpc('find_by_emails', { p_emails: emails });
        SOC.results = data || []; SOC.resultsMsg = 'Ninguno de esos contactos está en Limón o ha permitido que le encuentren por su correo.'; renderSocial();
      } catch (x) { if (x && x.name !== 'AbortError') toast('No he podido abrir tus contactos.'); }
    })(); return;
  }
  if (ev.target.closest('[data-year]')) { state.year = state.year ? '' : buildYear(); renderYear(); if (state.year) openFold('year', true); return; }
  if (ev.target.closest('[data-year-share]')) { shareLink(ORIGIN, 'Mi año en planes', 'Mi año en planes con Limón: ' + (SOC.yearText || '')); return; }
  const lp = ev.target.closest('[data-list-pub]');
  if (lp) { const l = MYLISTS.find(x => x.id === +lp.dataset.listPub); sbx().from('user_lists').update({ is_public: !l.is_public, updated_at: new Date().toISOString() }).eq('id', l.id).then(() => loadSocial()); return; }
  const ls = ev.target.closest('[data-list-share]');
  if (ls) { const l = MYLISTS.find(x => x.id === +ls.dataset.listShare) || (SHEET && SHEET.data) || {}; shareLink(ORIGIN + '?lista=' + ls.dataset.listShare, l.title || 'Lista', `Mira esta lista de planes en Limón: «${l.title || ''}»`); return; }
  const ld = ev.target.closest('[data-list-del]');
  if (ld) { const l = MYLISTS.find(x => x.id === +ld.dataset.listDel); if (confirm(`¿Borrar la lista «${l.title}»?`)) sbx().from('user_lists').delete().eq('id', l.id).then(() => { toast('Lista borrada.'); loadSocial(); }); return; }
  const lf = ev.target.closest('[data-list-follow]');
  if (lf) {
    const id = +lf.dataset.listFollow, on = !(SHEET && SHEET.data && SHEET.data.following);
    (on ? sbx().from('list_follows').insert({ user_id: uid(), list_id: id }) : sbx().from('list_follows').delete().eq('user_id', uid()).eq('list_id', id))
      .then(() => { toast(on ? 'Sigues esta lista: la tienes en tu agenda.' : 'Ya no sigues esta lista.'); openList(id); loadSocial(); });
    return;
  }
  const gv = ev.target.closest('[data-goev]');
  if (gv && BYID[gv.dataset.goev]) { closeSheets(); const x = BYID[gv.dataset.goev]; state.filter = { kind: 'id', value: x.id, label: x.titulo }; state.open[x.id] = true; $('ex-when').value = 'todo'; go('explorar'); return; }
  const rb = ev.target.closest('[data-route]');
  if (rb && BYID[rb.dataset.route]) { checkRoute(BYID[rb.dataset.route]); return; }
  const ib = ev.target.closest('[data-invite]');
  if (ib) {
    if (!logged) { toast('Entra con tu cuenta (en Perfil) para proponer planes y ver quién se apunta.'); return; }
    state.inviting = state.inviting === ib.dataset.invite ? null : ib.dataset.invite; renderAll(); return;
  }
  if (ev.target.closest('[data-invite-cancel]')) { state.inviting = null; renderAll(); return; }
  const rs = ev.target.closest('[data-reshare]');
  if (rs) { shareInvite(BYID[rs.dataset.ev], rs.dataset.reshare, store.get('myname', '')); return; }
  const fu = ev.target.closest('[data-fui]');
  if (fu) { fuiAnswer(fu.dataset.id, fu.dataset.fui); return; }
  const sd = ev.target.closest('[data-stats-days]');
  if (sd) { statsDays = +sd.dataset.statsDays; loadStats(); return; }
  const ge = ev.target.closest('[data-goto-ev]');
  if (ge) { const id = ge.dataset.gotoEv; state.open[id] = true; $('ex-q').value = $('q-global').value = BYID[id].titulo; $('ex-when').value = 'todo'; go('explorar'); return; }
  const cs = ev.target.closest('[data-consent]');
  if (cs) { window.limonConsent.set(cs.dataset.consent === '1'); $('o-stats').checked = cs.dataset.consent === '1'; toast(cs.dataset.consent === '1' ? 'Gracias. Puedes cambiarlo cuando quieras en Perfil.' : 'Entendido: no guardamos nada. Puedes cambiarlo en Perfil.'); renderAll(); return; }
  let o = ev.target.closest('[data-open]');
  if (!o) {
    const c = ev.target.closest('.card');
    if (c && !ev.target.closest('a, button, .more')) o = c.querySelector('[data-open]');
  }
  if (o) { const id = o.dataset.open; state.open[id] = !state.open[id]; fichaHistoria(id, state.open[id]); if (state.open[id]) { store.set('abiertos', store.get('abiertos', 0) + 1); const all = [...document.querySelectorAll('#v-' + state.tab + ' [data-open]')].map(x => x.dataset.open); track('abrir', id, { pos: all.indexOf(id) + 1 || null }); } renderAll(); const el = document.querySelector(`[data-open="${id}"]`); if (el) el.focus(); return; }
  const g = ev.target.closest('[data-grp]');
  if (g) { state.groupsOpen[g.dataset.grp] = !state.groupsOpen[g.dataset.grp]; renderIntereses(); return; }
  const c = ev.target.closest('[data-cat]');
  if (c) { const id = c.dataset.cat; prefs[id] = ((prefs[id] || 0) + 1) % 3; if (!prefs[id]) delete prefs[id]; store.set('prefs', prefs); renderIntereses(); const el = document.querySelector(`[data-cat="${id}"]`); if (el) el.focus(); }
});
// enlaces desde los correos: ?ev=e123 abre ese evento, ?tab=calle abre una pestaña, ?baja=…&k=… da de baja un aviso
const QS = new URLSearchParams(location.search);
try { tabSes = sessionStorage.getItem('bureo.tab'); } catch (e) { }
const t0 = QS.get('tab') || tabSes || 'parati';
const ev0 = QS.get('ev') && (BYID[QS.get('ev')] || BYID['e' + QS.get('ev')]);
if (ev0) { state.filter = { kind: 'id', value: ev0.id, label: ev0.titulo }; state.open[ev0.id] = true; $('ex-when').value = 'todo'; go('explorar'); }
else go(tabs.includes(t0) ? t0 : 'parati');
renderAccountExtras();
if (QS.get('baja') && window.limonDB) {
  window.limonFn('limon-mail', { body: { action: 'unsub', t: QS.get('baja'), k: QS.get('k') } }).then(({ data }) => {
    toast(data && data.ok ? ({ semanal: 'Ya no recibirás el resumen semanal.', calle: 'Ya no recibirás avisos de cortes.', lluvia: 'Ya no recibirás avisos de lluvia.', quedadas: 'Ya no recibirás avisos de quedadas.', amigos: 'Ya no recibirás avisos de amigos.', ideas: 'Ya no recibirás avisos de tus ideas.', organizador: 'Ya no recibirás avisos de organizador.', admin: 'Ya no recibirás avisos de admin.' })[data.k] + ' Puedes volver a activarlo en tu perfil.' : 'Ese enlace de baja no es válido.');
    if (data && data.ok && me && me.notify) { me.notify[data.k] = false; renderAccountExtras(); }
  });
}
if (QS.get('quedar') && /^[0-9a-f-]{36}$/i.test(QS.get('quedar')) && window.limonDB) {
  const tk = QS.get('quedar');
  window.limonDB.sb.rpc('invite_get', { p_token: tk }).then(({ data }) => {
    if (!data) { toast('Esa invitación no existe o se ha borrado.'); return; }
    QD = { token: tk, data };
    const e = BYID['e' + data.event_id];
    if (e) { state.filter = { kind: 'id', value: e.id, label: e.titulo }; state.open[e.id] = true; $('ex-when').value = 'todo'; }
    go('explorar'); renderQuedar();
  });
}
try { FOLDS = JSON.parse(sessionStorage.getItem('bureo.folds') || '{}'); localStorage.removeItem('bureo.folds'); } catch (e) { }
document.addEventListener('click', ev => { const p = foldHead(ev.target); if (p) { ev.stopPropagation(); openFold(p.id); } }, true);
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('#v-intereses .panel.fold h2')) { ev.preventDefault(); openFold(ev.target.closest('.panel').id); } });
// los apartados se repintan a menudo: se vuelve a marcar el título como botón
new MutationObserver(() => setupFolds()).observe($('v-intereses'), { childList: true, subtree: false });
['social', 'seguir', 'ventajas', 'year', 'ideas', 'org', 'adm', 'stats', 'mail'].forEach(id => { const el = $(id); if (el) new MutationObserver(() => { const h = el.querySelector('h2'); if (h && !h.hasAttribute('role')) { h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', !!FOLDS[id]); } }).observe(el, { childList: true }); });
setupFolds();
// enlaces que sacan de Limón (web del organizador, fuente, cómo llegar): señal fuerte de interés
document.addEventListener('click', ev => {
  const a = ev.target.closest('.card a[target="_blank"]'); if (!a) return;
  const c = a.closest('[data-eid]'); if (!c) return;
  track('web', c.dataset.eid, { tipo: /google\.com\/maps/.test(a.href) ? 'mapa' : /organizador/i.test(a.textContent) ? 'organizador' : 'fuente' });
}, true);
renderSocialAll(); loadIdeas(); loadAffinity(); loadPast();
renderZoneHint();
initSheet();
{ const v = $('ver'); if (v && v.textContent.includes('__' + 'VER__')) v.textContent = 'Versión en desarrollo'; }  // partido para que la sustitución al publicar no lo toque
document.addEventListener('input', ev => { if (ev.target.id === 'idea-title') { IDEAS_SIM = similarIdeas(ev.target.value); const b = $('idea-sim'); if (b) b.innerHTML = IDEAS_SIM.length ? '<p class="note" style="margin:0">¿Es alguna de estas? Mejor vótala para que sume:</p>' + IDEAS_SIM.map(ideaRow).join('') : ''; } });
if (QS.get('fui')) go('parati');
if (QS.get('ideas') !== null) { go('intereses'); openFold('ideas', true); setTimeout(() => { const b = $('ideas'); if (b) b.scrollIntoView({ behavior: 'smooth' }); }, 400); }
if (QS.get('u') && /^[a-z0-9_.]{3,20}$/i.test(QS.get('u'))) { const un = QS.get('u'); go('intereses'); setTimeout(() => openProfile(un), 300); }
if (QS.get('lista') && /^\d+$/.test(QS.get('lista'))) { const li = QS.get('lista'); setTimeout(() => openList(li), 300); }
if (QS.has('ev') || QS.has('baja') || QS.has('tab') || QS.has('quedar') || QS.has('u') || QS.has('lista') || QS.has('ideas') || QS.has('fui')) history.replaceState(null, '', location.pathname);
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
