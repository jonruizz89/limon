// Limón · Explorar, Agenda, Perfil (intereses, fuentes, ideas), navegación y plegables

// ---------- ideas: la gente propone mejoras, avisa de fallos o de sitios que faltan, y vota
let IDEAS = null, IDEAS_TAB = 'top', IDEAS_SIM = [];
const IKIND = { idea: 'Idea', fallo: 'Algo no funciona', fuente: 'Falta un sitio o evento' };
const ISTATUS = { pendiente: 'Pendiente de revisión', nueva: 'Nueva', estudiando: 'Lo estamos mirando', planificada: 'Planificada', hecha: '¡Hecha!', descartada: 'Descartada', oculta: 'Oculta' };
async function loadIdeas() {
  const sb = sbx(); if (!sb) return;
  const { data } = await sb.rpc('ideas_board');
  IDEAS = data || []; renderIdeas();
}
const ideaWords = t => nf(t).replace(/[^a-z0-9ñ]+/g, ' ').split(' ').filter(w => w.length >= 4);
function similarIdeas(title) {
  const w = new Set(ideaWords(title)); if (w.size < 2 || !IDEAS) return [];
  return IDEAS.filter(i => ['nueva', 'estudiando', 'planificada'].includes(i.status))
    .map(i => ({ i, n: ideaWords(i.title + ' ' + (i.body || '')).filter(x => w.has(x)).length })).filter(x => x.n >= 2)
    .sort((a, b) => b.n - a.n).slice(0, 3).map(x => x.i);
}
function ideaRow(i) {
  const isAdm = me && me.role === 'admin';
  return `<div class="idea">
      <button class="vote" data-vote="${i.id}" aria-pressed="${i.voted}" aria-label="${i.voted ? 'Quitar mi voto' : 'Votar'}: ${esc(i.title)}"><span aria-hidden="true">▲</span><b>${i.votes}</b></button>
      <div style="min-width:0;flex:1">
        <div class="tags" style="margin:0"><span class="tag">${esc(IKIND[i.kind])}</span><span class="badge ${i.status}">${esc(ISTATUS[i.status])}</span></div>
        <b style="display:block;margin-top:4px">${esc(i.title)}</b>
        ${i.body ? `<p class="note" style="margin:2px 0 0;white-space:pre-line">${esc(i.body.length > 280 ? i.body.slice(0, 280) + '…' : i.body)}</p>` : ''}
        ${i.admin_note ? `<p style="margin:6px 0 0;font-size:13px"><b>Respuesta de Limón:</b> ${esc(i.admin_note)}</p>` : ''}
        <p class="note" style="margin:4px 0 0">${i.by ? `<button class="btnlink" data-prof="${esc(i.by.username)}">${esc(i.by.name)}</button> · ` : ''}${new Date(i.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}${i.mine && i.status === 'nueva' ? ` · <button class="btnlink" data-idea-del="${i.id}">Borrar</button>` : ''}</p>
        ${isAdm ? `<form class="seg" data-idea-adm="${i.id}" style="margin-top:6px"><select class="search" name="s" style="max-width:190px">${Object.keys(ISTATUS).map(k => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${ISTATUS[k]}</option>`).join('')}</select><input class="search" name="n" maxlength="500" value="${esc(i.admin_note || '')}" placeholder="Respuesta (opcional)" style="flex:1;min-width:140px"><button class="act" type="submit">Guardar</button></form>` : ''}
      </div></div>`;
}
function renderIdeas() {
  const box = $('ideas'); if (!box) return;
  if (!IDEAS) { box.innerHTML = '<h2 style="margin:0">Ideas para Limón</h2><p class="note">Cargando…</p>'; return; }
  const tabs = [['top', 'Más votadas'], ['nuevas', 'Nuevas'], ['marcha', 'En marcha'], ['hechas', 'Hechas']];
  const open = i => !['hecha', 'descartada', 'oculta', 'pendiente'].includes(i.status);
  let list = IDEAS.slice();
  if (IDEAS_TAB === 'top') list = list.filter(open).sort((a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at));
  else if (IDEAS_TAB === 'nuevas') list = list.filter(i => i.status === 'nueva' || (i.status === 'pendiente' && i.mine));
  else if (IDEAS_TAB === 'marcha') list = list.filter(i => ['estudiando', 'planificada'].includes(i.status));
  else list = list.filter(i => i.status === 'hecha');
  if (me && me.role === 'admin' && IDEAS_TAB === 'nuevas') list = list.concat(IDEAS.filter(i => i.status === 'oculta'));
  box.innerHTML = `<h2 style="margin:0">Ideas para Limón</h2>
      <p class="note" style="margin:0">Propón mejoras, avisa si algo falla o si falta un sitio o un evento, y vota las ideas de los demás. Lo más votado es lo primero que miramos.</p>
      ${logged ? `<form class="form" id="idea-form">
        <label>Tipo<select class="search" name="kind">${Object.keys(IKIND).map(k => `<option value="${k}">${IKIND[k]}</option>`).join('')}</select></label>
        <label>En una frase<input class="search" name="title" id="idea-title" required minlength="5" maxlength="120" placeholder="Ej.: avisarme cuando salgan entradas de un artista" autocomplete="off"></label>
        <label class="full">Detalles (opcional)<textarea class="search" name="body" rows="3" maxlength="1500" placeholder="Cuéntanos qué te gustaría y por qué, o qué ha fallado y dónde"></textarea></label>
        <div class="full" id="idea-sim">${IDEAS_SIM.length ? `<p class="note" style="margin:0">¿Es alguna de estas? Mejor vótala para que sume:</p>` + IDEAS_SIM.map(ideaRow).join('') : ''}</div>
        <div class="seg full"><button class="btn" type="submit">Enviar</button><span class="note" id="idea-msg" role="status"></span></div></form>`
      : '<p class="note">Entra con tu cuenta (arriba, en «Entra o crea tu cuenta») para proponer ideas y votar.</p>'}
      <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button class="pill" data-idea-tab="${k}" aria-pressed="${IDEAS_TAB === k}">${l}</button>`).join('')}</div>
      <div>${list.slice(0, 40).map(ideaRow).join('') || '<p class="note">Aún no hay nada aquí. ¡Estrena el tablón!</p>'}</div>`;
}
async function ideasClick(t) {
  const sb = sbx(); if (!sb) return false;
  const v = t.closest('[data-vote]'), tb = t.closest('[data-idea-tab]'), dl = t.closest('[data-idea-del]');
  if (tb) { IDEAS_TAB = tb.dataset.ideaTab; renderIdeas(); return true; }
  if (v) {
    if (!logged) { toast('Entra con tu cuenta para votar.'); return true; }
    const i = IDEAS.find(x => x.id === +v.dataset.vote);
    const { error } = i.voted ? await sb.from('idea_votes').delete().eq('idea_id', i.id).eq('user_id', uid()) : await sb.from('idea_votes').insert({ idea_id: i.id, user_id: uid() });
    if (error) { toast('No se ha podido: ' + error.message); return true; }
    i.voted = !i.voted; i.votes += i.voted ? 1 : -1; renderIdeas(); return true;
  }
  if (dl) { if (confirm('¿Borrar tu idea?')) { await sb.from('ideas').delete().eq('id', +dl.dataset.ideaDel); await loadIdeas(); } return true; }
  return false;
}
function renderExplorar() {
  pintaCuando();
  const q = $('ex-q').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const g = $('ex-grp').value, [a, b] = range($('ex-when').value);
  const res = [];
  for (const e of EV) {
    if (isDismissed(e) && !q) continue;
    if (g && !e.cats.some(c => groupOf(c) === g)) continue;
    const f = state.filter;
    if (f && f.kind === 'cat' && !e.cats.includes(f.value)) continue;
    if (f && f.kind === 'tema' && !(e.temas || []).includes(f.value)) continue;
    if (f && f.kind === 'serie' && e.serie !== f.value) continue;
    if (f && f.kind === 'id' && e.id !== f.value) continue;
    const occ = f && f.kind === 'id' ? (occurs(e, a, b) || { date: parse(e.inicio), ongoing: false }) : occurs(e, a, b);
    if (!occ || (!(f && f.kind === 'id') && !passF(e, occ))) continue;
    if (q) { const h = (e.titulo + ' ' + (e.lugar || '') + ' ' + (e.distrito || '') + ' ' + (e.serie || '') + ' ' + (e.temas || []).join(' ') + ' ' + e.cats.map(labelOf).join(' ') + ' ' + (e.descripcion || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (!h.includes(q) && !q.split(/\s+/).every(w => h.includes(w) || (/^gratu?i?s|^gratuit/.test(w) && e.gratis))) continue; }
    res.push({ e, occ });
  }
  res.sort((x, y) => (largo(x.e, x.occ) - largo(y.e, y.occ)) || zoneSort(x.e, y.e, (x.occ.date - y.occ.date) || (esProf(x.e) - esProf(y.e)) || (horaOrden(x.e) - horaOrden(y.e))));
  // el mismo plan en el mismo sitio y día (una sala que publica cada sesión por separado): una sola tarjeta
  const visto = new Set();
  for (let i = 0; i < res.length; i++) { const x = res[i]; if (x.occ.ongoing) continue; const k = nf(x.e.titulo) + '|' + nf(x.e.lugar || '') + '|' + x.occ.date.toDateString(); if (visto.has(k)) res.splice(i--, 1); else visto.add(k); }
  const f = state.filter;
  $('ex-active').innerHTML = f ? `<button class="filterchip" id="ex-clear" aria-label="Quitar filtro">${esc(f.kind === 'cat' ? labelOf(f.value) : f.kind === 'id' ? f.label : f.value)} <span aria-hidden="true">✕</span></button>` : '';
  $('ex-count').textContent = res.length + (res.length === 1 ? ' evento' : ' eventos');
  $('ex-list').innerHTML = (res.length ? zoneNote() : '') + (conSeccion(res.slice(0, state.exShown), x => card(x.e, { occ: x.occ })) || (q ? `<div class="empty">Ningún plan coincide con «${esc($('ex-q').value.trim())}» en estas fechas.</div>` : '<div class="empty">Ningún evento con esos filtros.</div>'));
  $('ex-more').hidden = res.length <= state.exShown;
}
function renderAgenda() {
  const list = EV.filter(e => saved.includes(e.id)).sort((a, b) => a.inicio.localeCompare(b.inicio) || horaOrden(a) - horaOrden(b));
  $('ag-list').innerHTML = list.map(e => card(e)).join('') || '<div class="empty">Aún no has guardado nada. Toca el marcador de cualquier evento para traerlo aquí.</div>';
  $('n-agenda').textContent = saved.length || '';
  renderDiary(); renderLists();
}
const counts = {};
// ---------- intereses en un toque, sin cuenta: grandes temas; el detalle, en Perfil
function interesesRapido() {
  const grupos = TAX.filter(g => EMO[g.id] && g.items.length);
  const on = g => g.items.every(it => prefs[it.id] === 1);
  openSheet(`<div class="seg" style="justify-content:space-between;align-items:center"><h2 style="margin:0">¿Qué te gusta?</h2><button class="btn ghost" data-sheet-close>Cerrar</button></div>
      <p class="note" style="margin:4px 0 10px">Toca todo lo que te interese. Se guarda en este móvil; no hace falta cuenta.</p>
      <div class="qgrid">${grupos.map(g => `<button class="qchip" data-qgrp="${g.id}" aria-pressed="${on(g)}"><span aria-hidden="true">${EMO[g.id]}</span> ${esc(g.name)}</button>`).join('')}</div>
      <div class="seg qfoot"><button class="btnlink" data-qmas>Afinar más (subcategorías)</button><button class="btn" data-qver>Ver mis planes</button></div>`);
}
function renderIntereses() {
  const q = $('in-q').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  $('in-groups').innerHTML = TAX.map(g => {
    const items = g.items.filter(it => !q || n(it.label).includes(q) || n(g.name).includes(q));
    if (!items.length) return '';
    const on = g.items.filter(it => prefs[it.id] === 1).length, off = g.items.filter(it => prefs[it.id] === 2).length;
    const open = q || state.groupsOpen[g.id];
    const ct = [g.items.length + ' categorías', on ? on + ' te interesan' : '', off ? off + ' ocultas' : ''].filter(Boolean).join(' · ');
    return `<div class="grp"><button data-grp="${g.id}" aria-expanded="${!!open}"><span class="nm">${esc(g.name)}</span><span class="ct ${on ? 'on' : ''}">${ct}</span><span aria-hidden="true">${open ? '▴' : '▾'}</span></button>
        ${open ? `<div class="chips">${items.map(it => `<button class="chip" data-cat="${it.id}" data-v="${prefs[it.id] || 0}" aria-label="${esc(it.label)}: ${['sin marcar', 'me interesa', 'no me muestres'][prefs[it.id] || 0]}">${esc(it.label)}<span class="k">${counts[it.id] || 0}</span></button>`).join('')}</div>` : ''}</div>`;
  }).join('');
  $('o-ninos').checked = !!opts.ninos; $('o-perro').checked = !!opts.perro; $('o-dist').checked = !!opts.dist;
  renderTaste();
}
function renderFuentes() {
  const m = META;
  const per = {};
  EV.forEach(e => e.fuentes.forEach(f => { per[f.nombre] = (per[f.nombre] || 0) + 1; }));
  $('fu-lead').textContent = `${m.eventos.toLocaleString('es-ES')} eventos vigentes de ${m.fuentes.length} fuentes. Última actualización: ${m.generado}.`;
  const nm = { 'RJB': 'Real Jardín Botánico' };
  $('fu-table').innerHTML = '<thead><tr><th>Fuente</th><th class="n">Eventos</th><th>Cómo se lee</th><th>Licencia o uso</th></tr></thead><tbody>' +
    m.fuentes.map(f => `<tr><td>${f.url ? `<a href="${ext(f.url)}" target="_blank" rel="noopener">${esc(nm[f.name] || f.name)}</a>` : esc(nm[f.name] || f.name)}</td><td class="n">${(per[f.name] || 0).toLocaleString('es-ES')}</td><td>${esc(f.method || '')}</td><td>${esc(f.license || '')}</td></tr>`).join('') + '</tbody>';
  $('fu-notes').innerHTML = `<h2 style="margin:0">Cómo se ha montado</h2>
      <p class="note">Las sesiones de un mismo evento se agrupan en una sola tarjeta. Si el mismo evento aparece en varias fuentes se une en uno y se conservan todos los enlaces: ahora hay ${m.multifuente} eventos con más de una fuente.</p>
      <p class="note">Las categorías, temas y ciclos se asignan automáticamente a partir del título y la descripción. ${m.sin_categoria} eventos (${Math.round(100 * m.sin_categoria / Math.max(1, m.eventos))} %) se quedan sin categoría.</p>
      <p class="note">${CITY.id === 'madrid' ? 'Contiene información de la agenda del Ayuntamiento de Madrid (datos.madrid.es, licencia CC BY 4.0), de esMadrid.com, de la Agenda Cultural del Ministerio de Cultura y de las webs de cada recinto.' : 'Contiene información de las fuentes de la tabla, encontradas y leídas automáticamente.'} Cada tarjeta enlaza a su fuente original.</p>`;
  if (DATA.audit === undefined && window.limonAudit) { DATA.audit = null; window.limonAudit().then(a => { DATA.audit = a; if (state.tab === 'fuentes') renderFuentes(); }); }
  const au = DATA.audit;
  if (au && au.runs.length) {
    const when = new Date(au.runs[0].run_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    const tf = au.runs.reduce((a, r) => a + r.found, 0), tm = au.runs.reduce((a, r) => a + r.missing, 0);
    $('fu-audit').hidden = false;
    $('fu-audit').innerHTML = `<h2 style="margin:0">Auditoría de cobertura</h2>
        <p class="note">Cada lunes buscamos en la web planes de las dos semanas siguientes por grupo de categorías y comprueba si los tenemos. Última revisión: ${esc(when)}. De ${tf} planes encontrados faltaban ${tm} (${Math.round(100 * tm / Math.max(1, tf))} %).</p>
        <div class="tablewrap"><table class="cov"><thead><tr><th>Grupo</th><th class="n">Encontrados</th><th class="n">Faltaban</th><th class="n">%</th></tr></thead><tbody>
        ${au.runs.slice().sort((a, b) => b.pct_missing - a.pct_missing).map(r => `<tr><td>${esc(GROUP_NAME[r.group_id] || r.group_id)}</td><td class="n">${r.found}</td><td class="n">${r.missing}</td><td class="n" style="${+r.pct_missing > 10 ? 'color:var(--accent-text);font-weight:700' : ''}">${(+r.pct_missing).toLocaleString('es-ES')}</td></tr>`).join('')}</tbody></table></div>
        ${au.cands.length ? `<h3 style="margin:8px 0 0;font:600 14px var(--f-body)">Fuentes candidatas</h3><p class="note">Webs donde se publicaban planes que no teníamos. Las que se repiten semana a semana son las primeras que conviene añadir.</p>
        <div class="tablewrap"><table class="cov"><thead><tr><th>Web</th><th class="n">Veces</th><th>Ejemplo</th></tr></thead><tbody>${au.cands.map(c => `<tr><td>${esc(c.domain)}</td><td class="n">${c.hits}</td><td>${c.example_url ? `<a href="${ext(c.example_url)}" target="_blank" rel="noopener">${esc((c.example_title || c.example_url).slice(0, 70))}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }
}
// Perfil: sin sesión, «Entra o crea tu cuenta» va arriba y abierto; con sesión, «Tu cuenta» (cerrar sesión, datos…) al final
function placeAccount() {
  const acc = $('account'), first = $('taste'), last = $('mail'); if (!acc || !first || !last) return;
  const h = acc.querySelector('h2');
  if (!logged) {
    if (acc.nextElementSibling !== first) first.before(acc);
    acc.classList.add('open', 'top'); if (h) { h.textContent = 'Entra o crea tu cuenta'; h.setAttribute('aria-expanded', 'true'); }
  } else {
    if (acc.previousElementSibling !== last) last.after(acc);
    if (acc.classList.contains('top')) { acc.classList.remove('top', 'open'); if (h) h.setAttribute('aria-expanded', 'false'); }
    if (h) h.textContent = 'Tu cuenta';
  }
}
function renderAll() {
  placeAccount();
  pintaCuando();
  pintaTema();
  $('stamp').innerHTML = `<button class="citybtn" id="city-btn" aria-haspopup="dialog" aria-label="Cambiar de ciudad (ahora ${esc(CITY.name)})">${esc(CITY.name)} <span aria-hidden="true">▾</span></button> · ${(ZONE ? EV.filter(inZone).length : META.eventos).toLocaleString('es-ES')} eventos`;
  document.querySelectorAll('.n-unicos').forEach(n => { n.textContent = EV.filter(e => e.unico && !esProf(e) && parse(e.fin) >= today && inZone(e)).length || ''; });
  $('n-unicos').textContent = EV.filter(e => e.unico && !esProf(e) && parse(e.fin) >= today && inZone(e)).length || '';
  renderFilters();
  renderAgenda();
  $('n-calle').textContent = streets.length ? (cutsOn(today).filter(x => x.mine).length || '') : '';
  $('b-calle').hidden = !(streets.length && cutsOn(today).some(x => x.mine));
  $('b-agenda').hidden = !saved.length;
  ({ parati: renderParaTi, calle: renderCalle, unicos: renderUnicos, explorar: renderExplorar, agenda: () => { }, intereses: renderIntereses, fuentes: renderFuentes })[state.tab]();
  watchSeen();
}
function go(t) {
  if (state.tab !== t) { track('pestana', null, { a: t }); if (!toastUndo || $('toast-undo').textContent !== 'Deshacer') $('toast').hidden = true; }
  state.tab = t;
  const nav = (t === 'unicos') ? 'parati' : (t === 'fuentes') ? 'intereses' : t;
  tabs.forEach(x => { $('v-' + x).hidden = x !== t; $('t-' + x).setAttribute('aria-selected', x === nav); });
  document.querySelectorAll('[data-bnav]').forEach(b => { if (b.dataset.bnav === nav) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  try { sessionStorage.setItem('bureo.tab', t); } catch (e) { }  // solo mientras la app sigue abierta
  renderAll(); window.scrollTo(0, 0);
}
let qTimer = null;
// al abrir la app (tras cerrarla) se empieza en Para ti; al recargar sin cerrarla (cambio de zona, versión nueva) se sigue donde estabas
let tabSes = null;
// apartados del Perfil plegados por defecto; se recuerda cuáles abre cada persona en este navegador
// apartados abiertos del Perfil: solo mientras la app sigue abierta (al volver a entrar, todos cerrados)
let FOLDS = {};
function setupFolds() {
  document.querySelectorAll('#v-intereses .panel').forEach(p => {
    if (!p.id) return;
    p.classList.add('fold'); p.classList.toggle('open', !!FOLDS[p.id]);
    const h = p.querySelector('h2'); if (h) { h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', !!FOLDS[p.id]); }
  });
}
function openFold(id, on) {
  const p = $(id); if (!p) return;
  FOLDS[id] = on === undefined ? !FOLDS[id] : on; try { sessionStorage.setItem('bureo.folds', JSON.stringify(FOLDS)); } catch (e) { }
  p.classList.toggle('open', !!FOLDS[id]); const h = p.querySelector('h2'); if (h) h.setAttribute('aria-expanded', !!FOLDS[id]);
}
const foldHead = t => { const p = t.closest('#v-intereses .panel.fold'); if (!p) return null; const head = p.firstElementChild; return head && head.contains(t) && !t.closest('button:not([role]), a, input, select, textarea, label') ? p : null; };

// ---------- arranque: recuento por categoría, pestañas, nombre de la ciudad y pie
let tabs;  // se fija al arrancar (iniciaPagina)
function iniciaPagina() {
  EV.forEach(e => { if (parse(e.fin) >= today) e.cats.forEach(c => { counts[c] = (counts[c] || 0) + 1; }); });
  // ---------- eventos de interfaz
  tabs = ['parati', 'calle', 'unicos', 'explorar', 'agenda', 'intereses', 'fuentes'].filter(t => t !== 'calle' || HAS_CALLE);
  // nombre de la ciudad en textos fijos; sin datos de cortes, la pestaña Calle no aparece
  document.querySelectorAll('.cityname').forEach(x => { x.textContent = CITY.name; });
  document.title = (window.LIMON_STAGING ? '[Pruebas] ' : '') + 'Planes en ' + CITY.name + ' hoy y este finde · Limón';
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
}

// ---------- arranque: controles de Para ti, Explorar e Intereses
function iniciaControles() {
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
}

// ---------- arranque: buscador de arriba y opciones de Perfil
function iniciaBuscadorYOpciones() {
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
  $('o-dist').addEventListener('change', e => { opts.dist = e.target.checked; store.set('opts', opts); if (opts.dist) askPos(false); else { ponUserPos(null); renderAll(); } });
  $('in-reset').addEventListener('click', () => { ponPrefs(Object.assign({}, SAMPLE)); store.set('prefs', prefs); renderIntereses(); });
  $('in-clear').addEventListener('click', () => { ponPrefs({}); store.set('prefs', prefs); renderIntereses(); });
}

// ---------- arranque: la pestaña o el plan con el que se abre la app
let QS, t0, ev0;  // se fijan al arrancar (iniciaPrimeraVista)
function iniciaPrimeraVista() {
  // enlaces desde los correos: ?ev=e123 abre ese evento, ?tab=calle abre una pestaña, ?baja=…&k=… da de baja un aviso
  QS = new URLSearchParams(location.search);
  try { tabSes = sessionStorage.getItem('bureo.tab'); } catch (e) { }
  t0 = QS.get('tab') || tabSes || 'parati';
  ev0 = QS.get('ev') && (BYID[QS.get('ev')] || BYID['e' + QS.get('ev')]);
  if (ev0) { state.filter = { kind: 'id', value: ev0.id, label: ev0.titulo }; state.open[ev0.id] = true; $('ex-when').value = 'todo'; go('explorar'); }
  else go(tabs.includes(t0) ? t0 : 'parati');
}

// ---------- arranque: secciones plegables de Perfil
function iniciaPlegables() {
  try { FOLDS = JSON.parse(sessionStorage.getItem('bureo.folds') || '{}'); localStorage.removeItem('bureo.folds'); } catch (e) { }
  document.addEventListener('click', ev => { const p = foldHead(ev.target); if (p) { ev.stopPropagation(); openFold(p.id); } }, true);
  document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('#v-intereses .panel.fold h2')) { ev.preventDefault(); openFold(ev.target.closest('.panel').id); } });
  // los apartados se repintan a menudo: se vuelve a marcar el título como botón
  new MutationObserver(() => setupFolds()).observe($('v-intereses'), { childList: true, subtree: false });
  ['social', 'seguir', 'ventajas', 'year', 'ideas', 'org', 'adm', 'stats', 'mail'].forEach(id => { const el = $(id); if (el) new MutationObserver(() => { const h = el.querySelector('h2'); if (h && !h.hasAttribute('role')) { h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', !!FOLDS[id]); } }).observe(el, { childList: true }); });
  setupFolds();
}

// ---------- arranque: ideas parecidas y enlaces ?fui, ?ideas, ?u y ?lista
function iniciaEnlacesDirectos() {
    // partido para que la sustitución al publicar no lo toque
  document.addEventListener('input', ev => { if (ev.target.id === 'idea-title') { IDEAS_SIM = similarIdeas(ev.target.value); const b = $('idea-sim'); if (b) b.innerHTML = IDEAS_SIM.length ? '<p class="note" style="margin:0">¿Es alguna de estas? Mejor vótala para que sume:</p>' + IDEAS_SIM.map(ideaRow).join('') : ''; } });
  if (QS.get('fui')) go('parati');
  const rs = QS.get('resumen');
  if (rs) { if (rs === 'confirmado') store.set('resumenOk', 1); setTimeout(() => toast({ confirmado: '¡Listo! Cada jueves te mandaremos lo mejor del finde.', baja: 'Te hemos dado de baja del resumen. No te escribiremos más.', caducado: 'Ese enlace ya no vale. Pídelo otra vez desde Para ti.' }[rs] || ''), 600); try { history.replaceState(history.state, '', location.pathname + location.search.replace(/[?&]resumen=[a-z]+/, '').replace(/^&/, '?')); } catch (x) { } }
  if (QS.get('ideas') !== null) { go('intereses'); openFold('ideas', true); setTimeout(() => { const b = $('ideas'); if (b) b.scrollIntoView({ behavior: 'smooth' }); }, 400); }
  if (QS.get('u') && /^[a-z0-9_.]{3,20}$/i.test(QS.get('u'))) { const un = QS.get('u'); go('intereses'); setTimeout(() => openProfile(un), 300); }
  if (QS.get('lista') && /^\d+$/.test(QS.get('lista'))) { const li = QS.get('lista'); setTimeout(() => openList(li), 300); }
  if (QS.has('ev') || QS.has('baja') || QS.has('tab') || QS.has('quedar') || QS.has('u') || QS.has('lista') || QS.has('ideas') || QS.has('fui')) history.replaceState(null, '', location.pathname);
}

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicEnlaceDeLaApp(ev) {
  // enlaces de la app (pestañas, planes): clic normal se queda en la app; Ctrl/Cmd/Mayús o botón central, pestaña nueva
  const lk = ev.target.closest('a[data-goto], a[data-open]');
  if (lk) { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return true; ev.preventDefault(); }
  return false;
}
function clicFiltroDeTarjeta(ev) {
  const ff = ev.target.closest('[data-f-cat], [data-f-tema], [data-f-serie]');
  if (ff) {
    const kind = ff.dataset.fCat ? 'cat' : ff.dataset.fTema ? 'tema' : 'serie';
    state.filter = { kind, value: ff.dataset.fCat || ff.dataset.fTema || ff.dataset.fSerie };
    $('q-global').value = ''; $('ex-q').value = ''; $('ex-grp').value = ''; $('ex-when').value = 'todo';
    state.exShown = 20; go('explorar'); return true;
  }
  return false;
}
function clicExClear(ev) {
  if (ev.target.closest('#ex-clear')) { state.filter = null; state.exShown = 20; renderExplorar(); return true; }
  return false;
}
function clicGoto(ev) {
  const gt = ev.target.closest('[data-goto]');
  if (gt) { if (gt.dataset.fold) openFold(gt.dataset.fold, true); go(gt.dataset.goto); return true; }
  return false;
}
function clicInteresesRapido(ev) {
  if (ev.target.closest('[data-intereses-rapido]')) { interesesRapido(); return true; }
  return false;
}
function clicQgrp(ev) {
  const qg = ev.target.closest('[data-qgrp]');
  if (qg) {
    const g = TAX.find(x => x.id === qg.dataset.qgrp); if (!g) return true;
    const all = g.items.every(it => prefs[it.id] === 1);
    g.items.forEach(it => { if (all) delete prefs[it.id]; else prefs[it.id] = 1; });
    store.set('prefs', prefs); qg.setAttribute('aria-pressed', String(!all)); return true;
  }
  return false;
}
function clicQver(ev) {
  if (ev.target.closest('[data-qver]')) { window.limonContar && window.limonContar('intereses'); closeSheets(); state.ptShown = 20; go('parati'); window.scrollTo(0, 0); renderAll(); return true; }
  return false;
}
function clicQmas(ev) {
  if (ev.target.closest('[data-qmas]')) { closeSheets(); go('intereses'); if (!logged) openFold('account', false); openFold('in-panel', true); setTimeout(() => { const p = $('in-panel'); if (p) p.scrollIntoView({ block: 'start' }); }, 50); return true; }
  return false;
}
function clicIdeas(ev) {
  if (ev.target.closest('[data-vote],[data-idea-tab],[data-idea-del]')) { ideasClick(ev.target); return true; }
  return false;
}
function clicGoev(ev) {
  const gv = ev.target.closest('[data-goev]');
  if (gv && BYID[gv.dataset.goev]) { closeSheets(); const x = BYID[gv.dataset.goev]; state.filter = { kind: 'id', value: x.id, label: x.titulo }; state.open[x.id] = true; $('ex-when').value = 'todo'; go('explorar'); return true; }
  return false;
}
function clicGotoEv(ev) {
  const ge = ev.target.closest('[data-goto-ev]');
  if (ge) { const id = ge.dataset.gotoEv; state.open[id] = true; $('ex-q').value = $('q-global').value = BYID[id].titulo; $('ex-when').value = 'todo'; go('explorar'); return true; }
  return false;
}
function clicGrp(ev) {
  const g = ev.target.closest('[data-grp]');
  if (g) { state.groupsOpen[g.dataset.grp] = !state.groupsOpen[g.dataset.grp]; renderIntereses(); return true; }
  return false;
}
function clicCat(ev) {
  const c = ev.target.closest('[data-cat]');
  if (c) { const id = c.dataset.cat; prefs[id] = ((prefs[id] || 0) + 1) % 3; if (!prefs[id]) delete prefs[id]; store.set('prefs', prefs); renderIntereses(); const el = document.querySelector(`[data-cat="${id}"]`); if (el) el.focus(); }
  return false;
}

// ---------- cambios y envíos de formularios de este tema. Devuelven false si no era suyo; el orden está en js/inicio.js
function envioIdea(ev) {
  const db = window.limonDB, u = db && db.user();
  if (ev.target.id === 'idea-form') return (async () => {
    ev.preventDefault(); const f = new FormData(ev.target);
    $('idea-msg').textContent = 'Enviando…';
    const { error } = await db.sb.from('ideas').insert({ author: u.id, kind: f.get('kind'), title: String(f.get('title')).trim(), body: String(f.get('body') || '').trim() || null });
    if (error) { $('idea-msg').textContent = error.message; return; }
    IDEAS_SIM = []; IDEAS_TAB = 'nuevas'; flushMail(); await loadIdeas(); toast('¡Gracias! La revisamos y en cuanto la aprobemos saldrá en el tablón.'); return;
  })();
  return false;
}
function envioIdeaAdmin(ev) {
  const db = window.limonDB, u = db && db.user();
  const ia = ev.target.closest('[data-idea-adm]');
  if (ia) return (async () => {
    ev.preventDefault(); const f = new FormData(ia);
    const { error } = await db.sb.from('ideas').update({ status: f.get('s'), admin_note: String(f.get('n') || '').trim() || null }).eq('id', +ia.dataset.ideaAdm);
    toast(error ? 'No se ha podido: ' + error.message : 'Guardado.'); flushMail(); await loadIdeas(); return;
  })();
  return false;
}
