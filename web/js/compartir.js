// Limón · enlace propio de cada plan, compartir, quedar y «Este finde en…»

// ---------- enlace propio de cada plan: abrir la ficha cambia la dirección (?ev=) y «atrás» la cierra
const SLUG_MAP = { á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c' };
const slugEv = t => (String(t || '').toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, c => SLUG_MAP[c]).replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)) || 'x';
const appEvUrl = e => location.origin + '/?c=' + encodeURIComponent(window.limonCity.zone().split('|')[0]) + '&ev=' + e.id;
// para compartir: la página del plan (con su foto en WhatsApp y en buscadores) si ya existe; si es de hoy, la app
function shareEvUrl(e) {
  const dias = (parse(e.inicio) - today) / 864e5, alta = e.alta ? Date.now() - Date.parse(e.alta) : 0;
  const publicada = CITY.status === 'publicada';
  return publicada && location.hostname === 'limonplanes.com' && alta > 30 * 36e5 && dias <= 175
    ? 'https://limonplanes.com/evento/' + e.id.replace(/^e/, '') + '-' + slugEv(e.titulo) + '/' : appEvUrl(e);
}
let fichaHist = null;  // id de la ficha abierta que añadió una entrada al historial
function fichaHistoria(id, abierta) {
  try {
    if (abierta) {
      const u = '?c=' + encodeURIComponent(window.limonCity.zone().split('|')[0]) + '&ev=' + id;
      if (fichaHist) history.replaceState({ ev: id }, '', u); else history.pushState({ ev: id }, '', u);
      fichaHist = id;
    } else if (fichaHist === id) { fichaHist = null; history.back(); }
  } catch (x) { }
}
async function shareEv(e) {
  const url = shareEvUrl(e), occ = occurs(e, today, addDays(today, 400));
  const text = `${e.titulo} · ${whenText(e, occ)}${e.lugar ? ' · ' + e.lugar : ''}`;
  track('compartir', e.id);
  if (navigator.share) { try { await navigator.share({ title: e.titulo, text, url }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Enlace copiado: pégalo en WhatsApp o donde quieras.'); }
  catch (x) { prompt('Copia este enlace:', url); }
}
// ---------- quedar: proponer un plan con un enlace y ver quién se apunta
let INV = {};  // id de evento → invitaciones que he creado, con respuestas
async function loadInvites() {
  const db = window.limonDB, u = db && db.user(); INV = {};
  if (!u) return;
  const { data } = await db.sb.from('plan_invites').select('id,token,event_id,on_date,plan_rsvps(name,status)').eq('owner', u.id).order('created_at');
  (data || []).forEach(x => { (INV['e' + x.event_id] = INV['e' + x.event_id] || []).push(x); });
  renderAll();
}
const ST_RSVP = { voy: 'va', quizas: 'quizá', no: 'no puede' };
function crewHtml(e) {
  const inv = INV[e.id]; if (!inv) return '';
  const rs = inv.flatMap(x => x.plan_rsvps || []);
  const yes = rs.filter(r => r.status === 'voy').length;
  return `<div class="crew">👥 ${rs.length ? (yes ? `Os apuntáis ${yes + 1}: ` : '') + esc(rs.map(r => r.name + ' ' + ST_RSVP[r.status]).join(' · ')) : 'Aún no ha respondido nadie'} · <button data-reshare="${inv[inv.length - 1].token}" data-ev="${e.id}">Compartir otra vez</button></div>`;
}
const inviteUrl = t => location.origin + location.pathname + '?quedar=' + t;
async function shareInvite(e, token, from) {
  const url = inviteUrl(token), occ = occurs(e, today, addDays(today, 400));
  const text = `${from ? from + ' te propone' : 'Te propongo'} ir a «${e.titulo}» (${whenText(e, occ)}). ¿Te apuntas?`;
  if (navigator.share) { try { await navigator.share({ title: e.titulo, text, url }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Enlace copiado: pégalo en WhatsApp o donde quieras.'); }
  catch (x) { prompt('Copia este enlace:', url); }
}
function inviteForm(e) {
  return `<form class="form" data-invite-form="${e.id}" style="margin-top:8px">
      <label>Tu nombre<input class="search" name="from" required maxlength="60" value="${esc(store.get('myname', ''))}"></label>
      <label>Mensaje (opcional)<input class="search" name="note" maxlength="280" placeholder="¿Vamos juntos?"></label>
      <div class="seg full"><button class="btn" type="submit">Crear enlace y compartir</button><button class="btn ghost" type="button" data-invite-cancel>Cancelar</button></div>
      <p class="note full">Quien lo abra podrá decir si se apunta, sin necesidad de cuenta. Verás las respuestas aquí y te avisaremos por correo.</p></form>`;
}
let QD = null;  // invitación abierta desde un enlace ?quedar=
function renderQuedar() {
  const box = $('quedar');
  if (!QD) { box.hidden = true; return; }
  box.hidden = false;
  const e = BYID['e' + QD.data.event_id];
  const rs = QD.data.rsvps || [], mineR = store.get('rsvp:' + QD.token, null);
  if (!e) { box.innerHTML = `<h2 style="margin:0">${esc(QD.data.from_name)} te propuso un plan</h2><p class="note">Ese plan ya ha pasado o ya no está en Limón.</p>`; return; }
  box.innerHTML = `<h2 style="margin:0">${QD.data.mine ? 'Tu propuesta' : esc(QD.data.from_name) + ' te propone un plan'}</h2>
      ${QD.data.note ? `<p style="margin:0">«${esc(QD.data.note)}»</p>` : ''}
      <p class="note" style="margin:0"><b>${esc(e.titulo)}</b> · ${esc(whenText(e, occurs(e, today, addDays(today, 400))))} · ${esc(e.lugar || '')}</p>
      ${QD.data.mine ? '' : `<form class="seg" id="q-form" style="align-items:flex-end">
        <label class="note" style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:160px">Tu nombre<input class="search" name="name" required maxlength="60" value="${esc(store.get('myname', ''))}"></label>
        <button class="btn" name="s" value="voy" aria-pressed="${mineR === 'voy'}">Me apunto</button><button class="btn ghost" name="s" value="quizas" aria-pressed="${mineR === 'quizas'}">Quizá</button><button class="btn ghost" name="s" value="no" aria-pressed="${mineR === 'no'}">No puedo</button></form>`}
      <p class="note" style="margin:0">${rs.length ? 'Respuestas: ' + esc(rs.map(r => r.name + ' ' + ST_RSVP[r.status]).join(' · ')) : 'Aún no ha respondido nadie.'}</p>
      ${QD.data.mine ? '' : '<p class="note" style="margin:0">Tu nombre y tu respuesta los verá quien tenga este enlace.</p>'}`;
}
function deviceKey() {
  let k = store.get('device', null);
  if (!k) { k = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); store.set('device', k); }
  return k;
}
// ---------- compartir «Este finde en …»: enlace a la página pública del finde de la zona (se genera cada mañana)
let FINDE = null;
const zslug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
function findePath() {
  if (!FINDE) return null;
  return FINDE[CITY.muni ? zslug(CITY.muni) : CITY.id] || FINDE[CITY.muni ? CITY.id + '-' + zslug(CITY.muni) : ''] || null;
}
function shareFindeBtn() {
  const p = state.when === 'finde' && findePath();
  return p ? `<div class="seg" style="margin:4px 0 10px"><button class="btn ghost" data-share-finde="${esc(p)}">📤 Compartir los planes del finde en ${esc(CITY.name)}</button></div>` : '';
}
async function shareFinde(p) {
  const url = 'https://limonplanes.com' + p, text = '🍋 Planes este finde en ' + CITY.name;
  track('compartir', null, { que: 'finde' });
  if (navigator.share) { try { await navigator.share({ title: text, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  window.open('https://wa.me/?text=' + encodeURIComponent(text + ': ' + url), '_blank', 'noopener');
}

// ---------- arranque: ahorro de datos, botón atrás con una ficha abierta e icono de compartir
let AHORRO, SHARE_ICO, C_ZONA;  // se fijan al arrancar (iniciaFichas)
function iniciaFichas() {
  AHORRO = !!(navigator.connection && navigator.connection.saveData);
  window.addEventListener('popstate', ev => {
    if (fichaHist && !(ev.state && ev.state.ev)) { state.open[fichaHist] = false; fichaHist = null; renderAll(); }
  });
  // icono de compartir como el del sistema: en Apple, la caja con la flecha; en el resto, los tres puntos unidos
  SHARE_ICO = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>';
  C_ZONA = window.limonCity.zone().split('|')[0];
}

// ---------- arranque: «este finde», si ya está publicado
function iniciaFinde() {
  fetch('/planes/finde.json').then(r => r.ok ? r.json() : {}).then(j => { FINDE = j || {}; renderAll(); }).catch(() => { FINDE = {}; });
}

// ---------- arranque: enlace de una quedada
function iniciaQuedada() {
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
}

// ---------- clics de este tema. Cada función devuelve true si el clic era suyo; el orden en que se prueban está en js/inicio.js
function clicSharev(ev) {
  const shv = ev.target.closest('[data-sharev]'); if (shv && BYID[shv.dataset.sharev]) { shareEv(BYID[shv.dataset.sharev]); return true; }
  return false;
}
function clicShareFinde(ev) {
  if (ev.target.closest('[data-share-finde]')) { shareFinde(ev.target.closest('[data-share-finde]').dataset.shareFinde); return true; }
  return false;
}
function clicInvite(ev) {
  const ib = ev.target.closest('[data-invite]');
  if (ib) {
    if (!logged) { toast('Entra con tu cuenta (en Perfil) para proponer planes y ver quién se apunta.'); return true; }
    state.inviting = state.inviting === ib.dataset.invite ? null : ib.dataset.invite; renderAll(); return true;
  }
  return false;
}
function clicInviteCancel(ev) {
  if (ev.target.closest('[data-invite-cancel]')) { state.inviting = null; renderAll(); return true; }
  return false;
}
function clicReshare(ev) {
  const rs = ev.target.closest('[data-reshare]');
  if (rs) { shareInvite(BYID[rs.dataset.ev], rs.dataset.reshare, store.get('myname', '')); return true; }
  return false;
}

// ---------- cambios y envíos de formularios de este tema. Devuelven false si no era suyo; el orden está en js/inicio.js
function envioInvitar(ev) {
  const db = window.limonDB, u = db && db.user();
  const inf = ev.target.closest('[data-invite-form]');
  if (inf) return (async () => {
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
  })();
  return false;
}
function envioQuedada(ev) {
  const db = window.limonDB, u = db && db.user();
  if (ev.target.id === 'q-form') return (async () => {
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
  })();
  return false;
}
