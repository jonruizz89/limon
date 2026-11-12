// Limón · la campana: bandeja de avisos de la cuenta, del más nuevo al más antiguo (los guarda el servidor 30 días).
// Llegan aquí los mismos avisos que al móvil o al correo (quedadas, amigos, cortes, lluvia, «¿fuiste?», ideas, organizador)
// y además: alguien a quien sigues se apunta a un plan, y planes nuevos de las salas y ciclos que sigues.

let NOTIS = [], notisAt = 0;
const NOTI_ICO = { follow: '👤', follow_ok: '🤝', amigo_plan: '👥', rsvp: '🙋', calle: '🚧', lluvia: '🌧️', fuiste: '✅', novedades: '🆕',
  idea_status: '💡', org_editor: '📣', org_event: '📣', admin_idea: '🛠️', admin_signup: '🛠️', admin_editor: '🛠️', admin_event: '🛠️' };

function haceCuanto(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 2 * 86400) return 'ayer';
  if (s < 7 * 86400) return `hace ${Math.round(s / 86400)} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

async function loadNotis(force) {
  const db = window.limonDB, u = db && db.user();
  if (!u) { NOTIS = []; pintaCampana(); return; }
  if (!force && Date.now() - notisAt < 60e3) return;
  notisAt = Date.now();
  const { data } = await db.sb.from('notifications').select('id,kind,title,body,url,created_at,read_at').order('created_at', { ascending: false }).limit(60);
  NOTIS = data || [];
  pintaCampana();
}

function pintaCampana() {
  const b = $('bell'); if (!b) return;
  const n = NOTIS.filter(x => !x.read_at).length;
  b.querySelector('.dot').hidden = !n;
  b.setAttribute('aria-label', n ? `Avisos: ${n} sin leer` : 'Avisos');
}

function enlaceNoti(x) {
  const u = x.url || '';
  const ev = u.match(/[?&]ev=(e\d+)/);
  if (ev) return `data-goev="${esc(ev[1])}" href="${esc(u)}"`;
  const tab = u.match(/^\?tab=(\w+)$/);
  if (tab) return `data-goto="${esc(tab[1])}" href="${esc(u)}"`;
  return `href="${esc(u || './')}"`;
}

function panelCampana() {
  const db = window.limonDB, u = db && db.user();
  const cab = '<div class="sheethead"><h2>Avisos</h2><button class="x" data-sheet-close aria-label="Cerrar">✕</button></div>';
  if (!u) return cab + `<div class="notivacia"><p>Con una cuenta te avisamos aquí de lo que te importa: quién empieza a seguirte, a qué planes se apuntan tus amigos,
    planes nuevos de las salas que sigues, cortes en tus calles y lluvia en tus planes.</p>
    <div class="seg"><button class="btn" data-goto="intereses">Entrar o crear cuenta</button></div>
    <p class="note">¿Sin cuenta? En la página de cada sala de limonplanes.com puedes pedir que te avisemos por correo de sus planes nuevos.</p></div>`;
  const push = typeof pushOk === 'function' && pushOk() && !(typeof pushSub !== 'undefined' && pushSub)
    ? `<p class="note notipush">¿Quieres recibirlos también en el móvil? <button class="btnlink" data-goto="intereses">Activa los avisos en Perfil</button></p>` : '';
  if (!NOTIS.length) return cab + push + `<div class="notivacia"><p>Aún no tienes avisos.</p><p class="note">Aquí aparecerán quién empieza a seguirte, a qué planes se apuntan
    las personas que sigues, planes nuevos de las salas que sigues, cortes en tus calles y lluvia en tus planes guardados.</p></div>`;
  return cab + push + `<ul class="notis">${NOTIS.map(x => `<li class="${x.read_at ? '' : 'nueva'}"><a ${enlaceNoti(x)}>
      <span class="ico" aria-hidden="true">${NOTI_ICO[x.kind] || '🔔'}</span>
      <span class="txt"><b>${esc(x.title)}</b>${x.body ? `<span>${esc(x.body)}</span>` : ''}<time datetime="${esc(x.created_at)}">${haceCuanto(x.created_at)}</time></span></a></li>`).join('')}</ul>`;
}

async function abreCampana() {
  openSheet(panelCampana());
  await loadNotis(true);
  if ($('sheet').open) $('sheet-body').innerHTML = panelCampana();
  if (NOTIS.some(x => !x.read_at)) {
    const db = window.limonDB;
    await db.sb.rpc('notif_leidas');
    const ahora = new Date().toISOString();
    NOTIS.forEach(x => { x.read_at = x.read_at || ahora; });
    pintaCampana();  // en el panel siguen resaltadas las que eran nuevas hasta que se cierra
  }
}

// ---------- clics
function clicCampana(ev) {
  if (ev.target.closest('#bell')) { abreCampana(); return true; }
  if (ev.target.closest('#sheet-body [data-goto]') && $('sheet-body').querySelector('.notis, .notivacia')) closeSheets();  // y sigue clicGoto
  const a = ev.target.closest('.notis a');
  if (a && !a.dataset.goev && !a.dataset.goto) { closeSheets(); return false; }  // enlace normal: lo sigue el navegador
  if (a && a.dataset.goev && typeof BYID !== 'undefined' && !BYID[a.dataset.goev]) { ev.preventDefault(); location.href = a.getAttribute('href'); return true; }
  return false;
}

// ---------- arranque: se miran al entrar, al volver a la app y cada 5 minutos con la app abierta
function iniciaCampana() {
  loadNotis(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadNotis(); });
  setInterval(() => { if (document.visibilityState === 'visible') loadNotis(true); }, 5 * 60e3);
}
