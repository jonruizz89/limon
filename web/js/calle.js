// Limón · Calle: cortes, mapa, avisos en cada plan, lluvia y ruta

// ---------- cortes de calle
const STRIP = /^(calle|c\/|avenida|av\.?|avda\.?|paseo|plaza|pza\.?|glorieta|ronda|carretera|camino|travesia|costanilla|cuesta)( de(l| la| los| las)?)? /;
const streetKey = t => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(STRIP, '').replace(/^(de|del|la|el) /, '');
const lineKey = t => { const m = String(t || '').toUpperCase().replace(/LÍNEA|LINEA/g, 'L').replace(/\s+/g, '').match(/^(L|ML|C|R|N)?(\d{0,3}[A-Z]?)$/); return m ? (m[1] || '') + m[2] : null; };
const lineMine = (l, kind) => {
  const k = lineKey(l); if (!k) return false;
  return streets.some(m => {
    const q = lineKey(m); if (!q) return false;
    if (kind === 'autobus') return q === k;                 // autobús: número exacto (27, N16, C03)
    if (kind === 'cercanias') return q === k;               // Cercanías: C5, C9…
    return q === k || ('L' + q) === k;                      // Metro: L6 o 6
  });
};
// ¿es esta calle una de las mías? Palabras completas, no trozos: «Bravo Murillo» no casa con «Plaza de Murillo»,
// pero «Castellana» sí con «Paseo de la Castellana». Si las dos dicen el tipo de vía (calle, plaza…) y es distinto, no casa.
const TIPO_VIA = { 'c/': 'calle', c: 'calle', calle: 'calle', av: 'avenida', 'av.': 'avenida', avda: 'avenida', 'avda.': 'avenida', avenida: 'avenida', paseo: 'paseo', plaza: 'plaza', pza: 'plaza', 'pza.': 'plaza', glorieta: 'glorieta', ronda: 'ronda', carretera: 'carretera', camino: 'camino', travesia: 'travesia', costanilla: 'costanilla', cuesta: 'cuesta' };
const tipoVia = t => TIPO_VIA[(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/)[0]] || '';
// nombre limpio: sin tramo («entre…», «desde…», paréntesis, tras la coma) ni número
const calleBase = t => streetKey(String(t || '').split(/[(,]| entre | desde | hasta | a la altura | n[ºo°]\.? /i)[0]).replace(/(\s+\d+\w?)+$/, '');
function mismaCalle(corte, mia) {
  const k = calleBase(corte), q = calleBase(mia);
  if (k.length < 3 || q.length < 3) return false;
  const tk = tipoVia(corte), tq = tipoVia(mia);
  return k === q && !(tk && tq && tk !== tq);
}
const isMine = st => streets.some(m => mismaCalle(st, m));
const iso = d => (d.getDay() + 6) % 7 + 1;
function activeOn(c, d) {
  const ds = ymd(d);
  for (const r of c.ranges || []) {
    if (!r.from || !r.to || ds < r.from || ds > r.to) continue;
    if (r.weekdays && r.weekdays.length && !r.weekdays.includes(iso(d))) continue;
    if (r.last_sunday && !(iso(d) === 7 && addDays(d, 7).getMonth() !== d.getMonth())) continue;
    return r;
  }
  return null;
}
function caDays() {
  // hoy, mañana y, si se ha elegido en el calendario, otro día (hasta 30 días)
  const out = [{ id: 'hoy', label: 'Hoy', d: today }, { id: 'manana', label: 'Mañana', d: addDays(today, 1) }];
  if (state.caOtro && state.caOtro > addDays(today, 1)) out.push({ id: 'otro', label: DIA[state.caOtro.getDay()] + ' ' + state.caOtro.getDate() + ' ' + MES[state.caOtro.getMonth()], d: state.caOtro });
  return out;
}
const KORDER = { metro: 0, cercanias: 0, metro_ligero: 0, autobus: 3, evento: 0, manifestacion: 1, partido: 1, recurrente: 2, otro: 3, obras: 4 };
function cutsOn(d) {
  return CLOSURES.map(c => ({ c, r: activeOn(c, d) })).filter(x => x.r)
    .map(x => Object.assign(x, { mine: (x.c.streets || []).some(isMine) || (x.c.stations || []).some(isMine) || (x.c.lines || []).some(l => lineMine(l, x.c.kind)) }))
    .sort((a, b) => (b.mine - a.mine) || (KORDER[a.c.kind] ?? 5) - (KORDER[b.c.kind] ?? 5) || String(a.r.start || '00').localeCompare(String(b.r.start || '00')));
}
const TRANS = ['metro', 'cercanias', 'autobus', 'metro_ligero'];
const KIND = { metro: 'Metro', cercanias: 'Cercanías', autobus: 'Autobús EMT', metro_ligero: 'Metro Ligero', evento: 'Evento', obras: 'Obras', recurrente: 'Fin de semana', partido: 'Partido', manifestacion: 'Manifestación', otro: 'Aviso' };
const METRO = { L1: '#30A3DC', L2: '#E0292F', L3: '#FFE114', L4: '#814109', L5: '#96BF0D', L6: '#9A9999', L7: '#FA9F35', L8: '#F373B7', L9: '#990D66', L10: '#1B0C80', L11: '#136926', L12: '#999933', R: '#FFFFFF' };
function lineStyle(l, kind) {
  const k = lineKey(l) || '';
  const bg = METRO[k] || (k.startsWith('C') ? '#E5211B' : k.startsWith('ML') ? '#3A86C8' : '#1E5BA8');
  const light = ['#FFE114', '#96BF0D', '#FA9F35', '#FFFFFF', '#F373B7', '#9A9999', '#999933', '#30A3DC'].includes(bg);
  return `background:${bg};color:${light ? '#12182B' : '#FFFFFF'}`;
}
function cutCard(x, i) {
  const c = x.c, r = x.r;
  const when = r.start ? `${r.start}${r.end ? '–' + r.end : ''}` : 'Todo el día';
  const sts = (c.streets || []).slice().sort((a, b) => isMine(b) - isMine(a));
  return `<article class="card cut ${x.mine ? 'mine' : ''}" id="cut-${i}">
      <div class="tags"><span class="tag ${x.mine ? 'uni' : ''}">${x.mine ? 'Te afecta' : esc(KIND[c.kind] || 'Aviso')}</span>${x.mine ? `<span class="tag">${esc(KIND[c.kind] || 'Aviso')}</span>` : ''}${c.district ? `<span class="tag">${esc(c.district)}</span>` : ''}</div>
      <div class="when">${esc(when)}</div>
      <h3 class="title" style="padding-right:0">${esc(c.title)}</h3>
      ${c.summary ? `<p class="meta" style="margin:0">${esc(c.summary)}</p>` : ''}
      ${(() => { const st = stadiumOf(c.title + ' ' + (c.summary || '')); const m = st && CA_DATE ? bigEventsOn(CA_DATE, st) : []; return m.length ? `<div class="why">Por: ${m.map(e => `<button class="btnlink" data-goev="${e.id}">${esc(e.titulo)}${e.hora && e.hora.length < 12 ? ' · ' + esc(e.hora) : ''}</button>`).join(' · ')}</div>` : ''; })()}
      ${((c.lines || []).length || (c.stations || []).length) ? `<div class="tags">${c.lines.map(l => `<span class="line ${lineMine(l, c.kind) ? 'hit' : ''}" style="${lineStyle(l, c.kind)}">${esc(l)}</span>`).join('')}${(c.stations || []).map(st => `<span class="street ${isMine(st) ? 'hit' : ''}">${esc(st)}</span>`).join('')}</div>` : ''}
      <div class="tags">${sts.slice(0, 10).map(st => `<span class="street ${isMine(st) ? 'hit' : ''}">${esc(st)}</span>`).join('')}${sts.length > 10 ? `<span class="street">y ${sts.length - 10} más</span>` : ''}</div>
      ${c.geom ? `<button class="maplink" data-cutmap="${i}">Ver en el mapa</button>` : ''}
      ${c.source_url ? `<div class="links"><a href="${ext(c.source_url)}" target="_blank" rel="noopener">${CITY.id !== 'madrid' && c.source_name ? 'Ver en ' + esc(c.source_name.split('·').pop().trim()) : 'Ver el aviso ' + (TRANS.includes(c.kind) ? 'del Consorcio de Transportes' : 'del Ayuntamiento')} ↗</a></div>` : ''}
    </article>`;
}
function renderCalle() {
  const days = caDays();
  if (!state.caDay || !days.some(x => x.id === state.caDay)) state.caDay = 'hoy';
  $('ca-days').innerHTML = days.map(x => `<button class="pill" data-caday="${x.id}" aria-pressed="${x.id === state.caDay}">${esc(x.label)}</button>`).join('')
    + `<button class="pill cuando" data-cuando="ca" aria-haspopup="dialog">📅 <span>Otro día</span> ▾</button>`;
  const d = days.find(x => x.id === state.caDay).d;
  CA_DATE = d;
  // sin avisos de transporte en la ciudad (p. ej. Bilbao), no hace falta separar por tipo
  const kinds = CLOSURES.some(c => TRANS.includes(c.kind)) ? [['todo', 'Todo'], ['calles', 'Calles'], ['transporte', 'Metro, tren y bus']] : [];
  $('ca-kinds').innerHTML = kinds.map(k => `<button class="pill" data-cakind="${k[0]}" aria-pressed="${state.caKind === k[0]}">${k[1]}</button>`).join('');
  const list = cutsOn(d).filter(x => state.caKind === 'todo' || (state.caKind === 'transporte') === TRANS.includes(x.c.kind));
  const mine = list.filter(x => x.mine).length;
  $('ca-count').textContent = list.length ? `${list.length} avisos ${DIA[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}` + (streets.length ? ` · ${mine} te afectan` : '') : '';
  $('ca-list').innerHTML = list.map(cutCard).join('') || '<div class="empty">No hay cortes anunciados para ese día.</div>';
  // partidos y conciertos en estadios sin aviso oficial todavía: aviso anticipado
  const big = bigEventsOn(d).filter(e => stadiumOf(e.lugar).big).filter(e => !cutsOn(d).some(x => stadiumOf(x.c.title + ' ' + (x.c.summary || '')) === stadiumOf(e.lugar)));
  $('ca-big').innerHTML = big.map(e => { const st = stadiumOf(e.lugar); return `<article class="card cut">
      <div class="tags"><span class="tag">Previsto</span><span class="tag">${esc(st.name)}</span></div>
      <div class="when">${esc(e.hora && e.hora.length < 30 ? e.hora : 'Hora por confirmar')}</div>
      <h3 class="title" style="padding-right:0">${esc(e.titulo)}</h3>
      <p class="meta" style="margin:0">En días de partido o concierto suele haber desvíos de autobuses EMT y cortes alrededor del ${esc(st.name)} desde unas horas antes hasta después del final. El aviso oficial se publica uno o dos días antes y aparecerá aquí.</p>
      <button class="maplink" data-goev="${e.id}">Ver el evento</button></article>`; }).join('');
  CUTS_NOW = list;
  drawMap(list);
  $('ca-mine').innerHTML = streets.map((st, i) => `<button class="filterchip" data-rmstreet="${i}" aria-label="Quitar ${esc(st)}">${esc(st)} <span aria-hidden="true">✕</span></button>`).join('') || '<span class="note">Aún no has añadido ninguna.</span>';
}
// ---------- mapa de cortes (Leaflet + teselas de CARTO sobre OpenStreetMap; se carga solo al abrir Calle)
let MAP = null, LAYER = null, CUTS_NOW = [], SHAPES = {}, CA_DATE = null;
const KCOLOR = { autobus: '#1E5BA8', obras: '#E8590C', cercanias: '#C92A2A', metro_ligero: '#3A86C8' };
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
// una sola carga aunque se pida a la vez desde varios sitios: si el script entra dos veces, hay dos «L» distintos y los mapas fallan al dibujar
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletP) return leafletP;
  return leafletP = new Promise((ok, ko) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; css.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'; css.crossOrigin = 'anonymous';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; js.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'; js.crossOrigin = 'anonymous';
    js.onload = ok; js.onerror = () => { leafletP = null; ko(); };
    document.head.appendChild(js);
  });
}
function popupHtml(x, i, name) {
  const r = x.r, when = r.start ? `${r.start}${r.end ? '–' + r.end : ''}` : 'Todo el día';
  return `<b>${esc(x.c.title)}</b><br>${esc(name || '')}${name ? ' · ' : ''}${esc(when)}<br><button data-cutgo="${i}">Ver el aviso</button>`;
}
function drawMap(list) {
  const withGeo = list.filter(x => x.c.geom).length;
  $('ca-mapwrap').hidden = !withGeo;
  if (!withGeo) return;
  $('ca-mapnote').textContent = withGeo < list.length ? `${list.length - withGeo} de ${list.length} avisos no se pueden situar en el mapa porque no nombran calles ni estaciones concretas.` : '';
  loadLeaflet().then(() => {
    // con la pestaña oculta el mapa no tiene tamaño y Leaflet falla al dibujar: se pinta al abrir «Calle» (go → renderAll)
    if (!$('ca-map').offsetWidth) return;
    if (!MAP) {
      MAP = L.map('ca-map', { scrollWheelZoom: false, zoomSnap: 0.5, zoomAnimation: false })  /* sin animación: al repintar las capas durante el zoom Leaflet fallaba */.setView(CENTER, 12);
      // fondos gratuitos sin clave: «Callejero» (Esri, limpio, parecido a Google Maps), «Gris» (OpenStreetMap atenuado, el de siempre) y «Satélite» (Esri)
      const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', ESRI = 'Mapa © <a href="https://www.esri.com">Esri</a> y colaboradores';
      const capas = {
        'Callejero': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: ESRI }),
        'Gris': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM }),
        'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: ESRI })
      };
      let capa = 'Callejero'; try { const c = localStorage.getItem('bureo.mapa'); if (capas[c]) capa = c; } catch (e) { }
      capas[capa].addTo(MAP);
      $('ca-map').dataset.capa = capa;
      L.control.layers(capas, null, { position: 'topright' }).addTo(MAP);
      MAP.on('baselayerchange', (ev) => { $('ca-map').dataset.capa = ev.name; try { localStorage.setItem('bureo.mapa', ev.name); } catch (e) { } });
      $('ca-map').classList.toggle('night', dark());
      LAYER = L.layerGroup().addTo(MAP);
      // botón «dónde estoy»: pide la ubicación, pone un punto azul y acerca el mapa
      let yo = null;
      const verme = (zoom) => new Promise((ok) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => {
        const ll = [p.coords.latitude, p.coords.longitude];
        if (!yo) yo = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1C7ED6', fillOpacity: 1 }).bindTooltip('Estás aquí').addTo(MAP);
        else yo.setLatLng(ll);
        if (zoom) MAP.setView(ll, zoom);
        ok(ll);
      }, () => ok(null), { timeout: 10000, maximumAge: 60e3, enableHighAccuracy: true }) : ok(null));
      const Gps = L.Control.extend({ onAdd() {
        const b = L.DomUtil.create('button', 'leaflet-bar ca-gps');
        b.type = 'button'; b.title = 'Ir a mi ubicación'; b.setAttribute('aria-label', 'Ir a mi ubicación');
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
        L.DomEvent.disableClickPropagation(b);
        b.onclick = async () => { b.classList.add('busy'); const ll = await verme(16); b.classList.remove('busy'); if (!ll) toast('No hemos podido saber dónde estás. Revisa el permiso de ubicación del navegador.'); };
        return b;
      } });
      new Gps({ position: 'topleft' }).addTo(MAP);
      try { new ResizeObserver(() => MAP.invalidateSize()).observe(MAP.getContainer()); } catch (e) { }  // al cambiar el ancho de la ventana
      // si ya diste permiso de ubicación y estás en esta ciudad, el mapa empieza centrado en ti
      (async () => {
        try { if (!navigator.permissions || (await navigator.permissions.query({ name: 'geolocation' })).state !== 'granted') return; } catch (e) { return; }
        const ll = await verme(0);
        if (ll && MAP.distance(ll, CENTER) < 25000 && !CUTS_NOW.some((x) => x.mine)) MAP.setView(ll, 14);
      })();
    }
    MAP.invalidateSize();
    LAYER.clearLayers(); SHAPES = {};
    const all = [];
    // primero lo que no te afecta, para que lo tuyo quede encima
    list.map((x, i) => [x, i]).sort((a, b) => a[0].mine - b[0].mine).forEach(([x, i]) => {
      const g = x.c.geom; if (!g) return;
      const col = KCOLOR[x.c.kind] || '#E03131', pts = [];
      (g.segs || []).forEach(sg => {
        if (x.mine) L.polyline(sg.l, { color: '#FFD43B', weight: 13, opacity: 0.95, lineCap: 'round' }).addTo(LAYER);
        const pl = L.polyline(sg.l, { color: sg.c || col, weight: sg.x ? 6 : 5, opacity: sg.x ? 0.95 : 0.8, dashArray: sg.x ? null : '1 9', lineCap: 'round' });
        pl.bindPopup(popupHtml(x, i, sg.n)).addTo(LAYER);
        pts.push(...sg.l);
      });
      (g.pts || []).forEach(p => {
        const metro = TRANS.includes(x.c.kind) && x.c.kind !== 'autobus';
        const ring = metro ? ((g.segs || [])[0] || {}).c || '#12182B' : '#FFFFFF';
        const m = L.circleMarker(p.p, { radius: x.mine ? 10 : 8, color: x.mine ? '#FFD43B' : ring, weight: x.mine ? 4 : metro ? 4 : 2.5, fillColor: metro ? '#FFFFFF' : col, fillOpacity: 1 });
        m.bindPopup(popupHtml(x, i, p.n)).addTo(LAYER);
        pts.push(p.p);
      });
      SHAPES[i] = pts;
      all.push(...pts);
    });
    const mineB = list.map((x, i) => x.mine ? SHAPES[i] || [] : []).flat();
    const centro = all.filter(p => Math.abs(p[0] - CENTER[0]) < 0.065 && Math.abs(p[1] - CENTER[1]) < 0.085);  // ~7 km alrededor del centro
    const b = mineB.length ? mineB : centro.length ? centro : all;
    if (b.length) MAP.fitBounds(b, { padding: [24, 24], maxZoom: 15 });
  }).catch(() => { $('ca-mapwrap').hidden = true; });
}
function focusCut(i) {
  const b = SHAPES[i]; if (!MAP || !b || !b.length) return;
  $('ca-mapwrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  MAP.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
}
function goCut(i) {
  const el = $('cut-' + i); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
}
function streetBanner() {
  if (!streets.length) return '';
  for (const x of caDays()) {
    const n = cutsOn(x.d).filter(y => y.mine).length;
    if (n) return `<button class="banner" data-goto="calle" data-caday-go="${x.id}"><b>${x.label}: ${n} ${n === 1 ? 'aviso' : 'avisos'} en tus calles o líneas</b><span>Toca para ver qué calles y a qué horas.</span></button>`;
  }
  return '';
}
const aHoras = t => { const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] + +m[2] / 60 : null; };
const mxy = (p, o) => [(p[1] - o[1]) * 84800, (p[0] - o[0]) * 111320];
function cutDistance(o, g) {
  let best = 1e9, nom = null;
  for (const sg of g.segs) {
    const l = sg.l, b0 = best;
    for (let i = 0; i < l.length; i++) {
      const a = mxy(l[i], o);
      if (i === 0) best = Math.min(best, Math.hypot(a[0], a[1]));
      if (i + 1 < l.length) {
        const b = mxy(l[i + 1], o), dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L)) : 0;
        best = Math.min(best, Math.hypot(a[0] + t * dx, a[1] + t * dy));
      }
    }
    if (best < b0) nom = sg.n;
  }
  for (const p of g.pts) { const a = mxy(p.p, o); best = Math.min(best, Math.hypot(a[0], a[1])); }
  return { m: best, nom };
}
const warnCache = {};
function streetWarn(e, occ) {
  if (!e.lat || !occ || occ.ongoing) return '';
  const d = occ.date;
  if (d - today > 14 * 864e5 || d < today) return '';
  const k = e.id + ':' + ymd(d);
  if (!(k in warnCache)) {
    const o = [e.lat, e.lng]; let out = [];
    for (const g of GEOCUTS) {
      const r = activeOn(g.c, d); if (!r) continue;
      const trans = TRANS.includes(g.c.kind) && g.c.kind !== 'autobus';
      const { m, nom } = cutDistance(o, g);
      if (m > (trans ? 700 : 350)) continue;
      // un corte que acaba antes de que empiece el plan no le afecta
      const hi = startHour(e), hf = aHoras(r.end);
      if (hi != null && hf != null && hf <= hi && hf > (aHoras(r.start) ?? -1)) continue;
      const where = trans ? g.c.title : (g.segs.length ? 'corte en ' + (nom || g.c.title) : g.c.title);
      out.push({ m, t: where + (m > 60 ? ` (a ${Math.round(m / 50) * 50} m)` : '') + (r.start ? `, ${r.start}${r.end ? '–' + r.end : ''}` : '') });
    }
    // estadios: avisos sin calles concretas (desvíos EMT) y partidos o conciertos aún sin aviso oficial
    for (const st of STADIUMS) {
      const m = km(o, st.ll) * 1000; if (m > 1200) continue;
      const cs = CLOSURES.filter(c => stadiumOf(c.title + ' ' + (c.summary || '')) === st && activeOn(c, d));
      cs.forEach(c => { const r = activeOn(c, d); out.push({ m: m - 1, t: c.title + (r.start ? `, ${r.start}${r.end ? '–' + r.end : ''}` : '') }); });
      if (!cs.length && st.big) bigEventsOn(d, st).filter(x => x.id !== e.id).slice(0, 1).forEach(x => out.push({ m, t: `${x.titulo} en el ${st.name}${x.hora && x.hora.length < 12 ? ' (' + x.hora + ')' : ''}: puede haber cortes y desvíos` }));
    }
    out.sort((a, b) => a.m - b.m);
    const seenW = new Set();
    out = out.filter(x => { const key = x.t.replace(/ \(a .*$|, \d.*$/, ''); if (seenW.has(key)) return false; seenW.add(key); return true; });
    // una sola línea (el resto, al tocarla o en el texto completo del aviso)
    const dia = +d === +today ? 'Hoy' : 'Ese día';
    warnCache[k] = out.length ? `<div class="streetwarn"><span class="sw1">⚠ ${dia}${out.length > 1 ? ` (${out.length} avisos)` : ''}: ${esc(out[0].t)}</span><span class="swall">⚠ ${dia}: ${esc(out.map(x => x.t).join(' · '))}</span></div>` : '';
  }
  return warnCache[k];
}
const stadiumOf = t => STADIUMS.find(st => st.re.test(t || ''));
function bigEventsOn(d, st) {
  const k = ymd(d), seen = new Set();
  return EV.filter(e => {
    const s2 = stadiumOf(e.lugar); if (!s2 || (st && s2 !== st)) return false;
    if (e.sesiones.length > 1 ? !e.sesiones.includes(k) : !(e.inicio === k && e.fin === k)) return false;  // las exposiciones largas no cuentan
    const key = s2.name + '|' + (startHour(e) || '');  // el mismo partido puede venir de dos fuentes
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
// ---------- lluvia: previsión de Open-Meteo (centro de la ciudad) para planes al aire libre, próximos 7 días
const OUTDOOR = new Set(['aire_libre', 'mercadillos', 'fiestas', 'desfiles', 'religiosas', 'calle', 'rutas', 'carreras', 'maratones', 'trail', 'bici', 'triatlon',
  'natacion', 'tematicas', 'solidarias', 'foodtrucks', 'carreras_perro', 'quedadas_perro', 'aves', 'excursiones', 'huertos', 'itinerarios', 'jardines', 'senderismo', 'g:naturaleza', 'beneficos']);
const isOutdoor = e => e.cats.some(c => OUTDOOR.has(c)) || /al aire libre/i.test(e.descripcion || '');
let RAIN = null;
// avisos meteorológicos naranja/rojo de AEMET: en los planes al aire libre y, si hay uno hoy o mañana, una línea en Para ti
let AVISOS = [];
const fen = a => a.phenomenon.toLowerCase().replace(/^temperaturas /, 'temperaturas ').replace(/^vientos$/, 'viento');
function avisoDe(d) {  // el aviso más grave que toca ese día
  const a0 = new Date(d); a0.setHours(0, 0, 0, 0); const a1 = new Date(a0); a1.setDate(a1.getDate() + 1);
  return AVISOS.filter(a => new Date(a.starts) < a1 && new Date(a.ends) > a0).sort((x, y) => (y.level === 'rojo') - (x.level === 'rojo'))[0];
}
function avisoHoy() {
  const t = new Date(today), m = new Date(today); m.setDate(m.getDate() + 1);
  const a = avisoDe(t) || avisoDe(m); if (!a) return '';
  const cuando = avisoDe(t) ? 'hoy' : 'mañana';
  return `<div class="rainwarn" style="margin-bottom:8px">${a.level === 'rojo' ? '🟥' : '🟧'} Aviso ${a.level} de AEMET por ${esc(fen(a))} ${cuando} (${esc(a.zone)}). Ojo con los planes al aire libre.</div>`;
}
function rainWarn(e, occ) {
  if (occ && isOutdoor(e) && AVISOS.length) {
    const a = avisoDe(occ.ongoing ? today : occ.date);
    if (a) return `<div class="rainwarn">${a.level === 'rojo' ? '🟥' : '🟧'} Aviso ${a.level} de AEMET por ${esc(fen(a))} ese día</div>`;
  }
  if (!RAIN || !occ || !isOutdoor(e)) return '';
  const d = occ.ongoing ? today : occ.date, k = ymd(d);
  if (!(k in RAIN.daily)) return '';
  const h = occ.ongoing ? null : startHour(e);
  const p = h != null && RAIN.hourly[k] ? Math.max(...RAIN.hourly[k].slice(Math.floor(h), Math.floor(h) + 3).map(x => x || 0)) : RAIN.daily[k];
  if (p < 50) return '';
  return `<div class="rainwarn">☔ ${p} % de probabilidad de lluvia ${+d === +today ? 'hoy' : 'ese día'}${h != null ? ' a esa hora' : ''}</div>`;
}
// ---------- ¿cortes en el camino? ruta en coche (OSRM) contra los cortes con calles en el mapa
async function checkRoute(e) {
  state.route = state.route || {};
  const put = h => { state.route[e.id] = h; renderAll(); };
  let pos = userPos;
  if (!pos) {
    if (!navigator.geolocation) { put('Tu navegador no permite saber dónde estás.'); return; }
    put('Buscando dónde estás…');
    try { pos = await new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(p => ok([p.coords.latitude, p.coords.longitude]), ko, { timeout: 10000, maximumAge: 300000 })); userPos = pos; keepDist(); }
    catch (x) { put('Sin permiso de ubicación no puedo calcular la ruta.'); return; }
  }
  if (km(pos, CENTER) > 35) { put(`Estás lejos de ${CITY.name}: no puedo comprobar la ruta desde ahí.`); return; }
  put('Calculando la ruta…');
  const occ = occurs(e, today, addDays(today, 400)), d = occ ? (occ.ongoing ? today : occ.date) : today;
  try {
    const { data: rt, error } = await window.limonFn('limon-route', { body: { from: pos, to: [e.lat, e.lng] } });
    if (error || !rt || !rt.line) throw new Error('sin ruta');
    const line = rt.line;
    const hits = [];
    for (const g of GEOCUTS) {
      if (TRANS.includes(g.c.kind) || !g.segs.length) continue;
      const r = activeOn(g.c, d); if (!r) continue;
      const gs = { segs: g.segs, pts: [] };
      if (line.some(p => cutDistance(p, gs).m < 25)) hits.push(`${(g.c.geom.segs[0] || {}).n || g.c.title}${r.start ? ` (${r.start}${r.end ? '–' + r.end : ''})` : ''}`);
    }
    const day = +d === +today ? 'hoy' : 'ese día';
    put(`🚗 En coche: ${fmtDist(rt.distance / 1000)}, unos ${Math.max(1, Math.round(rt.duration / 60))} min. ` +
      (hits.length ? `<b>${hits.length === 1 ? 'Hay un corte' : 'Hay ' + hits.length + ' cortes'} en la ruta ${day}:</b> ${esc([...new Set(hits)].slice(0, 4).join(' · '))}. Mejor en transporte público o rodeando.` : `Sin cortes anunciados en la ruta ${day}.`) +
      ` <span class="note">Solo se comprueban los avisos que nombran calles concretas.</span>`);
  } catch (x) { put('No he podido calcular la ruta ahora. Prueba en un rato.'); }
}
