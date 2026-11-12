// Limón · puntuación y tarjetas de los planes

// ---------- puntuación
// ferias profesionales (Construtec, Empack…): se pueden visitar, pero no son lo primero que hay que enseñar
const esProf = e => e.cats.includes('profesionales');
function score(e) {
  if (isDismissed(e)) return { s: -1, hits: [] };
  let s = 0; const hits = [];
  if (taste) {
    for (const c of e.cats) { if ((taste.evitar || []).includes(c)) return { s: -1, hits: [] }; }
    for (const c of taste.categorias || []) if (e.cats.includes(c.id)) { s += [0, 1.5, 2.5, 3.5][c.peso] || 0; hits.push(labelOf(c.id)); }
    if (taste.temas && taste.temas.length) {
      const hay = ' ' + nf([e.titulo, e.descripcion, (e.temas || []).join(' '), e.serie || ''].join(' ')).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
      for (const t of taste.temas) { const k = nf(t).replace(/[^a-z0-9ñ]+/g, ' ').trim(); if (k.length >= 3 && hay.includes(' ' + k + ' ')) { s += 3; hits.push(t); } }
    }
  }
  for (const c of e.cats) { const w = learned['cat:' + c]; if (w) s += w * 0.6; }
  for (const t of e.temas || []) { const w = learned['tema:' + t]; if (w) { s += w; if (w >= 1) hits.push(t + ' (por lo que guardas)'); } }
  if (e.serie && learned['serie:' + e.serie] >= 1) { s += learned['serie:' + e.serie]; hits.push('sigues este ciclo'); }
  const likedGroups = new Set(Object.keys(prefs).filter(k => prefs[k] === 1).map(k => GROUP_OF[k]));
  for (const c of e.cats) {
    if (prefs[c] === 2) return { s: -1, hits: [] };
    if (prefs[c] === 1) { s += 3; hits.push(labelOf(c)); }
    else if (c.startsWith('g:') && likedGroups.has(groupOf(c))) { s += 1.2; hits.push(labelOf(c)); }
    else if (likedGroups.has(groupOf(c))) { s += 0.4; }
  }
  const fr = friendsOf(e).filter(x => x.kind === 'guardado');
  if (fr.length) { s += Math.min(3, 1.2 * fr.length); hits.push(fr.length === 1 ? fr[0].name + ' lo tiene guardado' : fr.length + ' amigos lo tienen guardado'); }
  for (const c of e.cats) { const w = FRIEND_CATS[c]; if (w) s += w; }
  if (Object.keys(AFF).length) {
    const liked = likedCats(); let best = 0, from = null;
    for (const c of e.cats) { if (liked.has(c) || prefs[c] === 2) continue; for (const a of liked) { const l = AFF[a] && AFF[a][c]; if (l > best) { best = l; from = a; } } }
    if (best > 1.3) { s += Math.min(1.5, (best - 1) * 0.6); hits.push('suele gustar a quien le gusta ' + labelOf(from).toLowerCase()); }
  }
  const tf = topicHit(e); if (tf) { s += 2.5; hits.push('sigues ' + tf); }
  if (isFamily(e) && !opts.ninos) return { s: -1, hits: [] };
  if (opts.perro && isPet(e)) { s += 2; hits.push('vas con tu perro'); }
  if (s > 0) {
    if (e.destacado) s += 0.6;
    if (e.fuentes.length > 1) s += 0.4;
    if (e.unico) s += 1;
  }
  return { s, hits: [...new Set(hits)] };
}
// ---------- render de tarjetas
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// enlaces que vienen de fuentes externas: solo http(s); un «javascript:» o similar se queda en «#»
const ext = u => { const t = String(u || '').trim(); return esc(/^https?:\/\//i.test(t) ? t : '#'); };
function dateBox(e, occ) {
  if (occ && occ.ongoing) {
    const f = parse(e.fin);
    return `<div class="date range" aria-label="En curso hasta el ${f.getDate()} de ${MES[f.getMonth()]}"><span class="d">Hasta<br>${f.getDate()} ${MES[f.getMonth()]}</span></div>`;
  }
  const d = occ ? occ.date : parse(e.inicio);
  return `<div class="date"><span class="d">${d.getDate()}</span><span class="m">${MES[d.getMonth()]}</span></div>`;
}
function whenText(e, occ) {
  const d = occ ? occ.date : parse(e.inicio);
  const ini = parse(e.inicio), fin = parse(e.fin);
  let t = DIA[d.getDay()] + ' ' + d.getDate() + ' ' + MES[d.getMonth()];
  if (+ini !== +fin && e.sesiones.length <= 1) t = (occ && occ.ongoing ? 'En curso' : 'Desde ' + t) + ', hasta el ' + fin.getDate() + ' ' + MES[fin.getMonth()];
  else if (e.sesiones.length > 1) t += ' · ' + e.sesiones.length + ' sesiones';
  // horario corto tal cual; si es largo, la primera hora que diga (el horario completo va en la ficha); «--» no se enseña
  const sh = startHour(e), hh = sh == null ? '' : Math.floor(sh) + ':' + String(Math.round((sh % 1) * 60)).padStart(2, '0');
  const h = !e.hora || !/\w/.test(e.hora) || SIN_HORA.test(e.hora) || /consult/i.test(e.hora) ? null : e.hora.length < 40 ? e.hora : hh ? 'desde las ' + hh : null;
  return t + (h ? ' · ' + h : '');
}
// si la fuente no trae descripción, se muestra lo leído de la ficha original (se pide al abrir la ficha)
const DETAILS = {};
function detailsHtml(e) {
  const d = DETAILS[e.id];
  if (d === undefined) {
    DETAILS[e.id] = null;
    window.limonDetails(e.id).then(t => { DETAILS[e.id] = t || ''; const box = document.querySelector(`[data-details="${e.id}"]`); if (box) box.outerHTML = detailsHtml(e); });
  }
  if (!d) return d === '' ? '<p class="note" data-details="' + e.id + '">La fuente no trae descripción. Mira la ficha original en el enlace de abajo.</p>'
    : '<p class="note" data-details="' + e.id + '">Cargando la información de la ficha…</p>';
  return `<div data-details="${e.id}">${d.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('')}<p class="note">Texto de la web del evento.</p></div>`;
}
// imágenes: solo de fuentes oficiales y de datos abiertos; con «ahorro de datos» activado no se cargan
const OFICIAL = /^https:\/\/([a-z0-9-]+\.)*(euskadi\.eus|zaragoza\.es|esmadrid\.com|madrid\.es|donostiakultura\.eus|donostia\.eus|bilbao\.eus|vitoria-gasteiz\.org|gijon\.es|bizkaia\.eus|gipuzkoa\.eus|araba\.eus)\//;
const imgOf = e => (!AHORRO && e.imagen && OFICIAL.test(e.imagen)) ? e.imagen : '';
const EMO = { musica: '🎵', escena: '🎭', arte: '🖼️', patrimonio: '🏛️', cine: '🎬', letras: '📚', ciencia: '🔬', gastro: '🍽️', aprender: '✏️', naturaleza: '🌿', ciudad: '🎉', deporte: '🏃', mascotas: '🐾', ferias: '🛍️', familia: '🧒', comunidad: '🤝' };
// bajo la fecha: la foto oficial en pequeño si la hay (P11; carga diferida y nada con «ahorro de datos»); si no, el icono del tipo de plan
function thumb(e, open) {
  if (!open && imgOf(e)) return `<img class="mini" src="${esc(imgOf(e))}" alt="" loading="lazy" decoding="async" width="52" height="52">`;
  const g = e.cats.map(groupOf).find(x => EMO[x]);
  return g ? `<div class="ico" aria-hidden="true">${EMO[g]}</div>` : '';
}
function card(e, opt) {
  opt = opt || {};
  const occ = opt.occ || occurs(e, today, addDays(today, 400));
  const isSaved = saved.includes(e.id);
  const open = !!state.open[e.id];
  const cats = e.cats.filter(c => c !== 'sin_categoria').slice(0, 3);
  const vh = ventajaHit(e);
  const precioVale = e.precio && e.precio.length < 40 && !/consult|^[\s\-–—.?]*$/i.test(e.precio);  // «Consultar página oficial» o «--» no dicen nada
  const nEst = (NEW.has(e.id) ? 1 : 0) + (e.gratis || precioVale ? 1 : 0) + (e.unico && !esProf(e) ? 1 : 0), cupo = Math.max(1, 4 - nEst);  // como mucho 4 etiquetas en total
  const temas = (e.temas || []).slice(0, Math.min(2, cupo)), cats3 = cats.slice(0, cupo - temas.length);
  const lug = ((e.lugar ? esc(e.lugar) : '') + (userPos && e.lat ? ` · <span class="dist">a ${fmtDist(km(userPos, [e.lat, e.lng]))}</span>` : '') + (ZONE && zkm(e) > 0 && zkm(e) < 999 ? ` · <span class="dist">${e.distrito && !(e.lugar || '').includes(e.distrito) ? esc(e.distrito) + ', ' : ''}a ${fmtDist(zkm(e))} de ${esc(ZONE.name)}</span>` : '')).replace(/^ · /, '');
  const price = (e.gratis ? '<span class="tag free">Gratis</span>' : (precioVale ? `<span class="tag">${esc(e.precio)}</span>` : '')) + (vh ? `<span class="tag free" title="La ficha menciona condiciones para: ${esc(vh)}. Compruébalo en la web.">Posible descuento para ti</span>` : '');
  const why = opt.info ? `<div class="why">${esc(opt.info)}</div>` : opt.reason ? `<div class="why"><b>Por qué:</b> ${esc(opt.reason)}</div>` : opt.why && opt.why.length ? `<div class="why">Te encaja: ${esc(opt.why.slice(0, 3).join(' · '))}</div>` : '';
  const more = open ? `<div class="more" id="m-${e.id}">
        ${imgOf(e) ? `<img class="evimg" src="${esc(imgOf(e))}" alt="" loading="lazy" decoding="async">` : ''}
        ${e.descripcion ? `<p>${esc(e.descripcion)}</p>` : detailsHtml(e)}
        ${e.hora && e.hora.length >= 40 ? `<p class="note">${esc(e.hora)}</p>` : ''}
        ${e.precio && e.precio.length >= 40 ? `<p class="note">${esc(e.precio)}</p>` : ''}
        ${e.direccion || e.distrito ? `<p class="note">📍 ${[e.direccion, e.distrito && !(e.direccion || '').includes(e.distrito) ? e.distrito : ''].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
        <div class="links">${e.fuentes.map(f => f.url ? `<a href="${ext(f.url)}" target="_blank" rel="noopener">Ver en ${esc(f.nombre)} ↗</a>` : '').join('')}
        ${e.web_organizador ? `<a href="${ext(e.web_organizador)}" target="_blank" rel="noopener">Web del organizador ↗</a>` : ''}
        ${e.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=transit" target="_blank" rel="noopener">Cómo llegar ↗</a>` : ''}</div>
        <p class="note">Fuentes: ${e.fuentes.map(f => esc(f.nombre)).join(', ')}</p>
        <div class="acts">${'' /* «Ya fui» y «Proponer plan» ocultos para no saturar la ficha: el «fui» llega por el aviso «¿Al final fuiste?» y las quedadas, con Compartir */}
          <button class="act ico" data-sharev="${e.id}">${SHARE_ICO}Compartir</button>
          <button class="act" data-dismiss="${e.id}" aria-pressed="${isDismissed(e)}">${isDismissed(e) ? 'Volver a mostrar' : 'No me interesa'}</button>
          ${went.includes(e.id) ? `<button class="act" data-went="${e.id}" aria-pressed="true">✓ Fui</button>` : ''}
          ${e.lat ? `<button class="act" data-route="${e.id}">¿Cortes en el camino?</button>` : ''}
          ${parse(e.fin) >= today ? `<button class="act" data-ics="${e.id}">📅 Añadir a mi calendario</button>` : ''}
          <button class="act" data-addlist="${e.id}">Añadir a lista</button>
          ${e.lugar ? topicBtn('sala', e.lugar, 'la sala') : ''}${e.serie ? topicBtn('ciclo', e.serie, 'el ciclo') : ''}
        </div>
        ${went.includes(e.id) ? diaryForm(e) : ''}
        ${state.listing === e.id ? listPicker(e) : ''}
        ${state.inviting === e.id ? inviteForm(e) : ''}
        ${state.route && state.route[e.id] ? `<div class="routewarn">${state.route[e.id]}</div>` : ''}
      </div>` : '';
  return `<article class="card${NEW.has(e.id) ? ' nuevo' : ''}${open ? ' abierta' : ''}" data-eid="${e.id}">
      <div class="row1"><div class="lcol">${dateBox(e, occ)}${thumb(e, open)}</div>
        <div class="body">
          <h3 class="title"><a href="?c=${encodeURIComponent(C_ZONA)}&ev=${e.id}" data-open="${e.id}" aria-expanded="${open}" aria-controls="m-${e.id}">${esc(e.titulo)}</a></h3>
          <div class="meta">${esc(whenText(e, occ))}</div>
          ${lug ? `<div class="meta">${lug}</div>` : ''}
          ${streetWarn(e, occ)}${rainWarn(e, occ)}${crewHtml(e)}${friendsHtml(e)}
          ${e.serie ? `<button class="serie link" data-f-serie="${esc(e.serie)}" aria-label="Ver todo el ciclo: ${esc(e.serie)}">${esc(e.serie)} ›</button>` : ''}
        </div></div>
      <div class="tags">${NEW.has(e.id) ? '<span class="tag nuevo">Nuevo</span>' : ''}${price}${e.unico && !esProf(e) ? '<span class="tag uni">Único</span>' : ''}${temas.map(t => `<button class="tag tema link" data-f-tema="${esc(t)}" aria-label="Más planes sobre ${esc(t)}">${esc(t)}</button>`).join('')}${cats3.map(c => `<button class="tag link" data-f-cat="${esc(c)}" aria-label="Más planes de ${esc(labelOf(c))}">${esc(labelOf(c))}</button>`).join('')}</div>
      ${why}${more}
      ${open ? '' : `<button class="shr" data-sharev="${e.id}" aria-label="Compartir este plan">${SHARE_ICO}</button>`}
      <button class="save" data-save="${e.id}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Quitar de mi agenda' : 'Guardar en mi agenda'}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
      </button>
    </article>`;
}

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicSave(ev) {
  const s = ev.target.closest('[data-save]');
  if (s) {
    const id = s.dataset.save, on = !saved.includes(id);
    ponSaved(on ? saved.concat(id) : saved.filter(x => x !== id)); store.set('saved', saved);
    if (on && window.limonContar) window.limonContar('guardar');
    if (BYID[id]) learn(BYID[id], on ? 'save' : 'unsave');
    // al repintar, la lista puede reordenarse (aprende de lo guardado): la tarjeta tocada se queda donde estaba en pantalla
    const art = s.closest('article'), y0 = art ? art.getBoundingClientRect().top : null, vista = art && art.closest('section, .view, [id^="v-"]');
    renderAll();
    if (y0 != null && vista) {
      const otra = [...vista.querySelectorAll('[data-save]')].find(b => b.dataset.save === id);
      const a2 = otra && otra.closest('article');
      if (a2) window.scrollBy(0, a2.getBoundingClientRect().top - y0);
    }
    const deshacer = () => { ponSaved(on ? saved.filter(x => x !== id) : saved.concat(id)); store.set('saved', saved); if (BYID[id]) learn(BYID[id], on ? 'unsave' : 'save'); renderAll(); };
    if (on && !logged && (saved.length === 1 || saved.length === 3)) toast('Guardado. Con una cuenta gratis te avisamos antes de que empiece.', () => go('intereses'), 'Crear cuenta');
    else toast(on ? 'Guardado en tu agenda.' : 'Quitado de tu agenda.', deshacer);
    return true;
  }
  return false;
}
function clicDismiss(ev) {
  const dm = ev.target.closest('[data-dismiss]');
  if (dm) {
    const id = dm.dataset.dismiss, on = !dismissed.includes(id);
    ponDismissed(on ? dismissed.concat(id) : dismissed.filter(x => x !== id)); store.set('dismissed', dismissed);
    if (BYID[id]) learn(BYID[id], on ? 'dismiss' : 'undismiss');
    if (on) toast('No volverá a salir en tus recomendaciones.', () => { ponDismissed(dismissed.filter(x => x !== id)); store.set('dismissed', dismissed); learn(BYID[id], 'undismiss'); renderAll(); });
    renderAll(); return true;
  }
  return false;
}
function clicWent(ev) {
  const wn = ev.target.closest('[data-went]');
  if (wn) {
    const id = wn.dataset.went, on = !went.includes(id);
    ponWent(on ? went.concat(id) : went.filter(x => x !== id)); store.set('went', went);
    if (BYID[id]) learn(BYID[id], on ? 'went' : 'unwent');
    if (on) toast('Anotado. Te recomendaremos más planes así.');
    renderAll(); return true;
  }
  return false;
}
function clicTarjeta(ev) {
  let o = ev.target.closest('[data-open]');
  if (!o) {
    const c = ev.target.closest('.card');
    if (c && !ev.target.closest('a, button, .more')) o = c.querySelector('[data-open]');
  }
  if (o) { const id = o.dataset.open; state.open[id] = !state.open[id]; fichaHistoria(id, state.open[id]); if (state.open[id]) { store.set('abiertos', store.get('abiertos', 0) + 1); const all = [...document.querySelectorAll('#v-' + state.tab + ' [data-open]')].map(x => x.dataset.open); track('abrir', id, { pos: all.indexOf(id) + 1 || null }); window.limonContar && window.limonContar('ficha'); } renderAll(); const el = document.querySelector(`[data-open="${id}"]`); if (el) el.focus(); return true; }
  return false;
}
