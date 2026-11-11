// Limón · cuenta, organizadores, avisos push, instalar la app y estadísticas

let me = null, mySubs = [], admQueue = { editors: [], events: [], ideas: [] }, orgEdit = null;
async function loadMe() {
  const db = window.limonDB, u = db && db.user();
  if (!u) { me = null; renderAccountExtras(); return; }
  const { data } = await db.sb.from('profiles').select('role,editor_status,organizer,ical_token,notify,birth_year,gender').eq('id', u.id).maybeSingle();
  me = data || null;
  if (me && typeof pushSub !== 'undefined' && pushSub && Notification.permission === 'granted') registerSub(pushSub);
  mySubs = [];
  if (me && (me.role === 'editor' || me.role === 'admin')) {
    const r = await db.sb.from('submitted_events').select('*').eq('owner', u.id).order('starts_on', { ascending: false });
    mySubs = r.data || [];
  }
  if (me && me.role === 'admin') {
    const [a, b, c] = await Promise.all([
      db.sb.from('profiles').select('id,email,organizer,editor_status').eq('editor_status', 'solicitado'),
      db.sb.from('submitted_events').select('*').eq('status', 'revision').order('created_at'),
      db.sb.from('ideas').select('id,kind,title,body,created_at').eq('status', 'pendiente').order('created_at')]);
    admQueue = { editors: a.data || [], events: b.data || [], ideas: c.data || [] };
  }
  renderAccountExtras();
}
const ST = { publicado: 'Publicado', revision: 'En revisión', rechazado: 'Rechazado', borrador: 'Retirado' };
function subForm(x) {
  x = x || {};
  return `<form class="form" id="org-form" data-id="${x.id || ''}">
      <label class="full">Título<input class="search" name="title" required minlength="3" maxlength="200" value="${esc(x.title || '')}"></label>
      <label>Desde<input class="search" type="date" name="starts_on" required value="${esc(x.starts_on || '')}"></label>
      <label>Hasta (si dura varios días)<input class="search" type="date" name="ends_on" value="${esc(x.ends_on && x.ends_on !== x.starts_on ? x.ends_on : '')}"></label>
      <label>Hora<input class="search" name="time_text" maxlength="80" placeholder="19:30" value="${esc(x.time_text || '')}"></label>
      <label>Precio<input class="search" name="price_text" maxlength="120" placeholder="12 € · gratis con inscripción" value="${esc(x.price_text || '')}"></label>
      <label>Lugar<input class="search" name="venue_name" maxlength="200" required value="${esc(x.venue_name || '')}"></label>
      <label>Dirección<input class="search" name="address" maxlength="200" placeholder="Calle y número" value="${esc(x.address || '')}"></label>
      <label class="full">Web o inscripción<input class="search" type="url" name="url" maxlength="500" placeholder="https://" value="${esc(x.url || '')}"></label>
      <label class="full">Descripción<textarea class="search" name="description" rows="4" maxlength="2000">${esc(x.description || '')}</textarea></label>
      <label class="toggle full" style="flex-direction:row">Es gratis<input type="checkbox" name="is_free" ${x.is_free ? 'checked' : ''}></label>
      <div class="seg full"><button class="btn" type="submit">${x.id ? 'Guardar cambios' : 'Enviar evento'}</button><button class="btn ghost" type="button" data-org-cancel>Cancelar</button><span class="note" id="org-msg" role="status"></span></div>
    </form>`;
}
// ---------- avisos push en este dispositivo (PWA). En iPhone solo funcionan con Limón añadido a la pantalla de inicio.
const PUSH_KINDS = [['quedadas', 'Quedadas: alguien responde a un plan que propusiste'], ['amigos', 'Amigos: te quieren seguir o aceptan tu solicitud'],
  ['calle', 'Cortes junto a tus planes de hoy o mañana, o en tus calles (por la mañana)'], ['lluvia', 'Lluvia en un plan al aire libre que tienes guardado'],
  ['fuiste', '«¿Al final fuiste?»: la mañana siguiente a un plan que tenías guardado'], ['ideas', 'Ideas: cambia el estado de una idea tuya'], ['organizador', 'Organizador: revisamos tu solicitud o tus eventos'], ['admin', 'Admin: algo pendiente de revisión']];
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function instalarCard() {
  if (VISITAS < 3 || standalone() || store.get('instalar_no', false) || !matchMedia('(max-width: 900px)').matches) return '';
  if (window.__limonInstall) return `<div class="instala"><div><b>📲 Ten Limón en tu pantalla de inicio</b><span>Se abre al momento, como una app, y sin ocupar espacio.</span></div><div class="seg"><button class="btn" data-instalar>Instalar</button><button class="btn ghost" data-instalar-no>Ahora no</button></div></div>`;
  if (esSafariIOS) return `<div class="instala"><div><b>📲 Ten Limón en tu pantalla de inicio</b><span>Toca <b>Compartir</b> (el cuadrado con la flecha, abajo en Safari) y después <b>«Añadir a pantalla de inicio»</b>.</span></div><div class="seg"><button class="btn ghost" data-instalar-no>Entendido</button></div></div>`;
  return '';
}
let pushSub = null, pushBusy = false;
const b64u8 = b => { const p = '='.repeat((4 - b.length % 4) % 4), r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const deviceName = () => (isIOS ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.platform) ? 'Mac' : /Win/.test(navigator.platform) ? 'Windows' : 'Navegador') + (standalone() ? ' (app)' : '');
async function registerSub(sub) {
  const db = window.limonDB, u = db && db.user(); if (!u || !sub) return null;
  const j = sub.toJSON();
  const { error } = await db.sb.rpc('push_register', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: deviceName() });
  return error;
}
async function refreshPush() {
  if (!pushOk()) return;
  try { const reg = await navigator.serviceWorker.ready; pushSub = await reg.pushManager.getSubscription(); } catch (e) { pushSub = null; }
  if (pushSub && Notification.permission === 'granted') registerSub(pushSub);  // la suscripción queda con la cuenta abierta ahora
  if (logged && me) renderAccountExtras();
}
function pushBlock() {
  if (!pushOk()) return isIOS && !standalone()
    ? '<p class="note">Para recibir avisos en el iPhone: en Safari pulsa Compartir → «Añadir a pantalla de inicio» y abre Limón desde ese icono. Ahí aparecerá el botón para activarlos.</p>'
    : '<p class="note">Este navegador no permite avisos. Prueba con Chrome, Edge, Firefox o Safari actualizados.</p>';
  if (Notification.permission === 'denied') return `<p class="note">Has bloqueado los avisos de Limón en este dispositivo. Para activarlos, cámbialo en los ajustes de notificaciones${isIOS ? ' del iPhone (Ajustes → Notificaciones → Limón)' : ' del navegador'}.</p>`;
  if (!pushSub) return `<p class="note" style="margin:0">Te avisamos al momento en este ${isIOS ? 'iPhone' : 'dispositivo'}: quedadas, amigos, cortes y lluvia en tus planes. Puedes elegir cuáles.</p>
      <div class="seg"><button class="btn" data-push-on ${pushBusy ? 'disabled' : ''}>Activar avisos aquí</button></div>`;
  const pt = (me.notify && me.notify.push) || {};
  const kinds = PUSH_KINDS.filter(([k]) => k !== 'organizador' || me.role === 'editor' || me.role === 'admin' || me.editor_status).filter(([k]) => k !== 'admin' || me.role === 'admin');
  return `<p class="note" style="margin:0">Avisos activados en este dispositivo. Elige cuáles quieres:</p>
      ${kinds.map(([k, t]) => `<label class="toggle">${t}<input type="checkbox" data-push="${k}" ${pt[k] ? 'checked' : ''}></label>`).join('')}
      <div class="seg"><button class="btn ghost" data-push-test>Enviarme un aviso de prueba</button><button class="btn ghost" data-push-off>Desactivar aquí</button></div>`;
}
async function pushOn() {
  const db = window.limonDB, u = db && db.user(); if (!u || !me) { toast('Entra con tu cuenta para activar los avisos.'); return; }
  pushBusy = true; renderAccountExtras();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(perm === 'denied' ? 'Has bloqueado los avisos. Puedes cambiarlo en los ajustes de notificaciones.' : 'Sin permiso no podemos avisarte.'); return; }
    const { data, error } = await window.limonFn('limon-push', { body: { action: 'key' } });
    if (error || !data || !data.key) { toast('No se han podido activar ahora. Prueba en un rato.'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u8(data.key) });
    const err = await registerSub(sub);
    if (err) { toast('No se han podido activar: ' + err.message); return; }
    pushSub = sub;
    if (!me.notify || !me.notify.push) {
      me.notify = Object.assign({}, me.notify || {}, { push: { quedadas: true, amigos: true, calle: true, lluvia: true, fuiste: true, ideas: true, organizador: true, admin: true } });
      await db.sb.from('profiles').update({ notify: me.notify }).eq('id', u.id);
    }
    toast('Avisos activados en este dispositivo.');
  } catch (e) { toast('No se han podido activar: ' + (e && e.message || e)); }
  finally { pushBusy = false; renderAccountExtras(); }
}
async function pushOff() {
  const db = window.limonDB;
  if (pushSub) { try { await db.sb.from('push_subscriptions').delete().eq('endpoint', pushSub.endpoint); await pushSub.unsubscribe(); } catch (e) { } pushSub = null; }
  toast('Avisos desactivados en este dispositivo.'); renderAccountExtras();
}
// el numerito del icono se quita al abrir la app
const clearBadge = () => { try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) { } };
// al volver a la app tras un rato (iOS la deja congelada en segundo plano), si hay versión nueva se recarga sola
const pageVersion = async () => { try { const r = await fetch('index.html', { method: 'HEAD', cache: 'no-store' }); return r.ok ? (r.headers.get('etag') || r.headers.get('last-modified')) : null; } catch (e) { return null; } };
let myVersion = null, hiddenAt = 0;
// ---------- estadísticas (solo administradores): agregados de los últimos 30 días
let STATS = null, statsDays = 30;
async function loadStats() {
  const db = window.limonDB; if (!db) return;
  STATS = { loading: true }; renderStats();
  const [r1, r2] = await Promise.all([db.sb.rpc('admin_stats', { p_city: CITY.id, p_days: statsDays }), db.sb.rpc('admin_demographics', { p_city: CITY.id, p_days: Math.max(statsDays, 90) })]);
  STATS = r1.error ? { error: r1.error.message } : Object.assign({}, r1.data, { demo: r2.data || null }); renderStats();
}
function demoHtml(d, tbl) {
  if (!d) return '';
  const as = d.asistencia || {}, tot = (as.fui || 0) + (as.no_fui || 0);
  const TR = { mujer: 'Mujeres', hombre: 'Hombres', no_binario: 'No binario', otro: 'Otro' };
  return `<h3 style="margin:6px 0 0;font:600 14px var(--f-body)">«¿Al final fuiste?»</h3>
      <p class="note" style="margin:0">${tot ? `De ${tot} respuestas, el ${Math.round(100 * (as.fui || 0) / tot)} % fue al plan que tenía guardado.` : 'Aún sin respuestas.'}</p>
      <h3 style="margin:6px 0 0;font:600 14px var(--f-body)">Edad y sexo</h3>
      <p class="note" style="margin:0">${d.con_edad} cuentas con edad y ${d.con_sexo} con sexo. Solo se muestran los grupos con al menos ${d.umbral} personas, para que nadie sea identificable.</p>
      ${(d.tramos || []).length ? tbl(d.tramos, [['Edad', r => esc(r.tramo)], ['Cuentas', r => r.personas, 1], ['Activas', r => r.activas, 1]]) : ''}
      ${(d.sexo || []).length ? tbl(d.sexo, [['Sexo', r => esc(TR[r.sexo] || r.sexo)], ['Cuentas', r => r.personas, 1]]) : ''}
      ${(d.categorias_por_tramo || []).length ? tbl(d.categorias_por_tramo, [['Edad', r => esc(r.tramo)], ['Lo que más guardan o a lo que van', r => esc(labelOf(r.cat))], ['Personas', r => r.personas, 1]]) : ''}`;
}
function renderStats() {
  const el = $('stats'); if (!el) return;
  const isAdm = logged && me && me.role === 'admin'; el.hidden = !isAdm; if (!isAdm) return;
  if (!STATS) { loadStats(); return; }
  const head = `<h2 style="margin:0">Estadísticas de uso</h2>`;
  if (STATS.loading) { el.innerHTML = head + '<p class="note">Cargando…</p>'; return; }
  if (STATS.error) { el.innerHTML = head + `<p class="note">${esc(STATS.error)}</p>`; return; }
  const u = STATS.usuarios || {}, ac = STATS.acciones || {}, n = k => (ac[k] || 0).toLocaleString('es-ES');
  const days = STATS.por_dia || [], mx = Math.max(1, ...days.map(d => d.personas));
  const tbl = (rows, cols) => rows.length ? `<div class="tablewrap"><table class="cov"><thead><tr>${cols.map(c => `<th${c[2] ? ' class="n"' : ''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td${c[2] ? ' class="n"' : ''}>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="note">Aún sin datos.</p>';
  const abrir = ac.abrir || 0, guardar = ac.guardar || 0;
  el.innerHTML = head + `
      <div class="seg"><span class="note">${esc(CITY.name)} · últimos</span>${[7, 30, 90].map(d => `<button class="act" data-stats-days="${d}" aria-pressed="${d === statsDays}">${d} días</button>`).join('')}</div>
      <div class="stat-grid">
        <div><b>${u.total || 0}</b><span class="note">cuentas (${u.nuevos || 0} nuevas)</span></div>
        <div><b>${(u.activos_cuenta || 0) + (u.activos_anonimos || 0)}</b><span class="note">personas activas (${u.activos_anonimos || 0} sin cuenta)</span></div>
        <div><b>${u.con_estadisticas || 0}</b><span class="note">cuentas comparten estadísticas (${u.sin_estadisticas || 0} no)</span></div>
        <div><b>${n('abrir')}</b><span class="note">fichas abiertas</span></div>
        <div><b>${n('guardar')}</b><span class="note">guardados${abrir ? ` (${Math.round(100 * guardar / abrir)} % de las abiertas)` : ''}</span></div>
        <div><b>${n('voy')}</b><span class="note">«voy»</span></div>
        <div><b>${((ac.web || 0) + (ac.compartir || 0) + (ac.quedar || 0)).toLocaleString('es-ES')}</b><span class="note">salidas a la web, compartir o quedar</span></div>
        <div><b>${n('descartar')}</b><span class="note">descartados</span></div>
      </div>
      ${days.length ? `<h3 style="margin:6px 0 0;font:600 14px var(--f-body)">Personas activas por día</h3><div class="bars" aria-label="Personas activas por día">${days.map(d => `<span title="${esc(d.dia)}: ${d.personas}" style="height:${Math.round(100 * d.personas / mx)}%"></span>`).join('')}</div>` : ''}
      <h3 style="margin:6px 0 0;font:600 14px var(--f-body)">Planes con más interés</h3>
      ${tbl(STATS.top_eventos || [], [['Plan', r => BYID['e' + r.id] ? `<button class="btnlink" data-goto-ev="e${r.id}">${esc(r.title.slice(0, 70))}</button>` : esc(r.title.slice(0, 70))], ['Abiertos', r => r.abiertos, 1], ['Guardados', r => r.guardados, 1], ['Voy', r => r.voy, 1], ['Salidas', r => r.salidas, 1]])}
      <h3 style="margin:6px 0 0;font:600 14px var(--f-body)">Categorías que más interesan</h3>
      ${tbl(STATS.categorias || [], [['Categoría', r => esc(labelOf(r.cat))], ['Personas', r => r.personas, 1], ['Acciones', r => r.acciones, 1]])}
      <h3 style="margin:6px 0 0;font:600 14px var(--f-body)">Lo más buscado</h3>
      ${tbl(STATS.busquedas || [], [['Búsqueda', r => esc(r.q)], ['Veces', r => r.n, 1]])}
      <h3 style="margin:6px 0 0;font:600 14px var(--f-body)">Afinidades entre gustos</h3>
      <p class="note" style="margin:0">«A quien le gusta A le gusta B» varias veces más de lo normal. Solo aparecen parejas con al menos 5 personas en común; con ellas se ajustan las recomendaciones de todos.</p>
      ${tbl(STATS.afinidad || [], [['A', r => esc(labelOf(r.a))], ['B', r => esc(labelOf(r.b))], ['Personas', r => r.users_ab, 1], ['Veces más', r => String(r.lift).replace('.', ','), 1]])}
      ${demoHtml(STATS.demo, tbl)}
      <p class="note" style="margin:0">El uso solo cuenta a quien ha dado permiso para estadísticas.</p>`;
}
// «Sobre ti»: año de nacimiento y sexo, opcionales, solo para estadísticas agregadas
const GENDERS = [['', 'Sin indicar'], ['mujer', 'Mujer'], ['hombre', 'Hombre'], ['no_binario', 'No binario'], ['otro', 'Otro'], ['prefiero_no', 'Prefiero no decirlo']];
function renderDemo() {
  const box = $('demo-box'); if (!box) return;
  if (!logged || !me) { box.innerHTML = ''; return; }
  const y = new Date().getFullYear(), years = []; for (let i = y - 14; i >= y - 100; i--) years.push(i);
  box.innerHTML = `<h3 style="margin:8px 0 0;font:600 14px var(--f-body)">Sobre ti (opcional)</h3>
      <p class="note" style="margin:0">Nos ayuda a saber qué planes interesan a cada edad. Solo se usa en estadísticas de grupos de al menos 10 personas y nunca se muestra a nadie. Puedes quitarlo cuando quieras.</p>
      <div class="seg"><label class="note" style="display:flex;flex-direction:column;gap:4px">Año de nacimiento
        <select class="search" data-demo="birth_year" style="min-width:140px"><option value="">Sin indicar</option>${years.map(v => `<option ${me.birth_year === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="note" style="display:flex;flex-direction:column;gap:4px">Sexo
        <select class="search" data-demo="gender" style="min-width:160px">${GENDERS.map(([v, t]) => `<option value="${v}" ${(me.gender || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>`;
}
function renderAccountExtras() {
  const org = $('org'), adm = $('adm'), cal = $('ag-cal'), mail = $('mail');
  renderStats(); renderDemo();
  if ($('o-stats')) $('o-stats').checked = !!(window.limonConsent && window.limonConsent.get() === '1');
  if (!logged || !me) {
    org.hidden = true; adm.hidden = true; mail.hidden = true;
    cal.innerHTML = `<h2 style="margin:0">Sincronizar con tu calendario</h2><p class="note">Entra con tu cuenta (en Perfil) y tus planes guardados y los cortes de tus calles aparecerán en Google Calendar, Apple u Outlook, y se actualizarán solos.</p>`;
    return;
  }
  const ics = `${CONF.supabaseUrl}/functions/v1/limon-ical?t=${me.ical_token}`, webcal = ics.replace(/^https:/, 'webcal:');
  const android = /Android/i.test(navigator.userAgent);
  const gcal = `<a class="btn${android ? '' : ' ghost'}" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">📅 Sincronizar con Google Calendar</a>`;
  const devcal = `<a class="btn${android ? ' ghost' : ''}" href="${esc(webcal)}" style="display:inline-flex;align-items:center;text-decoration:none">📅 Sincronizar con el calendario ${isIOS || /Mac/.test(navigator.platform) ? 'de Apple' : 'del dispositivo'}</a>`;
  cal.innerHTML = `<h2 style="margin:0">Sincronizar con tu calendario</h2>
      <p class="note">Tus planes guardados y los cortes de tus calles y líneas aparecen solos en tu calendario y se actualizan varias veces al día: si guardas o quitas un plan aquí, cambia también allí. Solo hay que hacerlo una vez.</p>
      <div class="seg">${android ? gcal + devcal : devcal + gcal}
      <button class="btn ghost" data-copy="${esc(ics)}">Copiar enlace (Outlook y otros)</button></div>
      <p class="note" style="margin:0">El enlace es personal: no lo compartas.</p>`;
  const nt = Object.assign({ semanal: false, calle: false, lluvia: false, organizador: true, admin: true, quedadas: true, amigos: true, ideas: true }, me.notify || {});
  const box = (k, txt) => `<label class="toggle">${txt}<input type="checkbox" data-notify="${k}" ${nt[k] ? 'checked' : ''}></label>`;
  mail.hidden = false;
  mail.innerHTML = `<h2 style="margin:0">Avisos</h2>
      <h3 style="margin:0;font:600 14px var(--f-body)">En este dispositivo</h3>
      ${pushBlock()}
      <h3 style="margin:8px 0 0;font:600 14px var(--f-body)">Por correo</h3>
      <p class="note">Solo te escribimos si lo activas. Cada correo trae un enlace para darte de baja.</p>
      ${box('semanal', 'Resumen semanal: los planes de la semana elegidos según tus gustos (los jueves)')}
      ${box('calle', 'Cortes de calle: si hoy o mañana hay cortes junto a tus planes guardados o en tus calles (por la mañana)')}
      ${box('lluvia', 'Lluvia: si va a llover en un plan al aire libre que tienes guardado para hoy o mañana (por la mañana)')}
      ${box('quedadas', 'Quedadas: cuando alguien responde a un plan que has propuesto')}
      ${box('amigos', 'Amigos: cuando alguien quiere seguirte o acepta tu solicitud')}
      ${box('ideas', 'Ideas: cuando cambia el estado de una idea que propusiste')}
      ${me.role === 'editor' || me.role === 'admin' || me.editor_status ? box('organizador', 'Organizador: cuando revisamos tu solicitud o tus eventos') : ''}
      ${me.role === 'admin' ? box('admin', 'Admin: solicitudes y eventos pendientes de revisión') : ''}
      ${nt.semanal ? '<div class="seg"><button class="btn ghost" data-mail-test>Enviarme ahora un resumen de prueba</button></div>' : ''}`;
  org.hidden = false;
  if (!(me.role === 'editor' || me.role === 'admin')) {
    org.innerHTML = me.editor_status === 'solicitado'
      ? `<h2 style="margin:0">Organizadores</h2><p class="note">Hemos recibido tu solicitud para publicar eventos. En cuanto esté aprobada podrás crearlos desde aquí.</p>`
      : `<h2 style="margin:0">¿Organizas eventos?</h2><p class="note">Salas, asociaciones, librerías, clubes o particulares: publica tus eventos en Limón gratis. Revisamos cada solicitud.${me.editor_status === 'rechazado' ? ' Tu solicitud anterior no se aprobó; puedes volver a enviarla.' : ''}</p>
          <form class="form" id="ed-form"><label>Nombre del organizador<input class="search" name="nombre" required maxlength="120"></label><label>Web o redes<input class="search" name="web" maxlength="300"></label>
          <label class="full">Qué tipo de eventos organizas<textarea class="search" name="que" rows="3" maxlength="600" required></textarea></label>
          <p class="note full">Al solicitarlo aceptas las <a href="condiciones.html#organizadores">condiciones para organizadores</a>.</p><div class="seg full"><button class="btn" type="submit">Solicitar acceso de organizador</button><span class="note" id="ed-msg" role="status"></span></div></form>`;
  } else {
    org.innerHTML = `<div class="seg" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Mis eventos</h2>${orgEdit === null ? '<button class="btn" data-org-new>Nuevo evento</button>' : ''}</div>
        <p class="note">Lo que publiques sale en Limón con enlace a tu web en cuanto lo aprobemos. Revisamos cada evento, lo situamos en el mapa y le ponemos categorías.</p>
        ${orgEdit !== null ? subForm(mySubs.find(x => x.id === orgEdit)) : ''}
        <div>${mySubs.map(x => `<div class="row-item"><div style="min-width:0;flex:1"><b>${esc(x.title)}</b><div class="note">${esc(x.starts_on)}${x.ends_on !== x.starts_on ? ' → ' + esc(x.ends_on) : ''} · ${esc(x.venue_name || '')}${x.ai_review && x.ai_review.motivo && x.status !== 'publicado' ? ' · ' + esc(x.ai_review.motivo) : ''}</div></div>
          <div class="seg"><span class="badge ${x.status}">${ST[x.status] || x.status}</span><button class="act" data-org-edit="${x.id}">Editar</button>${x.status !== 'borrador' ? `<button class="act" data-org-retire="${x.id}">Retirar</button>` : ''}</div></div>`).join('') || (orgEdit === null ? '<p class="note">Aún no has publicado nada.</p>' : '')}</div>`;
  }
  adm.hidden = me.role !== 'admin';
  if (me.role === 'admin') {
    adm.innerHTML = `<h2 style="margin:0">Revisión (admin)</h2>
        <h3 style="margin:4px 0 0;font:600 14px var(--f-body)">Solicitudes de organizador (${admQueue.editors.length})</h3>
        ${admQueue.editors.map(p => { const o = p.organizer || {}; return `<div class="row-item"><div style="min-width:0;flex:1"><b>${esc(o.nombre || '')}</b> · ${esc(p.email || '')}<div class="note">${esc(o.que || '')}${o.web ? ' · ' + esc(o.web) : ''}</div></div>
          <div class="seg"><button class="act" data-adm-ed="${p.id}" data-ok="1">Aprobar</button><button class="act" data-adm-ed="${p.id}" data-ok="0">Rechazar</button></div></div>`; }).join('') || '<p class="note">Ninguna pendiente.</p>'}
        <h3 style="margin:8px 0 0;font:600 14px var(--f-body)">Eventos en revisión (${admQueue.events.length})</h3>
        ${admQueue.events.map(x => `<div class="row-item"><div style="min-width:0;flex:1"><b>${esc(x.title)}</b><div class="note">${esc(x.starts_on)} · ${esc(x.venue_name || '')} · ${esc(x.address || '')}${x.ai_review ? ' · IA: ' + (x.ai_review.ok ? 'bien' : esc(x.ai_review.motivo || 'dudas')) + (x.ai_review.sin_ubicacion ? ' · sin ubicar' : '') : ''}</div></div>
          <div class="seg"><button class="act" data-adm-pub="${x.id}" data-ok="1">Publicar</button><button class="act" data-adm-pub="${x.id}" data-ok="0">Rechazar</button></div></div>`).join('') || '<p class="note">Nada pendiente.</p>'}
        <h3 style="margin:8px 0 0;font:600 14px var(--f-body)">Ideas por revisar (${admQueue.ideas.length})</h3>
        ${admQueue.ideas.map(x => `<div class="row-item"><div style="min-width:0;flex:1"><b>${esc(x.title)}</b><div class="note">${esc(IKIND[x.kind] || x.kind)}${x.body ? ' · ' + esc(x.body) : ''}</div></div>
          <div class="seg"><button class="act" data-adm-idea="${x.id}" data-ok="1">Publicar</button><button class="act" data-adm-idea="${x.id}" data-ok="0">Ocultar</button></div></div>`).join('') || '<p class="note">Nada pendiente.</p>'}`;
  }
}
// los correos de la cola (organizadores, admins) salen en cuanto pasa algo; si falla, los manda la tarea diaria
function flushMail() { const db = window.limonDB; if (db) window.limonFn('limon-mail', { body: { action: 'flush' } }).catch(() => { }); }
async function onAccountClick(ev) {
  const db = window.limonDB;
  const t = ev.target;
  if (t.closest('[data-push-on]')) { pushOn(); return true; }
  if (t.closest('[data-push-off]')) { pushOff(); return true; }
  if (t.closest('[data-push-test]')) {
    const { data, error } = await window.limonFn('limon-push', { body: { action: 'test' } });
    toast(error ? 'No se ha podido enviar ahora.' : data && data.error ? data.error : data && data.sent ? 'Enviado: te llegará en unos segundos.' : 'No hay ningún dispositivo activo: vuelve a activar los avisos.'); return true;
  }
  if (t.closest('[data-org-new]')) { orgEdit = 'nuevo'; renderAccountExtras(); return true; }
  const ed = t.closest('[data-org-edit]'); if (ed) { orgEdit = +ed.dataset.orgEdit; renderAccountExtras(); $('org').scrollIntoView({ behavior: 'smooth' }); return true; }
  if (t.closest('[data-org-cancel]')) { orgEdit = null; renderAccountExtras(); return true; }
  const rt = t.closest('[data-org-retire]');
  if (rt) { await db.sb.from('submitted_events').update({ status: 'borrador' }).eq('id', +rt.dataset.orgRetire); toast('Retirado: deja de salir en Limón.'); loadMe(); return true; }
  const ae = t.closest('[data-adm-ed]');
  if (ae) { await db.sb.from('profiles').update({ editor_status: ae.dataset.ok === '1' ? 'aprobado' : 'rechazado' }).eq('id', ae.dataset.admEd); flushMail(); loadMe(); return true; }
  const ai = t.closest('[data-adm-idea]');
  if (ai) { const { error } = await db.sb.from('ideas').update({ status: ai.dataset.ok === '1' ? 'nueva' : 'oculta' }).eq('id', +ai.dataset.admIdea); toast(error ? 'No se ha podido: ' + error.message : (ai.dataset.ok === '1' ? 'Publicada en el tablón.' : 'Ocultada.')); flushMail(); loadMe(); if (IDEAS) loadIdeas(); return true; }
  const ap = t.closest('[data-adm-pub]');
  if (ap) { const { error } = await db.sb.rpc('publish_submission', { p_id: +ap.dataset.admPub, p_publish: ap.dataset.ok === '1' }); toast(error ? 'No se ha podido: ' + error.message : (ap.dataset.ok === '1' ? 'Publicado.' : 'Rechazado.')); flushMail(); loadMe(); return true; }
  if (t.closest('[data-mail-test]')) {
    const b = t.closest('[data-mail-test]'); b.disabled = true; const r = await db.fn('limon-mail', { action: 'weekly' }); b.disabled = false;
    toast(r.error ? r.error : r.sent ? 'Enviado: mira tu correo.' : 'No hay planes que encajen esta semana: prueba a marcar intereses.'); return true;
  }
  const cp = t.closest('[data-copy]');
  if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Enlace copiado. En tu calendario, busca «Añadir calendario desde URL» (o «suscribirse») y pégalo.'); } catch (e) { prompt('Copia este enlace:', cp.dataset.copy); } return true; }
  return false;
}
