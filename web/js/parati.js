// Limón · Para ti: cerca de ti, «¿Al final fuiste?» y selección de la IA

// ---------- «Ahora cerca de ti»: lo que empieza en las próximas 3 horas cerca, y lo abierto hoy
let NEARMAP = null, NEARLAYER = null, nearPos = null;
function nearNow() {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
  const soon = [], open = [];
  for (const e of EV) {
    if (!e.lat || isDismissed(e)) continue;
    const occ = occurs(e, today, today); if (!occ) continue;
    const d = km(nearPos, [e.lat, e.lng]); if (d > 3) continue;
    const sh = startHour(e);
    if (sh != null && !occ.ongoing) { if (sh >= h - 0.25 && sh <= h + 3) soon.push({ e, occ, d, sh }); }
    else if (occ.ongoing && e.cats.some(c => ['arte', 'patrimonio'].includes(groupOf(c)))) open.push({ e, occ, d });
  }
  soon.sort((a, b) => a.sh - b.sh || a.d - b.d); open.sort((a, b) => a.d - b.d);
  return { soon: soon.slice(0, 20), open: open.slice(0, 8) };
}
function renderNear() {
  if (!nearPos) return;
  const { soon, open } = nearNow();
  const hh = x => { const m = Math.round((x - Math.floor(x)) * 60); return String(Math.floor(x)).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
  const dist = d => d < 1 ? Math.round(d * 1000 / 50) * 50 + ' m' : d.toFixed(1).replace('.', ',') + ' km';
  $('near-lead').textContent = soon.length ? `${soon.length} planes empiezan en las próximas 3 horas a menos de 3 km.` : 'No hay nada que empiece en las próximas 3 horas a menos de 3 km.';
  $('near-list').innerHTML = (soon.length ? soon.map(x => card(x.e, { occ: x.occ, info: `Empieza a las ${hh(x.sh)}, a ${dist(x.d)} de ti` })).join('') : '') +
    (open.length ? `<h2>Abierto hoy cerca</h2>` + open.map(x => card(x.e, { occ: x.occ, info: `A ${dist(x.d)} de ti` })).join('') : '');
  loadLeaflet().then(() => {
    if (!NEARMAP) {
      NEARMAP = L.map('near-map', { scrollWheelZoom: false, zoomAnimation: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(NEARMAP);
      NEARLAYER = L.layerGroup().addTo(NEARMAP);
      $('near-map').classList.toggle('night', dark());
    }
    NEARMAP.invalidateSize(); NEARLAYER.clearLayers();
    L.circleMarker(nearPos, { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#1E5BA8', fillOpacity: 1 }).bindPopup('Estás aquí').addTo(NEARLAYER);
    const all = [nearPos];
    soon.concat(open).forEach(x => {
      L.circleMarker([x.e.lat, x.e.lng], { radius: 7, color: '#2B2306', weight: 2, fillColor: x.sh != null ? '#FFD43B' : '#FFFFFF', fillOpacity: 1 })
        .bindPopup(`<b>${esc(x.e.titulo)}</b><br>${x.sh != null ? hh(x.sh) + ' · ' : ''}${esc(x.e.lugar || '')}`).addTo(NEARLAYER);
      all.push([x.e.lat, x.e.lng]);
    });
    NEARMAP.fitBounds(all, { padding: [24, 24], maxZoom: 15 });
  });
}
// ---------- vistas
const $ = id => document.getElementById(id);
// qué planes se enseñaron (para saber qué se ve y no se elige); como mucho uno cada 3 s
let listTimer = null, lastList = '';
function logList(ids) {
  clearTimeout(listTimer);
  const tab = state.tab, when = state.when;
  listTimer = setTimeout(() => { const k = when + ids.join(','); if (k === lastList || !ids.length) return; lastList = k; track('lista', null, { tab, when, ids: ids.slice(0, 40).map(x => +String(x).slice(1)) }); }, 3000);
}
// ---------- «¿Al final fuiste?»: los planes guardados que ya pasaron (últimos 10 días) se preguntan una vez, dentro de Para ti
let PAST = {};
async function loadPast() {
  const db = window.limonDB; if (!db) return;
  const ids = saved.filter(id => !went.includes(id) && !nofui.includes(id) && !(BYID[id] && parse(BYID[id].fin) >= today)).map(id => +String(id).slice(1)).filter(Boolean);
  if (fuiFocus && /^e\d+$/.test(fuiFocus) && !ids.includes(+fuiFocus.slice(1))) ids.push(+fuiFocus.slice(1));
  if (!ids.length) return;
  const { data } = await db.sb.from('events').select('id,title,starts_on,ends_on,venues(name),event_sessions(on_date),event_categories(category_id)')
    .in('id', ids.slice(0, 150)).gte('ends_on', ymd(addDays(today, -10))).lt('starts_on', ymd(today));
  PAST = {};
  for (const r of data || []) {
    const past = (r.event_sessions || []).map(x => x.on_date).filter(d => d < ymd(today)).sort();
    const when = past.length ? past[past.length - 1] : (r.ends_on < ymd(today) ? r.ends_on : null);
    if (!when) continue;
    PAST['e' + r.id] = { id: 'e' + r.id, titulo: r.title, fecha: when, lugar: r.venues && r.venues.name, cats: (r.event_categories || []).map(c => c.category_id), temas: [], serie: null };
  }
  if (Object.keys(PAST).length && state.tab === 'parati') renderParaTi();
}
function fuiNext() {
  const open = Object.values(PAST).filter(x => !went.includes(x.id) && !nofui.includes(x.id) && !dismissed.includes(x.id) && !(fuiSnooze[x.id] && fuiSnooze[x.id] > ymd(today)));
  return open.find(x => x.id === fuiFocus) || open.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
}
let fuiRate = null;  // el plan al que acabas de decir «Sí, fui»: la misma tarjeta pide la nota
function fuiValorado(id, n) {
  if (fuiRate !== id) return;
  fuiRate = null;
  toast(n >= 4 ? '¡Apuntado! Te recomendaremos más planes así.' : n <= 2 ? 'Apuntado. No te recomendaremos más planes como este.' : 'Apuntado en tu diario.');
}
function fuiCard() {
  if (fuiRate && PAST[fuiRate]) {
    const r = PAST[fuiRate];
    return `<div class="consent" role="region" aria-label="Valora el plan">
      <p style="margin:0"><b>¿Qué tal «${esc(r.titulo)}»?</b> Tu nota nos ayuda a recomendarte mejor (solo la ves tú, salvo que tu perfil sea público).</p>
      <div class="seg" style="align-items:center"><span class="stars" role="group" aria-label="Tu valoración">${[1, 2, 3, 4, 5].map(n => `<button class="star" data-rate="${r.id}" data-n="${n}" aria-label="${n} de 5">☆</button>`).join('')}</span>
      <button class="btn ghost" data-fui="saltar" data-id="${r.id}">Ahora no</button></div></div>`;
  }
  const x = fuiNext(); if (!x) return '';
  const d = parse(x.fecha), dias = Math.round((today - d) / 864e5);
  const cuando = dias === 1 ? 'ayer' : `el ${DIA[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`;
  return `<div class="consent" role="region" aria-label="¿Al final fuiste?">
      <p style="margin:0"><b>¿Al final fuiste a «${esc(x.titulo)}»?</b> Lo tenías guardado para ${cuando}${x.lugar ? ' en ' + esc(x.lugar) : ''}.</p>
      <div class="seg"><button class="btn" data-fui="si" data-id="${x.id}">Sí, fui</button><button class="btn ghost" data-fui="no" data-id="${x.id}">No pude ir</button><button class="btn ghost" data-fui="luego" data-id="${x.id}">Ahora no</button></div></div>`;
}
function fuiAnswer(id, a) {
  if (a === 'saltar') { fuiRate = null; renderParaTi(); return; }
  const x = PAST[id]; if (!x) return;
  if (fuiFocus === id) fuiFocus = null;
  if (a === 'si') { ponWent(went.concat(id)); store.set('went', went); BYID[id] = BYID[id] || Object.assign({ inicio: x.fecha, fin: x.fecha, sesiones: [], fuentes: [] }, x); learn(x, 'went'); fuiRate = id; }
  else if (a === 'no') { ponNofui(nofui.concat(id)); store.set('nofui', nofui); track('novoy', id); toast('Entendido. No cambia tus recomendaciones.'); }
  else { fuiSnooze[id] = ymd(addDays(today, 2)); store.set('fui_snooze', fuiSnooze); }
  renderParaTi();
}
// permiso para estadísticas: se pregunta una vez, dentro de la lista (sin ventanas emergentes)
function consentCard() {
  if (!window.limonConsent || window.limonConsent.get() !== null) return '';
  if (store.get('abiertos', 0) < 2) return '';  // se pregunta cuando ya ha curioseado un poco, no nada más llegar
  return `<div class="consent" role="region" aria-label="Estadísticas de uso">
      <p style="margin:0"><b>¿Nos ayudas a mejorar Limón?</b> Si nos dejas, guardamos qué planes abres, guardas o compartes para mejorar las recomendaciones de todos y saber qué tipo de planes interesan en la ciudad. Sin anuncios y sin vender datos de nadie.</p>
      <div class="seg"><button class="btn" data-consent="1">Vale</button><button class="btn ghost" data-consent="0">No, gracias</button><a class="note" href="privacidad.html#estadisticas">Más información</a></div></div>`;
}
// aviso bien visible arriba de Para ti cuando hay planes nuevos desde la última visita
function newBanner() {
  const n = nNew(); if (!n || F.nuevos || first) return '';  // en la primera visita no hay «última visita»
  return `<div class="consent" role="region" aria-label="Planes nuevos" style="margin:0 0 10px;flex-direction:row;align-items:center;justify-content:space-between;gap:10px">
      <div><b>✨ ${n} ${n === 1 ? 'plan nuevo' : 'planes nuevos'}</b> desde tu última visita.</div><button class="btn" data-nuevos-ver>Verlos</button></div>`;
}
// mete algo después de la 3.ª tarjeta (o al final si hay menos)
// el botón de intereses, tras los primeros planes: 3 en el móvil, 4 en el ordenador (dos filas completas de la cuadrícula)
function tras3(html, extra) { const tope = matchMedia('(min-width: 1024px)').matches ? 4 : 3; let n = 0, at = -1; html.replace(/<\/article>/g, (m, k) => { if (++n === tope) at = k + m.length; return m; }); return at < 0 ? html + extra : html.slice(0, at) + extra + html.slice(at); }
// P8 · intereses al llegar: una franja encima de la lista con los grandes temas; tocar uno repinta la lista al momento.
// Sigue visible mientras se eligen (state.franja); el detalle, en «Más…» o en Perfil.
function franjaIntereses() {
  const on = g => g.items.every(it => prefs[it.id] === 1);
  const ORDEN = ['musica', 'escena', 'familia', 'arte', 'cine', 'gastro', 'naturaleza', 'deporte', 'fiestas', 'letras', 'patrimonio', 'aprender', 'ciencia'];
  const pos = g => { const i = ORDEN.indexOf(g.id); return i < 0 ? 99 : i; };
  // primero lo ya elegido (que se vea marcado) y después lo que más se busca
  const grupos = TAX.filter(g => EMO[g.id] && g.items.length).sort((a, b) => (on(b) - on(a)) || (pos(a) - pos(b)));
  return `<div class="franja" role="group" aria-label="Tus intereses"><p class="note">${state.franja ? 'Toca más si quieres; la lista ya es solo para ti.' : '¿Qué te apetece? Toca y la lista cambia al momento.'}</p>
    <div class="fchips">${grupos.map(g => `<button class="qchip" data-qfr="${g.id}" aria-pressed="${on(g)}"><span aria-hidden="true">${EMO[g.id]}</span> ${esc(g.name)}</button>`).join('')}<button class="qchip" data-intereses-rapido>Más…</button></div></div>`;
}
function clicQfr(ev) {
  const b = ev.target.closest('[data-qfr]'); if (!b) return false;
  const g = TAX.find(x => x.id === b.dataset.qfr); if (!g) return true;
  const all = g.items.every(it => prefs[it.id] === 1);
  g.items.forEach(it => { if (all) delete prefs[it.id]; else prefs[it.id] = 1; });
  store.set('prefs', prefs);
  if (!state.franja && window.limonContar) window.limonContar('intereses');
  state.franja = true; state.ptShown = 20; renderAll();
  return true;
}
function renderParaTi() {
  $('new-hint').innerHTML = newBanner();
  const [a, b] = range(state.when);
  if (!Object.values(prefs).some(v => v === 1) && !Object.values(learned).some(v => v >= 2) && !(taste && ((taste.categorias || []).length || (taste.temas || []).length)) && !Object.keys(FRIENDS).length && !TOPICS.length) {
    const items = [];
    for (const e of EV) {
      if (isDismissed(e)) continue;
      if (isFamily(e) && !opts.ninos) continue;
      const occ = occurs(e, a, b); if (!occ || !passF(e, occ)) continue;
      const s = (e.unico ? 3 : 0) + (e.destacado ? 2 : 0) + (e.fuentes.length > 1 ? 1 : 0) - (esProf(e) ? 6 : 0);
      items.push({ e, occ, s });  // en pueblos con pocos destacados, detrás van los demás por fecha
    }
    items.sort((x, y) => (largo(x.e, x.occ) - largo(y.e, y.occ)) || zoneSort(x.e, y.e, y.s - x.s || x.occ.date - y.occ.date || horaOrden(x.e) - horaOrden(y.e)));
    $('pt-h').textContent = 'Destacado ' + cuandoTxt(state.when).frase.replace(/^en los próximos/, 'en los próximos');
    // la presentación, solo las primeras veces; después, la lista empieza arriba
    $('pt-lead').textContent = VISITAS <= 2 ? 'Todos los planes de ' + CITY.name + ' en un sitio, gratis y sin anuncios. Marca tus intereses y esta lista será solo para ti.' : '';
    $('pt-lead').hidden = VISITAS > 2;
    logList(items.slice(0, state.ptShown).map(x => x.e.id));
    $('pt-list').innerHTML = instalarCard() + avisoHoy() + shareFindeBtn() + zoneNote() + streetBanner() + (fuiCard() || consentCard()) + friendsBlock(a, b) +
      // se eligen los más destacados y se enseñan por orden de día y hora (en un municipio, primero los suyos)
      franjaIntereses() + conSeccion(ZONE ? items.slice(0, state.ptShown) : items.slice(0, state.ptShown).sort((x, y) => (largo(x.e, x.occ) - largo(y.e, y.occ)) || (x.occ.date - y.occ.date) || (horaOrden(x.e) - horaOrden(y.e)) || (y.s - x.s)), x => card(x.e, { occ: x.occ }));
    $('pt-list').insertAdjacentHTML('beforeend', resumenCard());
    $('pt-more').hidden = items.length <= state.ptShown;
    document.querySelectorAll('[data-when]').forEach(b => b.setAttribute('aria-pressed', b.dataset.when === state.when));
    return;
  }
  const items = [];
  for (const e of EV) {
    const occ = occurs(e, a, b); if (!occ || !passF(e, occ)) continue;
    const sc = score(e); if (sc.s < 1.5) continue;
    if (ZONE) sc.s -= Math.min(2, zkm(e) / 10);  // a igualdad de gustos, antes lo cercano
    items.push({ e, occ, sc });
  }
  items.sort((x, y) => (largo(x.e, x.occ) - largo(y.e, y.occ)) || (y.sc.s - x.sc.s) || (x.occ.date - y.occ.date));
  const top = items.slice(0, state.ptShown);
  const dated = top.filter(x => !largo(x.e, x.occ)).sort((x, y) => x.occ.date - y.occ.date || horaOrden(x.e) - horaOrden(y.e) || y.sc.s - x.sc.s);
  const going = top.filter(x => largo(x.e, x.occ)).sort((x, y) => parse(x.e.fin) - parse(y.e.fin));
  const label = cuandoTxt(state.when).frase.replace(/^en /, '');
  $('pt-h').textContent = items.length ? `${items.length} ${items.length === 1 ? 'plan' : 'planes'} para ti ${label}` : `Nada para ti ${label}`;
  $('pt-lead').textContent = items.length ? '' : 'Prueba con un rango más amplio o marca más intereses.';
  $('pt-lead').hidden = !!items.length;
  const html = (dated.length ? `<h2>Con fecha</h2>` + dated.map(x => card(x.e, { occ: x.occ, why: x.sc.hits })).join('') : '') +
    (going.length ? SEC_LARGOS + going.map(x => card(x.e, { occ: x.occ, why: x.sc.hits })).join('') : '');
  logList(top.map(x => x.e.id));
  $('pt-list').innerHTML = instalarCard() + shareFindeBtn() + zoneNote() + streetBanner() + (fuiCard() || consentCard()) + friendsBlock(a, b) + (state.franja ? franjaIntereses() : '') + aiBlock() + (html ? '<h2>Todo lo que encaja</h2>' + html.replace('<h2>Con fecha</h2>', '') : '<div class="empty">No hay eventos que encajen con tus intereses en estas fechas.</div>');
  $('pt-list').insertAdjacentHTML('beforeend', resumenCard());
  $('pt-more').hidden = items.length <= state.ptShown;
  document.querySelectorAll('[data-when]').forEach(b => b.setAttribute('aria-pressed', b.dataset.when === state.when));
}
// ---------- selección de la IA (servidor): 6–10 planes con el porqué
function aiBlock() {
  const w = state.when;
  if (!logged) return `<div class="ai"><h2>Elegidos para ti</h2><p class="note" style="margin:0">Con una cuenta gratis, cada semana te elegimos los mejores planes con el porqué de cada uno, y te avisamos antes de los que guardes.</p><button class="btn" data-goto="intereses" style="align-self:flex-start">Crear cuenta gratis</button></div>`;
  if (!['semana', 'finde', 'mes'].includes(w)) return '';  // la selección de la IA es por semana, finde o mes
  const r = aiReco[w];
  if (!r) { loadAI(w, false); return `<div class="ai"><h2>Eligiendo tus planes…</h2></div>`; }
  if (r.loading) return `<div class="ai"><h2>Eligiendo tus planes…</h2></div>`;
  if (r.error) return `<div class="ai"><h2>Elegidos para ti</h2><p class="note" style="margin:0">${esc(r.error)}</p></div>`;
  // la selección se guarda unos días: un plan que ya no cae en estas fechas (o ya pasó) se quita, no rompe la lista
  const list = (r.planes || []).map(p => ({ e: BYID['e' + p.id], why: p.por_que })).filter(x => x.e && !isDismissed(x.e))
    .map(x => ({ ...x, occ: occurs(x.e, ...range(w)) })).filter(x => x.occ && passF(x.e, x.occ));
  if (!list.length) return '';
  // primero lo que tiene día concreto (por fecha y hora); las exposiciones y ciclos largos, al final
  list.sort((x, y) => (largo(x.e, x.occ) - largo(y.e, y.occ)) || (largo(x.e, x.occ) ? parse(x.e.fin) - parse(y.e.fin) : (x.occ.date - y.occ.date) || ((startHour(x.e) ?? 99) - (startHour(y.e) ?? 99))));
  return `<section class="ai" aria-label="Elegidos para ti"><h2>Elegidos para ti</h2>
      <p class="note" style="margin:0">Hemos repasado ${r.candidatos || 'los'} planes que encajan contigo y nos quedamos con estos.</p>
      ${conSeccion(list, x => card(x.e, { occ: x.occ, reason: x.why })).replace(SEC_LARGOS, '<h3 class="sec-largos" style="margin-bottom:0;font:600 14px var(--f-body);color:var(--quiet)">Y en curso estos días</h3>')}
      <button class="btn ghost" data-ai-refresh style="align-self:flex-start">Volver a elegir</button></section>`;
}
async function loadAI(w, force) {
  aiReco[w] = { loading: true };
  const res = await window.limonAI({ action: 'recommend', when: w, force });
  aiReco[w] = res && !res.error ? res : { error: (res && res.error) || 'No se ha podido conectar. Prueba en un rato.' };
  if (res && res.vacio) aiReco[w] = { error: 'Cuéntanos qué te gusta en tu perfil o marca intereses y elegiremos por ti.' };
  if (state.tab === 'parati') renderParaTi();
}
function renderTaste() {
  if (document.activeElement !== $('ts-text')) $('ts-text').value = tasteText || '';
  $('ts-go').disabled = !logged;
  if (!logged) $('ts-msg').textContent = 'Entra con tu cuenta (arriba, en «Entra o crea tu cuenta») para usarlo.';
  else if ($('ts-msg').textContent.startsWith('Entra')) $('ts-msg').textContent = '';
  if (!taste) { $('ts-out').innerHTML = ''; return; }
  const cats = (taste.categorias || []).slice().sort((a, b) => b.peso - a.peso);
  // sin el resumen en prosa: repetía casi lo que escribió el usuario; quedan los temas y categorías, que sí se pueden corregir
  $('ts-out').innerHTML = `${(taste.temas || []).length ? `<h3 style="margin:4px 0 0;font:600 13px var(--f-body);color:var(--quiet)">Temas que busco por ti</h3><div class="seg">${taste.temas.map((t, i) => `<button class="tchip" data-rmtema="${i}" aria-label="Quitar ${esc(t)}">${esc(t)} <span aria-hidden="true">✕</span></button>`).join('')}</div>` : ''}
      ${cats.length ? `<h3 style="margin:4px 0 0;font:600 13px var(--f-body);color:var(--quiet)">Categorías</h3><div class="seg">${cats.map((c, i) => `<button class="tchip" style="background:var(--chip);color:var(--ink)" data-rmtcat="${esc(c.id)}" aria-label="Quitar ${esc(labelOf(c.id))}">${esc(labelOf(c.id))}${c.peso === 3 ? ' ★' : ''} <span aria-hidden="true">✕</span></button>`).join('')}</div>` : ''}
      ${(taste.evitar || []).length ? `<p class="note">Evito: ${taste.evitar.map(c => esc(labelOf(c))).join(', ')}</p>` : ''}
      ${taste.pregunta ? `<p class="note"><b>Para afinar:</b> ${esc(taste.pregunta)} Añádelo al texto y vuelve a interpretarlo.</p>` : ''}`;
}
function setTaste(t) { ponTaste(t); store.set('taste', taste); Object.keys(aiReco).forEach(k => delete aiReco[k]); }
function renderUnicos() {
  const list = EV.filter(e => e.unico && !esProf(e) && !isDismissed(e) && parse(e.fin) >= today && inZone(e))
    .map(e => ({ e, occ: occurs(e, today, addDays(today, 400)) })).filter(x => x.occ)
    .sort((x, y) => (largo(x.e, x.occ) - largo(y.e, y.occ)) || zoneSort(x.e, y.e, x.occ.date - y.occ.date || horaOrden(x.e) - horaOrden(y.e)));
  $('un-list').innerHTML = conSeccion(list, x => card(x.e, { occ: x.occ })) || '<div class="empty">No hay planes únicos en las próximas semanas.</div>';
}

// ---------- arranque: «¿al final fuiste?»
let fuiSnooze, fuiFocus;
function iniciaFui() {
  fuiSnooze = store.get('fui_snooze', {});
  fuiFocus = new URLSearchParams(location.search).get('fui');
}

// ---------- arranque: «cuéntanos qué te gusta» y «ahora cerca de ti»
function iniciaGustosYCerca() {
  $('ts-go').addEventListener('click', async () => {
    const text = $('ts-text').value.trim();
    if (text.length < 8) { $('ts-msg').textContent = 'Cuéntame un poco más.'; return; }
    $('ts-go').disabled = true; $('ts-msg').textContent = 'Interpretando…';
    const res = await window.limonAI({ action: 'taste', text });
    $('ts-go').disabled = false;
    if (!res || res.error) { $('ts-msg').textContent = (res && res.error) || 'No se ha podido conectar. Prueba en un rato.'; return; }
    ponTasteText(text); store.set('taste_text', text); setTaste(res.taste);
    $('ts-msg').textContent = 'Listo. Para ti ya usa este perfil.'; renderIntereses();
  });
  $('near-go').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Tu navegador no permite saber dónde estás.'); return; }
    $('near-go').disabled = true; $('near-go').textContent = 'Buscando dónde estás…';
    navigator.geolocation.getCurrentPosition(p => {
      nearPos = [p.coords.latitude, p.coords.longitude]; ponUserPos(nearPos); keepDist();
      $('near-go').disabled = false; $('near-go').textContent = '📍 Ahora cerca de ti';
      if (km(nearPos, CENTER) > 25) toast(`Pareces estar fuera de ${CITY.name}: te enseño lo que hay cerca del centro.`), nearPos = CENTER;
      $('near').hidden = false; $('near-go').hidden = true; renderNear(); $('near').scrollIntoView({ behavior: 'smooth' });
    }, () => { $('near-go').disabled = false; $('near-go').textContent = '📍 Ahora cerca de ti'; toast('Sin permiso de ubicación no puedo saber qué tienes cerca.'); }, { timeout: 12000, maximumAge: 120000 });
  });
  $('near-close').addEventListener('click', () => { $('near').hidden = true; $('near-go').hidden = false; });
}

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicRmtema(ev) {
  const rt = ev.target.closest('[data-rmtema]');
  if (rt) { const t = Object.assign({}, taste); t.temas = t.temas.filter((_, i) => i !== +rt.dataset.rmtema); setTaste(t); renderIntereses(); return true; }
  return false;
}
function clicRmtcat(ev) {
  const rc = ev.target.closest('[data-rmtcat]');
  if (rc) { const t = Object.assign({}, taste); t.categorias = t.categorias.filter(c => c.id !== rc.dataset.rmtcat); setTaste(t); renderIntereses(); return true; }
  return false;
}
function clicAiRefresh(ev) {
  if (ev.target.closest('[data-ai-refresh]')) { loadAI(state.when, true); renderParaTi(); return true; }
  return false;
}
function clicFui(ev) {
  const fu = ev.target.closest('[data-fui]');
  if (fu) { fuiAnswer(fu.dataset.id, fu.dataset.fui); return true; }
  return false;
}
