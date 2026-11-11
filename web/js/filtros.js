// Limón · filtros, municipio elegido, planes nuevos y selector de zona

let userPos = null;  // última posición conocida del usuario (solo en memoria)
const fmtDist = d => d < 1 ? Math.max(50, Math.round(d * 1000 / 50) * 50) + ' m' : d < 10 ? d.toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' km';
// si alguna vez nos dejas usar tu ubicación, se recuerda que quieres ver distancias (la posición en sí no se guarda)
function keepDist() { if (!opts.dist) { opts.dist = true; store.set('opts', opts); const o = $('o-dist'); if (o) o.checked = true; } }
function setUserPos(p) { userPos = p; if (!F.pos) F.pos = p; keepDist(); renderAll(); }
function askPos(quiet) {
  if (!navigator.geolocation) { if (!quiet) toast('Tu navegador no permite saber dónde estás.'); return; }
  navigator.geolocation.getCurrentPosition(p => setUserPos([p.coords.latitude, p.coords.longitude]),
    () => { if (!quiet) { toast('Sin permiso de ubicación no puedo calcular distancias.'); opts.dist = false; store.set('opts', opts); renderAll(); } },
    { timeout: 10000, maximumAge: 300000 });
}
const nf = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// hora de inicio en horas decimales: «20:30», «20.30», «20h30», «20 h»; sin hora (o «00:00» a secas) → null
const startHour = e => { const t = String(e.hora || ''); if (SIN_HORA.test(t)) return null; const m = t.match(/(\d{1,2})(?:[:.h](\d{2})|\s?h\b)/i) || t.match(/\bde\s+(\d{1,2})\s+a\s+\d{1,2}\b/i); return m && +m[1] < 24 ? +m[1] + (+m[2] || 0) / 60 : null; };
const horaOrden = e => startHour(e) ?? 99;  // dentro del mismo día, por hora; los que no la dicen, al final
const minPrice = e => { if (e.gratis) return 0; const m = String(e.precio || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(?:€|euros?)/i) || String(e.precio || '').match(/^\D{0,12}(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1]) : null; };
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const zkm = e => !ZONE ? 0 : e.distrito === ZONE.name ? 0 : e.lat ? km(ZONE.c, [e.lat, e.lng]) : 999;
const inZone = e => !ZONE || zkm(e) <= ZONE.r;
// orden dentro de una lista con municipio: primero los del pueblo; los de fuera, por distancia (redondeada a 2 km) y luego como venían
const zoneSort = (x, y, rest) => !ZONE ? rest : (zkm(x) > 0) - (zkm(y) > 0) || (zkm(x) > 0 ? Math.round(zkm(x) / 2) - Math.round(zkm(y) / 2) : 0) || rest;
function zoneNote() {
  if (!ZONE) return '';
  const next = [5, 10, 15, 25, 40, 80].find(r => r > ZONE.r);
  const wider = next ? ` <button class="btnlink" data-zone-wider="${next}">Ampliar a ${next} km</button>` : '';
  return `<p class="note" style="margin:6px 0 10px">${ZONE.own ? `Primero los planes de ${esc(ZONE.name)} y después los de alrededor (hasta ${ZONE.r} km), del más cercano al más lejano.`
    : `${esc(ZONE.name)} no tiene planes publicados estos días: te enseñamos los de alrededor (hasta ${ZONE.r} km), del más cercano al más lejano.`}${wider}</p>`;
}
const reciente0 = e => e.alta && Date.now() - new Date(e.alta).getTime() < 864e5;
const reciente = e => !muchos && reciente0(e);
let seenTimer = null;
const saveSeen = () => { if (sinAlta) return; clearTimeout(seenTimer); seenTimer = setTimeout(() => store.set(SEEN_KEY, [...seenNow]), 1200); };
function watchSeen() { if (seenObs) document.querySelectorAll('.card[data-eid]').forEach(c => { if (!seenNow.has(c.dataset.eid)) seenObs.observe(c); }); }
const nNew = () => EV.filter(e => NEW.has(e.id) && inZone(e) && parse(e.fin) >= today && !isDismissed(e)).length;
const nFilters = () => [F.dist, F.near && F.pos, F.franja, F.dias, F.precio].filter(Boolean).length;
function passF(e, occ) {
  if (F.temp && TEMPORADA && !esTemporada(e)) return false;
  if (F.ventaja && ventajas.length && !(e.gratis || ventajaHit(e))) return false;
  if (F.nuevos && !NEW.has(e.id)) return false;
  if (ZONE && !F.dist && !(F.near && F.pos) && !inZone(e)) return false;
  if (F.dist && e.distrito !== F.dist) return false;
  if (F.near && F.pos) { if (!e.lat || km(F.pos, [e.lat, e.lng]) > F.near) return false; }
  if (F.franja) {
    const h = startHour(e);
    if (h == null) { if (!(occ && occ.ongoing)) return false; }
    else if (F.franja === 'manana' ? h >= 14 : F.franja === 'tarde' ? (h < 14 || h >= 20.5) : h < 20) return false;
  }
  if (F.dias && occ && !occ.ongoing) { const wd = occ.date.getDay(), finde = wd === 0 || wd === 6 || (wd === 5 && (startHour(e) || 0) >= 18); if ((F.dias === 'finde') !== finde) return false; }
  if (F.precio === 'ventaja') { if (!e.gratis && !ventajaHit(e)) return false; }
  else if (F.precio) { const p = minPrice(e); if (F.precio === 'gratis' ? !e.gratis : (p == null || p > +F.precio)) return false; }
  return true;
}
function filtersHtml() {
  // cuántos planes quedarían con cada opción (en las fechas que estás viendo), para no elegir a ciegas
  const [ra, rb] = range(state.tab === 'parati' ? state.when : $('ex-when').value);
  const base = EV.map(e => ({ e, occ: occurs(e, ra, rb) })).filter(x => x.occ && !isDismissed(x.e));
  const cnt = (k, v) => { const old = F[k]; F[k] = v; let n = 0; for (const x of base) if (passF(x.e, x.occ)) n++; F[k] = old; return n; };
  const pill = (k, v, t) => {
    const n = k === 'near' ? null : cnt(k, v);
    return `<button class="pill" data-fset="${k}" data-fval="${v}" aria-pressed="${String(F[k]) === String(v)}"${n === 0 && String(F[k]) !== String(v) ? ' disabled' : ''}>${t}${n != null ? `<span class="k">${n}</span>` : ''}</button>`;
  };
  return `<div><h3>Zona</h3><div class="row" style="margin-top:6px">
        <select class="search" data-fsel="dist" style="max-width:240px" aria-label="${CITY.kind === 'provincia' ? 'Municipio' : 'Distrito'}"><option value="">${CITY.kind === 'provincia' ? 'Toda la provincia' : CITY.muni ? 'Todo ' + esc(CITY.name) : 'Toda la ciudad'}</option>${DISTRITOS.map(d => `<option ${F.dist === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        ${pill('near', 1, 'A 1 km')}${pill('near', 3, 'A 3 km')}${pill('near', 8, 'A 8 km')}${CITY.kind === 'provincia' || CITY.muni ? pill('near', 20, 'A 20 km') + pill('near', 40, 'A 40 km') : ''}</div>
        <p class="note" id="f-geo">${F.near ? (F.pos ? `Cerca de tu ubicación actual (${F.near} km).` : 'Buscando tu ubicación…') : 'La distancia se calcula desde donde estás ahora; no se guarda.'}</p></div>
      <div><h3>Momento del día</h3><div class="row" style="margin-top:6px">${pill('franja', 'manana', 'Mañana')}${pill('franja', 'tarde', 'Tarde')}${pill('franja', 'noche', 'Noche')}</div></div>
      <div><h3>Días</h3><div class="row" style="margin-top:6px">${pill('dias', 'laborables', 'Entre semana')}${pill('dias', 'finde', 'Fin de semana')}</div></div>
      <div><h3>Precio</h3><div class="row" style="margin-top:6px">${pill('precio', 'gratis', 'Gratis')}${pill('precio', 10, 'Hasta 10 €')}${pill('precio', 20, 'Hasta 20 €')}${pill('precio', 40, 'Hasta 40 €')}${ventajas.length ? pill('precio', 'ventaja', 'Gratis o con mi descuento') : ''}</div>${ventajas.length ? '' : '<p class="note">Marca tus ventajas (Carné Joven, estudiante…) en Perfil para ver los planes con descuento para ti.</p>'}</div>
      <div class="row"><button class="btn ghost" data-fclear>Quitar filtros</button><span class="note">Solo salen eventos con ese dato; los que no lo indican quedan fuera.</span></div>`;
}
function renderFilters() {
  ['pt', 'ex'].forEach(v => { const p = $(v + '-fpanel'); if (!p.hidden) p.innerHTML = filtersHtml(); });
  document.querySelectorAll('.fcount').forEach(x => { x.textContent = nFilters() || ''; });
  const fr = state.tab === 'parati';
  $('pt-free').setAttribute('aria-pressed', F.precio === 'gratis'); $('ex-free').setAttribute('aria-pressed', F.precio === 'gratis');
  const nn = nNew(); if (!nn) F.nuevos = false;
  document.querySelectorAll('[data-nuevos]').forEach(b => { b.hidden = !nn; b.setAttribute('aria-pressed', !!F.nuevos); });
  document.querySelectorAll('[data-ftemp]').forEach(b => { b.hidden = !TEMPORADA; if (TEMPORADA) { b.textContent = TEMPORADA.emo + ' ' + TEMPORADA.nombre; b.setAttribute('aria-pressed', !!F.temp); } });
  document.querySelectorAll('.n-nuevos').forEach(x => { x.textContent = nn ? ' ' + nn : ''; });
  if (!ventajas.length) F.ventaja = false;
  document.querySelectorAll('[data-fventaja]').forEach(b => { b.hidden = !ventajas.length; b.setAttribute('aria-pressed', !!F.ventaja); b.title = 'Gratis o con descuento para: ' + VENTAJAS.filter(v => ventajas.includes(v[0])).map(v => v[1]).join(', '); });
}
function setF(k, v) {
  F[k] = String(F[k]) === String(v) ? (k === 'near' ? 0 : '') : (k === 'near' ? +v : v);
  if (k === 'near' && F.near && !F.pos) {
    if (!navigator.geolocation) { F.near = 0; toast('Tu navegador no permite saber dónde estás.'); }
    else navigator.geolocation.getCurrentPosition(p => { F.pos = [p.coords.latitude, p.coords.longitude]; userPos = userPos || F.pos; keepDist(); renderAll(); },
      () => { F.near = 0; toast('Sin permiso de ubicación: elige un distrito.'); renderAll(); }, { timeout: 10000, maximumAge: 300000 });
  }
  store.set('filters', { dist: F.dist, franja: F.franja, dias: F.dias, precio: F.precio });
  track('filtro', null, { k, v: F[k] || null });
  state.ptShown = 12; state.exShown = 20; renderAll();
}
// ---------- selector de zona: primero provincia (o ciudad), luego «Toda la provincia» o un municipio
function zoneGroups() {
  const isAdm = me && me.role === 'admin', all = DATA.cities || [];
  const vis = c => c.status === 'publicada' || c.id === CITY.id;  // los borradores no salen en el selector (tampoco al admin): se previsualizan con ?c=<id>
  const groups = [];
  for (const c of all.filter(x => !x.parent || !all.some(p => p.id === x.parent && vis(p)))) {
    if (!vis(c)) continue;
    if (c.kind === 'provincia') {
      const kids = all.filter(k => k.parent === c.id && vis(k));
      const kidNames = new Set(kids.map(k => k.name));
      groups.push({ id: c.id, name: c.name, draft: c.status !== 'publicada', options: [{ v: c.id, t: 'Toda ' + c.name }]
        .concat(kids.map(k => ({ v: k.id, t: k.name + (k.status !== 'publicada' ? ' (borrador)' : '') })))
        .concat([...new Set((c.districts || []).concat(Object.keys(c.munis || {})))].filter(d => !kidNames.has(d)).sort((a, b) => a.localeCompare(b, 'es')).map(d => ({ v: c.id + '|' + d, t: d }))) });
    } else groups.push({ id: c.id, name: c.name, draft: c.status !== 'publicada', options: [{ v: c.id, t: c.name }] });
  }
  return groups;
}
// ---------- «¿Estás en otro sitio?»: la primera vez, si no has elegido zona, se ofrece abrir la de donde estás
async function locateZone(btn) {
  const t = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Buscando…'; }
  store.set('zoneAsked', 1);
  let z = null;
  try { z = await window.limonCity.locate(); }
  catch (e) { if (btn) { btn.disabled = false; btn.textContent = t; } toast('Sin permiso de ubicación no puedo saber dónde estás. Elige la zona a mano.'); return; }
  if (btn) { btn.disabled = false; btn.textContent = t; }
  keepDist(); askPos(true);
  if (!z) { $('zone-hint').hidden = true; toast('Aún no estamos en tu zona: de momento, Madrid, Barcelona, Euskadi, Zaragoza y Gijón. ¡Iremos añadiendo más!'); return; }
  if (z === window.limonCity.zone()) { $('zone-hint').hidden = true; closeSheets(); toast('Ya estás viendo los planes de ' + CITY.name + '.'); return; }
  zonaSet(z);
}
// cambiar de zona; sin conexión (o si sus planes no bajan) se queda en la actual y lo dice
function zonaSet(z) {
  window.limonCity.set(z).catch(() => toast('No se han podido descargar los planes de esa zona. Revisa tu conexión: sigues en ' + CITY.name + '.'));
}
function renderZoneHint() {
  const box = $('zone-hint'); if (!box) return;
  if (window.__limonAutoZone) { window.__limonAutoZone = false; toast('Te enseñamos los planes de ' + CITY.name + ', donde estás. Puedes cambiar de zona arriba.'); }
  if (window.__limonNoZone) { window.__limonNoZone = false; store.set('zoneAsked', 1); toast('Aún no estamos en tu zona: te enseñamos Madrid. Puedes cambiar de zona arriba.'); }
  const show = !window.limonCity.chosen() && !store.get('zoneAsked', 0) && 'geolocation' in navigator;
  box.hidden = !show; if (!show) return;
  box.innerHTML = `<p class="note" role="region" aria-label="Tu zona" style="margin:0 0 10px">¿No estás en ${esc(CITY.name)}? <button class="btnlink" data-zone-locate title="Tu ubicación no sale de tu móvil">📍 Ver los de donde estoy</button> · <button class="btnlink" data-zone-pick>Elegir zona</button> · <button class="btnlink" data-zone-hint-x>Ocultar</button></p>`;
}
function openZone() {
  const groups = zoneGroups(), zone = window.limonCity.zone();
  const isAdm = me && me.role === 'admin';
  // todas las opciones en una lista para buscar: «Getxo · Bizkaia», «Toda Bizkaia», «Madrid»…
  const flat = groups.flatMap(g => g.options.map(o => ({ v: o.v, t: o.t, p: g.options.length > 1 && !o.t.startsWith('Toda ') ? g.name : '' })));
  const n = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const fila = o => `<button class="zrow${o.v === zone ? ' cur' : ''}" data-zone-v="${esc(o.v)}"><span>${esc(o.t)}</span>${o.p ? `<span class="note">${esc(o.p)}</span>` : ''}${o.v === zone ? '<span class="note">· ahora</span>' : ''}</button>`;
  openSheet(`<div class="seg" style="justify-content:space-between;align-items:center"><h2 style="margin:0">¿Dónde buscas planes?</h2><button class="btn ghost" data-sheet-close>Cerrar</button></div>
      <input class="search" id="zone-q" type="search" placeholder="Escribe tu ciudad o pueblo" aria-label="Buscar ciudad o pueblo" autocomplete="off">
      <button class="btn ghost" data-zone-locate style="align-self:flex-start">📍 Donde estoy</button>
      <div id="zone-list" class="zlist"></div>
      <p class="note" style="margin:0">Tus intereses, tu agenda y tus amigos son los mismos en todas las zonas.${isAdm && (DATA.cities || []).some(c => c.status !== 'publicada') ? ' Zonas en borrador (solo con enlace): ' + (DATA.cities || []).filter(c => c.status !== 'publicada').map(c => `<a href="?c=${esc(c.id)}">${esc(c.name)}</a>`).join(', ') + '.' : ''} De momento: Madrid, Barcelona, Euskadi (Bizkaia, Gipuzkoa y Araba), Zaragoza y Gijón; iremos añadiendo más.</p>`);
  let abierta = (groups.find(g => g.options.length > 1 && g.options.some(o => o.v === zone)) || {}).id || null;
  const pinta = () => {
    const q = n($('zone-q').value.trim());
    if (q) {
      const hits = flat.filter(o => n(o.t).includes(q) || n(o.p).includes(q)).sort((a, b) => (n(a.t).startsWith(q) ? 0 : 1) - (n(b.t).startsWith(q) ? 0 : 1)).slice(0, 40);
      $('zone-list').innerHTML = hits.map(fila).join('') || '<p class="note">Aún no tenemos esa zona. ¡Iremos añadiendo más!</p>';
      return;
    }
    // sin buscar: las zonas; las provincias se despliegan con sus municipios
    $('zone-list').innerHTML = groups.map(g => g.options.length === 1 ? fila({ v: g.options[0].v, t: g.name, p: '' })
      : `<button class="zrow grp" data-zone-grp="${esc(g.id)}" aria-expanded="${abierta === g.id}"><span>${esc(g.name)}</span><span class="note">${g.options.length - 1} municipios ${abierta === g.id ? '▴' : '▾'}</span></button>` +
        (abierta === g.id ? `<div class="zkids">${g.options.map(o => fila({ v: o.v, t: o.t, p: '' })).join('')}</div>` : '')).join('');
  };
  pinta();
  $('zone-q').addEventListener('input', pinta);
  $('zone-list').addEventListener('click', ev => {
    const gr = ev.target.closest('[data-zone-grp]'); if (gr) { abierta = abierta === gr.dataset.zoneGrp ? null : gr.dataset.zoneGrp; pinta(); return; }
    const z = ev.target.closest('[data-zone-v]'); if (z) { if (z.dataset.zoneV === zone) closeSheets(); else zonaSet(z.dataset.zoneV); }
  });
}

// ---------- arranque: filtros guardados, distancia, municipio elegido y planes nuevos
let DISTRITOS, ZONE, SEEN_KEY, seen0, first, sinAlta, muchos, NEW, seenNow, seenObs;  // se fijan al arrancar (iniciaFiltros)
let F;
function iniciaFiltros() {
  // ---------- filtros: zona, hora del día, días y precio (compartidos por Para ti y Explorar)
  F = Object.assign({ dist: '', near: 0, pos: null, franja: '', dias: '', precio: '' }, store.get('filters', {}));
  F.pos = null;   F.near = 0;    // la ubicación no se guarda: se pide cada vez
  // si ya diste permiso antes (o activaste la opción), se usa sin volver a preguntar
  try {
    if (opts.dist) askPos(true);
    else if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') askPos(true); }).catch(() => { });
  } catch (e) { }
  DISTRITOS = (CITY.districts || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
  // ---------- municipio elegido: sus planes primero y después los de alrededor, del más cercano al más lejano
  ZONE = CITY.muni ? { name: CITY.muni, c: [CITY.lat, CITY.lng], r: 40 } : null;
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
  SEEN_KEY = 'seen3.' + window.limonCity.zone();
  seen0 = store.get(SEEN_KEY, null), first = !(Array.isArray(seen0) && seen0.length);
  sinAlta = EV.length && !EV.some(e => e.alta);    // datos de una versión vieja: no se puede saber qué es nuevo, mejor no guardar nada
  muchos = EV.filter(reciente0).length > EV.length * 0.3;    // zona recién cargada entera: no tendría sentido marcarlo todo
  NEW = new Set(EV.filter(e => first ? reciente(e) : !seen0.includes(e.id)).map(e => e.id));
  seenNow = new Set(first ? EV.filter(e => !reciente(e)).map(e => e.id) : seen0.filter(id => BYID[id]));
  saveSeen();
  seenObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => {
    if (!x.isIntersecting) return; const id = x.target.dataset.eid; seenObs.unobserve(x.target);
    if (id && !seenNow.has(id)) { seenNow.add(id); saveSeen(); }
  }), { threshold: 0.6 }) : null;
}

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicFtoggle(ev) {
  const ft = ev.target.closest('[data-ftoggle]');
  if (ft) { const p = $(ft.dataset.ftoggle + '-fpanel'); p.hidden = !p.hidden; ft.setAttribute('aria-expanded', !p.hidden); renderFilters(); return true; }
  return false;
}
function clicFset(ev) {
  const fs = ev.target.closest('[data-fset]');
  if (fs) { setF(fs.dataset.fset, fs.dataset.fval); return true; }
  return false;
}
function clicFclear(ev) {
  if (ev.target.closest('[data-fclear]')) { F = { dist: '', near: 0, pos: F.pos, franja: '', dias: '', precio: '', temp: false }; setF('dist', ''); return true; }
  return false;
}
function clicCityBtn(ev) {
  if (ev.target.closest('#city-btn') || ev.target.closest('[data-zone-pick]')) { openZone(); return true; }
  return false;
}
function clicNuevosVer(ev) {
  if (ev.target.closest('[data-nuevos-ver]')) { F.nuevos = true; go('explorar'); return true; }
  return false;
}
function clicZoneWider(ev) {
  if (ev.target.closest('[data-zone-wider]')) { ZONE.r = +ev.target.closest('[data-zone-wider]').dataset.zoneWider; renderAll(); return true; }
  return false;
}
function clicZoneLocate(ev) {
  if (ev.target.closest('[data-zone-locate]')) { locateZone(ev.target.closest('[data-zone-locate]')); return true; }
  return false;
}
function clicZoneHintX(ev) {
  if (ev.target.closest('[data-zone-hint-x]')) { store.set('zoneAsked', 1); $('zone-hint').hidden = true; return true; }
  return false;
}
function clicCity(ev) {
  const cb2 = ev.target.closest('[data-city]'); if (cb2) { if (cb2.dataset.city !== CITY.id) zonaSet(cb2.dataset.city); else closeSheets(); return true; }
  return false;
}

// ---------- cada variable se asigna solo en su archivo: desde los demás, estas se cambian con su función pon…
function ponUserPos(v) { return (userPos = v); }
