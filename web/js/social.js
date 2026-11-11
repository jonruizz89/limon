// Limón · perfil público, seguir, diario, listas y resumen del año

// ---------- social: perfil público o privado, seguir a gente y usar lo que hacen tus amigos para recomendarte
let SOC = { me: null, net: null, results: null, editing: false };
let FRIENDS = {};      // 'e123' → [{ name, username, kind: 'guardado' | 'fue', rating }]
let FRIEND_CATS = {};  // categoría → peso, por los planes que tus amigos valoraron bien
// afinidad colectiva: «a quien le gusta A le gusta B» (lift calculado cada noche con los datos de uso consentidos)
let AFF = {};
async function loadAffinity() {
  const db = window.limonDB; if (!db) return;
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data } = await db.sb.from('category_affinity').select('a,b,lift,users_ab').gte('updated_at', since).gte('users_ab', 5).limit(5000);
  if (!data || !data.length) return;
  AFF = {}; data.forEach(r => { (AFF[r.a] = AFF[r.a] || {})[r.b] = r.lift; });
  renderAll();
}
function likedCats() {
  const l = new Set(Object.keys(prefs).filter(k => prefs[k] === 1));
  ((taste && taste.categorias) || []).forEach(c => { if (c.peso >= 2) l.add(c.id); });
  Object.keys(learned).forEach(k => { if (k.startsWith('cat:') && learned[k] >= 1) l.add(k.slice(4)); });
  return l;
}
let DIARY_ROWS = [];                   // de la base de datos, con título y fecha (incluye planes ya pasados)
let MYLISTS = [], FOLLOWED_LISTS = [];
const sbx = () => window.limonDB && window.limonDB.sb;
const uid = () => { const db = window.limonDB; const u = db && db.user(); return u && u.id; };
async function loadSocial() {
  const sb = sbx(), id = uid();
  if (!sb || !id) { SOC.me = null; SOC.net = null; FRIENDS = {}; FRIEND_CATS = {}; MYLISTS = []; FOLLOWED_LISTS = []; DIARY_ROWS = []; renderSocialAll(); return; }
  const [p, t, d, l, lf] = await Promise.all([
    sb.from('profiles').select('username,display_name,is_public,findable_email,bio,ventajas').eq('id', id).maybeSingle(),
    sb.from('topic_follows').select('kind,value'),
    sb.from('attendance').select('event_id,rating,note,created_at,events(title,starts_on,district,venues(name),event_categories(category_id))').eq('user_id', id).eq('went', true).order('created_at', { ascending: false }),
    sb.from('user_lists').select('id,title,description,is_public,list_items(event_id)').eq('owner', id).order('updated_at', { ascending: false }),
    sb.from('list_follows').select('list_id,user_lists(id,title)').eq('user_id', id)]);
  SOC.me = p.data || null;
  if (SOC.me && SOC.me.ventajas && SOC.me.ventajas.length) { ventajas = SOC.me.ventajas; store.set('ventajas', ventajas); }
  else if (SOC.me && ventajas.length) sb.from('profiles').update({ ventajas }).eq('id', id);
  // lo que seguías sin cuenta se sube al entrar
  const remote = t.data || [], key = x => x.kind + '|' + x.value;
  const missing = TOPICS.filter(x => !remote.some(r => key(r) === key(x)));
  if (missing.length) await sb.from('topic_follows').upsert(missing.map(x => ({ user_id: id, kind: x.kind, value: x.value })), { ignoreDuplicates: true });
  TOPICS = remote.concat(missing); store.set('topics', TOPICS);
  DIARY_ROWS = (d.data || []).filter(x => x.events);
  DIARY_ROWS.forEach(x => { if (x.rating || x.note) DIARY['e' + x.event_id] = { rating: x.rating, note: x.note }; });
  store.set('diary', DIARY);
  MYLISTS = (l.data || []).map(x => ({ id: x.id, title: x.title, description: x.description, is_public: x.is_public, items: (x.list_items || []).map(i => 'e' + i.event_id) }));
  FOLLOWED_LISTS = (lf.data || []).map(x => x.user_lists).filter(Boolean);
  FRIENDS = {}; FRIEND_CATS = {}; SOC.net = null;
  if (SOC.me && SOC.me.username) {
    const [n, fa] = await Promise.all([sb.rpc('my_network'), sb.rpc('friends_activity')]);
    SOC.net = n.data || null;
    (fa.data || []).forEach(x => {
      const k = 'e' + x.event_id; (FRIENDS[k] = FRIENDS[k] || []).push(x);
      if (x.kind === 'fue' && x.rating >= 4) (x.cats || []).forEach(c => { if (c !== 'sin_categoria') FRIEND_CATS[c] = Math.min(1.5, (FRIEND_CATS[c] || 0) + 0.3); });
    });
  }
  renderSocialAll(); renderAll();
}
function renderSocialAll() { renderSocial(); renderSeguir(); renderVentajas(); renderYear(); renderDiary(); renderLists(); }
// quién de tus amigos ha guardado o ha ido a este plan
function friendsOf(e) { return (FRIENDS[e.id] || []).filter((x, i, a) => a.findIndex(y => y.username === x.username) === i); }
function friendsHtml(e) {
  const fr = friendsOf(e); if (!fr.length) return '';
  const g = fr.filter(x => x.kind === 'guardado'), w = fr.filter(x => x.kind === 'fue');
  const names = l => l.length <= 2 ? l.map(x => x.name).join(' y ') : `${l[0].name}, ${l[1].name} y ${l.length - 2} más`;
  const parts = [];
  if (g.length) parts.push(`${esc(names(g))} ${g.length === 1 ? 'lo tiene' : 'lo tienen'} guardado`);
  if (w.length) parts.push(`${esc(names(w))} ${w.length === 1 ? 'fue' : 'fueron'}${w.some(x => x.rating) ? ' (' + w.filter(x => x.rating).map(x => '★'.repeat(x.rating)).slice(0, 2).join(', ') + ')' : ''}`);
  return `<div class="crew">👥 ${parts.join(' · ')}</div>`;
}
function friendsBlock(a, b) {
  const list = [];
  for (const k of Object.keys(FRIENDS)) {
    const e = BYID[k]; if (!e || isDismissed(e)) continue;
    const g = friendsOf(e).filter(x => x.kind === 'guardado'); if (!g.length) continue;
    const occ = occurs(e, today, addDays(today, 30)); if (!occ) continue;  // los próximos 30 días, sea cual sea el rango elegido
    list.push({ e, occ, n: g.length });
  }
  list.sort((x, y) => y.n - x.n || x.occ.date - y.occ.date);
  return list.length ? '<h2>Tus amigos van a</h2>' + list.slice(0, 4).map(x => card(x.e, { occ: x.occ })).join('') : '';
}
// seguir salas, ciclos, temas o artistas
const TKIND = { sala: 'la sala', ciclo: 'el ciclo', tema: 'el tema', artista: '' };
const following = (kind, value) => TOPICS.some(x => x.kind === kind && nf(x.value) === nf(value));
function topicHit(e) {
  for (const t of TOPICS) {
    const v = nf(t.value);
    if (t.kind === 'sala' && e.lugar && nf(e.lugar) === v) return t.value;
    if (t.kind === 'ciclo' && e.serie && nf(e.serie) === v) return t.value;
    if (t.kind === 'tema' && (e.temas || []).some(x => nf(x) === v)) return t.value;
    if (t.kind === 'artista' && v.length >= 3 && (' ' + nf(e.titulo + ' ' + (e.descripcion || '')).replace(/[^a-z0-9ñ]+/g, ' ') + ' ').includes(' ' + v.replace(/[^a-z0-9ñ]+/g, ' ').trim() + ' ')) return t.value;
  }
  return null;
}
const topicBtn = (kind, value, label) => `<button class="act" data-topic-kind="${kind}" data-topic="${esc(value)}" aria-pressed="${following(kind, value)}">${following(kind, value) ? '✓ Sigues ' + label : '+ Seguir ' + label}</button>`;
async function toggleTopic(kind, value) {
  const on = !following(kind, value);
  TOPICS = on ? TOPICS.concat({ kind, value }) : TOPICS.filter(x => !(x.kind === kind && nf(x.value) === nf(value)));
  store.set('topics', TOPICS);
  const sb = sbx(), id = uid();
  if (sb && id) {
    if (on) await sb.from('topic_follows').upsert({ user_id: id, kind, value }, { ignoreDuplicates: true });
    else await sb.from('topic_follows').delete().eq('user_id', id).eq('kind', kind).eq('value', value);
  }
  toast(on ? `Sigues «${value}». Lo nuevo te saldrá antes en Para ti${logged ? ' y en el resumen semanal' : ''}.` : `Ya no sigues «${value}».`);
  renderSeguir(); renderAll();
}
function renderSeguir() {
  const box = $('seguir'); if (!box) return;
  box.innerHTML = `<h2 style="margin:0">Lo que sigues</h2>
      <p class="note" style="margin:0">Salas, ciclos, temas o artistas. Lo nuevo te sale antes en Para ti${logged ? ' y en el resumen semanal (si lo tienes activado)' : ''}. Desde cada evento puedes seguir su sala o su ciclo.</p>
      <div class="seg">${TOPICS.map(t => `<button class="filterchip" data-topic-kind="${t.kind}" data-topic="${esc(t.value)}" aria-label="Dejar de seguir ${esc(t.value)}">${esc(t.value)} <span aria-hidden="true">✕</span></button>`).join('') || '<span class="note">Aún no sigues nada.</span>'}</div>
      <form class="seg" id="seguir-form"><input class="search" name="v" maxlength="80" placeholder="Artista, compañía o tema (ej.: Rosalía, flamenco)" style="flex:1;min-width:200px"><button class="btn" type="submit">Seguir</button></form>`;
}
// mis ventajas: descuentos que mencionan las fichas
const VENTAJAS = [
  ['joven', 'Carné Joven o menor de 30', /carn[eé] joven|menores de (25|26|30)|j[oó]venes/i],
  ['estudiante', 'Estudiante', /estudiante/i],
  ['mayor', 'Mayor de 65 o pensionista', /mayores de 6[05]|jubilad|pensionist|tercera edad|\+ ?65/i],
  ['paro', 'En desempleo', /desemplead|parad[oa]s|en paro/i],
  ['familia', 'Familia numerosa o monoparental', /familias? numerosas?|monoparental/i],
  ['discapacidad', 'Discapacidad', /discapacidad|diversidad funcional/i]];
function ventajaHit(e) {
  if (!ventajas.length || e.gratis) return null;
  const t = (e.precio || '') + ' ' + (e.descripcion || '');
  const v = VENTAJAS.find(([k, , re]) => ventajas.includes(k) && re.test(t));
  return v ? v[1] : null;
}
function renderVentajas() {
  const box = $('ventajas'); if (!box) return;
  box.innerHTML = `<h2 style="margin:0">Mis ventajas</h2>
      <p class="note" style="margin:0">Marca lo que tengas y te señalaremos los planes cuya ficha menciona un descuento o entrada gratis para ti. Compruébalo siempre en la web del evento. No se comparte con nadie.</p>
      <div class="seg">${VENTAJAS.map(([k, l]) => `<label class="pill" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" data-ventaja="${k}" ${ventajas.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
}
// diario: «Ya fui» con estrellas y apuntes
async function saveDiary(id, patch) {
  DIARY[id] = Object.assign({}, DIARY[id] || {}, patch); store.set('diary', DIARY);
  const sb = sbx(), u = uid();
  if (sb && u) {
    const { error } = await sb.from('attendance').upsert({ user_id: u, event_id: +id.slice(1), went: true, rating: DIARY[id].rating || null, note: DIARY[id].note || null }, { onConflict: 'user_id,event_id' });
    if (error) toast('No se ha podido guardar: ' + error.message);
  }
}
const starsTxt = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
function diaryForm(e) {
  const d = DIARY[e.id] || {};
  return `<div class="diary"><span class="note">¿Qué tal?</span> <span class="stars" role="group" aria-label="Tu valoración">${[1, 2, 3, 4, 5].map(n => `<button class="star" data-rate="${e.id}" data-n="${n}" aria-label="${n} de 5" aria-pressed="${(d.rating || 0) >= n}">${(d.rating || 0) >= n ? '★' : '☆'}</button>`).join('')}</span>
      <form class="seg" data-note-form="${e.id}" style="margin-top:6px"><input class="search" name="note" maxlength="500" value="${esc(d.note || '')}" placeholder="Apuntes para ti (y para quien te siga)" style="flex:1;min-width:180px"><button class="btn ghost" type="submit">Guardar</button></form></div>`;
}
function renderDiary() {
  const box = $('ag-diary'); if (!box) return;
  const rows = DIARY_ROWS.length ? DIARY_ROWS.map(x => ({ id: 'e' + x.event_id, title: x.events.title, date: x.events.starts_on, rating: (DIARY['e' + x.event_id] || {}).rating || x.rating, note: (DIARY['e' + x.event_id] || {}).note || x.note }))
    : went.map(id => BYID[id] ? { id, title: BYID[id].titulo, date: BYID[id].inicio, rating: (DIARY[id] || {}).rating, note: (DIARY[id] || {}).note } : null).filter(Boolean);
  box.innerHTML = `<h2 style="margin:0">Mi diario</h2>
      <p class="note" style="margin:0">Los planes que marcas con «Ya fui», con tu nota y tus apuntes.${SOC.me && SOC.me.username ? (SOC.me.is_public ? ' Tu perfil es público: cualquiera puede verlo.' : ' Solo lo ven las personas que te siguen.') : ''}</p>
      ${rows.slice(0, 30).map(r => `<div class="row-item"><div style="min-width:0;flex:1">${BYID[r.id] ? `<button class="btnlink" data-goev="${r.id}">${esc(r.title)}</button>` : esc(r.title)}<div class="note">${esc(r.date || '')}${r.rating ? ' · <span class="stars">' + starsTxt(r.rating) + '</span>' : ''}${r.note ? ' · «' + esc(r.note) + '»' : ''}</div></div></div>`).join('') || '<p class="note">Aún vacío. Abre un plan al que hayas ido y pulsa «Ya fui».</p>'}`;
}
// listas de planes
function listPicker(e) {
  if (!logged) return '<p class="note">Entra con tu cuenta para crear listas.</p>';
  return `<div class="routewarn"><b>Añadir a una lista</b>
      ${MYLISTS.map(l => `<label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" data-li-toggle="${l.id}" data-ev="${e.id}" ${l.items.includes(e.id) ? 'checked' : ''}> ${esc(l.title)} <span class="note">${l.is_public ? 'pública' : 'privada'}</span></label>`).join('')}
      <form class="seg" data-newlist="${e.id}" style="margin-top:8px"><input class="search" name="t" required minlength="2" maxlength="80" placeholder="Nueva lista (ej.: Domingos de lluvia)" style="flex:1;min-width:160px"><label class="note" style="display:flex;gap:4px;align-items:center"><input type="checkbox" name="pub" checked> Pública</label><button class="btn" type="submit">Crear</button></form></div>`;
}
function renderLists() {
  const box = $('ag-lists'); if (!box) return;
  if (!logged) { box.innerHTML = `<h2 style="margin:0">Mis listas</h2><p class="note">Entra con tu cuenta para hacer listas de planes («${esc(CITY.name)} con niños», «Jazz en salas pequeñas»…) y compartirlas.</p>`; return; }
  box.innerHTML = `<h2 style="margin:0">Mis listas</h2>
      <p class="note" style="margin:0">Desde cualquier plan, «Añadir a lista». Las públicas las puede ver y seguir cualquiera con el enlace.</p>
      ${MYLISTS.map(l => `<div class="row-item"><div style="min-width:0;flex:1"><button class="btnlink" data-list="${l.id}"><b>${esc(l.title)}</b></button><div class="note">${l.items.length} planes · ${l.is_public ? 'pública' : 'privada'}</div></div>
        <div class="seg"><button class="act" data-list-pub="${l.id}">${l.is_public ? 'Hacer privada' : 'Hacer pública'}</button>${l.is_public ? `<button class="act" data-list-share="${l.id}">Compartir</button>` : ''}<button class="act" data-list-del="${l.id}">Borrar</button></div></div>`).join('') || '<p class="note">Aún no tienes listas.</p>'}
      ${FOLLOWED_LISTS.length ? '<h3 class="ph">Listas que sigues</h3>' + FOLLOWED_LISTS.map(l => `<div class="row-item"><button class="btnlink" data-list="${l.id}">${esc(l.title)}</button></div>`).join('') : ''}`;
}
// ventana para ver un perfil o una lista
let SHEET = null;
// ventanas (zona, perfiles, listas…): se cierran con la X, tocando fuera, deslizando hacia abajo, con Esc o con el botón «atrás» del móvil
function openSheet(html) {
  const d = $('sheet'); $('sheet-body').innerHTML = html;
  if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); try { history.pushState({ sheet: 1 }, ''); } catch (e) { } }
}
function initSheet() {
  const d = $('sheet'); let fromPop = false, y0 = null, dy = 0;
  d.addEventListener('close', () => { d.style.transform = ''; if (!fromPop && history.state && history.state.sheet) history.back(); fromPop = false; });
  window.addEventListener('popstate', () => { if (d.open) { fromPop = true; d.close(); } });
  d.addEventListener('click', ev => {  // toque en el fondo oscuro, fuera de la ventana
    if (ev.target !== d) return; const r = d.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close();
  });
  const body = $('sheet-body');
  d.addEventListener('touchstart', ev => { y0 = body.scrollTop <= 0 ? ev.touches[0].clientY : null; dy = 0; }, { passive: true });
  d.addEventListener('touchmove', ev => { if (y0 === null) return; dy = ev.touches[0].clientY - y0; if (dy > 0) d.style.transform = `translateY(${dy}px)`; }, { passive: true });
  d.addEventListener('touchend', () => { if (y0 === null) return; if (dy > 90) d.close(); else d.style.transform = ''; y0 = null; });
}
const closeSheets = () => document.querySelectorAll('dialog[open]').forEach(d => d.close());
const miniRow = e => { const o = occurs(e, today, addDays(today, 400)); return `<div class="row-item"><div style="min-width:0;flex:1"><button class="btnlink" data-goev="${e.id}">${esc(e.titulo)}</button><div class="note">${esc(whenText(e, o))}${e.lugar ? ' · ' + esc(e.lugar) : ''}</div></div></div>`; };
function followBtn(p) {
  if (p.following === 'accepted') return `<button class="act" data-unfollow="${esc(p.username)}" aria-pressed="true">Siguiendo ✓</button>`;
  if (p.following === 'pending') return `<button class="act" data-unfollow="${esc(p.username)}">Solicitud enviada</button>`;
  return `<button class="act" data-follow="${esc(p.username)}">${p.follows_me === 'accepted' ? 'Seguir también' : 'Seguir'}</button>`;
}
async function openProfile(username) {
  openSheet('<p class="note">Cargando…</p>');
  const { data } = await sbx().rpc('profile_view', { p_username: username });
  SHEET = { kind: 'perfil', data };
  renderSheet();
}
async function openList(id) {
  openSheet('<p class="note">Cargando…</p>');
  const { data } = await sbx().rpc('list_view', { p_id: +id });
  SHEET = { kind: 'lista', data };
  renderSheet();
}
function renderSheet() {
  if (!SHEET) return;
  const p = SHEET.data, close = '<button class="btn ghost" data-sheet-close>Cerrar</button>';
  if (!p) { $('sheet-body').innerHTML = `<div class="seg" style="justify-content:space-between"><h2 style="margin:0">No disponible</h2>${close}</div><p class="note">No existe o es privado.</p>`; return; }
  if (SHEET.kind === 'lista') {
    const evs = (p.items || []).map(i => BYID['e' + i.event_id] ? miniRow(BYID['e' + i.event_id]) : `<div class="row-item"><span class="note">${esc(i.title)} (ya pasó)</span></div>`);
    $('sheet-body').innerHTML = `<div class="seg" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${esc(p.title)}</h2>
        <p class="note" style="margin:2px 0 0">${p.owner ? `de <button class="btnlink" data-prof="${esc(p.owner.username)}">${esc(p.owner.name)}</button> · ` : ''}${(p.items || []).length} planes · ${p.n_followers} la siguen${p.public ? '' : ' · privada'}</p></div>${close}</div>
        ${p.description ? `<p style="margin:0">${esc(p.description)}</p>` : ''}
        <div class="seg">${!p.mine && logged ? `<button class="act" data-list-follow="${p.id}" aria-pressed="${p.following}">${p.following ? 'Siguiendo ✓' : 'Seguir lista'}</button>` : ''}${p.public ? `<button class="act" data-list-share="${p.id}">Compartir</button>` : ''}</div>
        ${evs.join('') || '<p class="note">Lista vacía.</p>'}`;
    return;
  }
  const up = (p.saved || []).map(id => BYID['e' + id]).filter(Boolean).sort((a, b) => a.inicio.localeCompare(b.inicio) || horaOrden(a) - horaOrden(b)).slice(0, 15);
  const head = `<div class="seg" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${esc(p.name)}</h2>
        <p class="note" style="margin:2px 0 0">@${esc(p.username)} · ${p.public ? 'perfil público' : 'perfil privado'} · ${p.n_followers} seguidores · sigue a ${p.n_following}</p></div>${close}</div>
      ${p.bio ? `<p style="margin:0">${esc(p.bio)}</p>` : ''}
      ${p.me ? '<p class="note" style="margin:0">Así ven tu perfil quienes pueden verlo.</p>' : logged && SOC.me && SOC.me.username ? `<div class="seg">${followBtn(p)}</div>` : `<p class="note" style="margin:0">${logged ? 'Crea tu perfil en Perfil → Amigos para seguir a esta persona.' : 'Entra con tu cuenta para seguir a esta persona.'}</p>`}`;
  if (!p.visible) {
    $('sheet-body').innerHTML = head + `<p class="note">🔒 Perfil privado. ${p.following === 'pending' ? 'Has pedido seguirle: cuando acepte verás sus planes.' : 'Síguele y, cuando acepte, verás sus planes, su diario y sus listas.'}</p>`;
    return;
  }
  $('sheet-body').innerHTML = head +
    '<h3 class="ph">Va a ir o lo tiene guardado</h3>' + (up.map(miniRow).join('') || '<p class="note">Nada próximo.</p>') +
    '<h3 class="ph">Ha ido</h3>' + ((p.went || []).slice(0, 20).map(w => `<div class="row-item"><div style="min-width:0;flex:1">${BYID['e' + w.event_id] ? `<button class="btnlink" data-goev="e${w.event_id}">${esc(w.title)}</button>` : esc(w.title)}<div class="note">${esc(w.date)}${w.rating ? ' · <span class="stars">' + starsTxt(w.rating) + '</span>' : ''}${w.note ? ' · «' + esc(w.note) + '»' : ''}</div></div></div>`).join('') || '<p class="note">Aún nada.</p>') +
    ((p.lists || []).length ? '<h3 class="ph">Listas</h3>' + p.lists.map(l => `<div class="row-item"><button class="btnlink" data-list="${l.id}">${esc(l.title)}</button><span class="note">${l.n} planes</span></div>`).join('') : '');
}
// panel de amigos en Perfil
const personRow = (p, actions) => `<div class="row-item"><div style="min-width:0;flex:1"><button class="btnlink" data-prof="${esc(p.username)}"><b>${esc(p.name)}</b></button> <span class="note">@${esc(p.username)}${p.public ? '' : ' · 🔒'}</span></div><div class="seg">${actions}</div></div>`;
function renderSocial() {
  const box = $('social'); if (!box) return;
  if (!logged) { box.innerHTML = '<h2 style="margin:0">Amigos</h2><p class="note">Entra con tu cuenta (arriba, en «Entra o crea tu cuenta») para seguir a tus amigos, ver a qué planes van y que Limón te recomiende también por lo que hacen.</p>'; return; }
  const me = SOC.me;
  if (!me || !me.username || SOC.editing) {
    const ed = me && me.username;
    box.innerHTML = `<h2 style="margin:0">${ed ? 'Editar tu perfil' : 'Amigos: crea tu perfil'}</h2>
        <p class="note" style="margin:0">Para seguir a tus amigos y que te sigan. Nadie verá tu correo.</p>
        <form class="form" id="soc-form">
          <label>Tu nombre<input class="search" name="name" required maxlength="40" value="${esc(ed ? me.display_name || '' : '')}" placeholder="Como quieres que te vean"></label>
          <label>Usuario<input class="search" name="username" required maxlength="20" value="${esc(ed ? me.username : '')}" placeholder="ej.: ana.madrid" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
          <label class="full">Sobre ti (opcional)<input class="search" name="bio" maxlength="160" value="${esc(ed ? me.bio || '' : '')}" placeholder="Jazz, teatro y paseos por el Retiro"></label>
          <div class="full" style="display:flex;flex-direction:column;gap:6px">
            <label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="vis" value="priv" ${!ed || !me.is_public ? 'checked' : ''}><span><b>Privado</b> (recomendado): solo las personas que apruebes ven tus planes, tu diario y tus listas privadas.</span></label>
            <label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="vis" value="pub" ${ed && me.is_public ? 'checked' : ''}><span><b>Público</b>: cualquiera puede seguirte y ver a qué planes vas.</span></label>
            <label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="findable" ${ed && me.findable_email ? 'checked' : ''}><span>Que me encuentren quienes tengan mi correo en sus contactos</span></label>
          </div>
          <div class="seg full"><button class="btn" type="submit">Guardar</button>${ed ? '<button class="btn ghost" type="button" data-soc-cancel>Cancelar</button>' : ''}<span class="note" id="soc-msg" role="status"></span></div>
        </form>`;
    return;
  }
  const net = SOC.net || { following: [], followers: [], requests: [] };
  const canContacts = !!(navigator.contacts && window.ContactsManager);
  box.innerHTML = `<div class="seg" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Amigos</h2><button class="act" data-soc-edit>Editar perfil</button></div>
      <p class="note" style="margin:0"><button class="btnlink" data-prof="${esc(me.username)}"><b>${esc(me.display_name || me.username)}</b></button> · @${esc(me.username)} · ${me.is_public ? 'perfil público' : '🔒 perfil privado'}</p>
      <div class="seg"><button class="btn ghost" data-soc-share>Compartir mi perfil</button>${canContacts ? '<button class="btn ghost" data-soc-contacts>Buscar en mis contactos</button>' : ''}</div>
      <form class="seg" id="soc-search"><input class="search" name="q" placeholder="Buscar por nombre o @usuario" style="flex:1;min-width:180px" autocomplete="off"><button class="btn" type="submit">Buscar</button></form>
      ${SOC.results ? `<div>${SOC.results.length ? SOC.results.map(p => personRow(p, followBtn(p))).join('') : `<p class="note">${SOC.resultsMsg || 'No he encontrado a nadie.'} Comparte tu perfil para que te encuentren.</p>`}</div>` : ''}
      ${net.requests.length ? `<h3 class="ph">Quieren seguirte (${net.requests.length})</h3>` + net.requests.map(p => personRow(p, `<button class="act" data-req-ok="${esc(p.username)}">Aceptar</button><button class="act" data-req-no="${esc(p.username)}">Rechazar</button>`)).join('') : ''}
      <details><summary class="note" style="cursor:pointer">Sigues a ${net.following.length} · Te siguen ${net.followers.length}</summary>
        ${net.following.map(p => personRow(p, followBtn(p))).join('') || '<p class="note">Aún no sigues a nadie.</p>'}
        ${net.followers.length ? '<h3 class="ph">Te siguen</h3>' + net.followers.map(p => personRow(p, (p.following ? '' : followBtn(p)) + `<button class="act" data-req-no="${esc(p.username)}">Quitar</button>`)).join('') : ''}
      </details>
      <p class="note" style="margin:0">Lo que guardan y a lo que van las personas que sigues te ayuda a descubrir planes: sale en Para ti con su nombre.${canContacts ? '' : ' Buscar en la agenda del móvil solo funciona en Chrome para Android; desde aquí, comparte tu perfil por WhatsApp o búscales por su usuario.'}</p>`;
}
async function socialAction(t) {
  const sb = sbx(); if (!sb) return false;
  const f = t.closest('[data-follow]'), uf = t.closest('[data-unfollow]'), ok = t.closest('[data-req-ok]'), no = t.closest('[data-req-no]');
  if (f) { const { data, error } = await sb.rpc('follow_user', { p_username: f.dataset.follow }); toast(error ? error.message : data === 'pending' ? 'Solicitud enviada: verás sus planes cuando acepte.' : 'Ahora le sigues.'); }
  else if (uf) { await sb.rpc('unfollow_user', { p_username: uf.dataset.unfollow }); toast('Ya no le sigues.'); }
  else if (ok) { await sb.rpc('follow_respond', { p_username: ok.dataset.reqOk, p_accept: true }); toast('Aceptado.'); }
  else if (no) { await sb.rpc('follow_respond', { p_username: no.dataset.reqNo, p_accept: false }); toast('Hecho.'); }
  else return false;
  flushMail();
  if (SOC.results) { const q = SOC.lastQ; if (q) { const r = await sb.rpc('profile_search', { p_q: q }); SOC.results = r.data || []; } }
  await loadSocial();
  if (SHEET && SHEET.kind === 'perfil' && $('sheet').open && SHEET.data) openProfile(SHEET.data.username);
  return true;
}
async function shareLink(url, title, text) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Enlace copiado.'); } catch (x) { prompt('Copia este enlace:', url); }
}
// tu año en planes
function renderYear() {
  const box = $('year'); if (!box) return;
  box.innerHTML = `<div class="seg" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Tu año en planes</h2><button class="btn ghost" data-year>${state.year ? 'Ocultar' : 'Ver mi ' + today.getFullYear()}</button></div>` + (state.year || '');
}
function buildYear() {
  const y = String(today.getFullYear());
  // la fecha que cuenta es cuándo marcaste «Ya fui» (en una exposición larga, no su inauguración)
  let rows = DIARY_ROWS.filter(x => (x.created_at || '').startsWith(y)).map(x => ({ title: x.events.title, date: x.created_at.slice(0, 10), district: x.events.district, venue: x.events.venues && x.events.venues.name, cats: (x.events.event_categories || []).map(c => c.category_id), rating: x.rating }));
  if (!rows.length) rows = went.map(id => BYID[id]).filter(e => e && e.inicio.startsWith(y)).map(e => ({ title: e.titulo, date: e.inicio, district: e.distrito, venue: e.lugar, cats: e.cats, rating: (DIARY[e.id] || {}).rating }));
  if (!rows.length) return '<p class="note">Aún no has marcado ningún plan con «Ya fui» este año. Cuando lo hagas, aquí verás tu resumen.</p>';
  const top = (arr, n) => { const c = {}; arr.filter(Boolean).forEach(x => { c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n); };
  const cats = top(rows.flatMap(r => r.cats.filter(c => c !== 'sin_categoria')).map(labelOf), 3), dis = top(rows.map(r => r.district), 3), ven = top(rows.map(r => r.venue), 3);
  const months = top(rows.map(r => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+r.date.slice(5, 7) - 1]), 1);
  const rated = rows.filter(r => r.rating), best = rated.sort((a, b) => b.rating - a.rating)[0];
  const lines = [`${rows.length} ${rows.length === 1 ? 'plan' : 'planes'} en ${y}`, cats.length && 'Lo tuyo: ' + cats.map(x => x[0]).join(', '), dis.length && 'Tus barrios: ' + dis.map(x => x[0]).join(', '),
    ven.length && 'Donde más has ido: ' + ven.map(x => x[0]).join(', '), months.length && 'Tu mes más activo: ' + months[0][0], best && `Tu favorito: ${best.title} (${'★'.repeat(best.rating)})`].filter(Boolean);
  SOC.yearText = lines.join(' · ');
  return `<div class="routewarn" style="font-size:15px"><b style="font-size:22px">${rows.length}</b> ${rows.length === 1 ? 'plan' : 'planes'} en ${y}<ul style="margin:8px 0 0;padding-left:18px">${lines.slice(1).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
      <div class="seg"><button class="btn ghost" data-year-share>Compartir</button></div>`;
}
