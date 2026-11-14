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

// avisos que calcula la propia app (también sin cuenta): cortes de hoy y mañana en tus calles o líneas. Antes eran un aviso
// grande en Para ti; ahora van a la campana. Lo visto se recuerda en este dispositivo.
function avisosLocales() {
  if (typeof streets === 'undefined' || !streets.length || typeof cutsOn !== 'function' || !CLOSURES.length) return [];
  let vistos = {}; try { vistos = JSON.parse(localStorage.getItem('limon_avisos_vistos') || '{}'); } catch (e) { }
  const out = [];
  for (const x of caDays().filter(x => x.id !== 'otro')) {
    const mios = cutsOn(x.d).filter(y => y.mine);
    if (!mios.length) continue;
    const id = 'calle-' + ymd(x.d) + '-' + mios.length;
    if (!vistos[id]) { vistos[id] = { t: new Date().toISOString() }; try { localStorage.setItem('limon_avisos_vistos', JSON.stringify(vistos)); } catch (e) { } }
    out.push({ id, local: true, kind: 'calle', dia: x.id, created_at: vistos[id].t, read_at: vistos[id].leido || null,
      title: `${x.label}: ${mios.length} ${mios.length === 1 ? 'aviso' : 'avisos'} en tus calles o líneas`,
      body: mios.slice(0, 3).map(y => y.c.title).join(' · ') });
  }
  return out;
}
function leeLocales() {
  try {
    const v = JSON.parse(localStorage.getItem('limon_avisos_vistos') || '{}'), hoy = ymd(today);
    for (const k of Object.keys(v)) { if (k.slice(6, 16) < hoy) delete v[k]; else v[k].leido = v[k].leido || new Date().toISOString(); }
    localStorage.setItem('limon_avisos_vistos', JSON.stringify(v));
  } catch (e) { }
}
function todas() { return avisosLocales().concat(NOTIS).sort((a, b) => (b.created_at > a.created_at ? 1 : -1)); }

function pintaCampana() {
  const b = $('bell'); if (!b) return;
  const n = todas().filter(x => !x.read_at).length;
  b.querySelector('.dot').hidden = !n;
  b.setAttribute('aria-label', n ? `Avisos: ${n} sin leer` : 'Avisos');
}

function enlaceNoti(x) {
  if (x.local) return `data-goto="calle" data-caday-go="${esc(x.dia)}" href="?tab=calle"`;
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
  const lista = (xs) => `<ul class="notis">${xs.map(x => `<li class="${x.read_at ? '' : 'nueva'}"><a ${enlaceNoti(x)}>
      <span class="ico" aria-hidden="true">${NOTI_ICO[x.kind] || '🔔'}</span>
      <span class="txt"><b>${esc(x.title)}</b>${x.body ? `<span>${esc(x.body)}</span>` : ''}<time datetime="${esc(x.created_at)}">${haceCuanto(x.created_at)}</time></span></a></li>`).join('')}</ul>`;
  const locales = avisosLocales();
  if (!u) return cab + (locales.length ? lista(locales) : '') + `<div class="notivacia"><p>Con una cuenta te avisamos aquí de lo que te importa: quién empieza a seguirte, a qué planes se apuntan tus amigos,
    planes nuevos de las salas que sigues, cortes en tus calles y lluvia en tus planes.</p>
    <div class="seg"><button class="btn" data-goto="intereses">Entrar o crear cuenta</button></div>
    <p class="note">¿Sin cuenta? En la página de cada sala de limonplanes.com puedes pedir que te avisemos por correo de sus planes nuevos.</p></div>`;
  const push = typeof pushOk === 'function' && pushOk() && !(typeof pushSub !== 'undefined' && pushSub)
    ? `<p class="note notipush">¿Quieres recibirlos también en el móvil? <button class="btnlink" data-goto="intereses">Activa los avisos en Perfil</button></p>` : '';
  if (!NOTIS.length && !locales.length) return cab + push + `<div class="notivacia"><p>Aún no tienes avisos.</p><p class="note">Aquí aparecerán quién empieza a seguirte, a qué planes se apuntan
    las personas que sigues, planes nuevos de las salas que sigues, cortes en tus calles y lluvia en tus planes guardados.</p></div>`;
  return cab + push + lista(todas());
}

async function abreCampana() {
  openSheet(panelCampana());
  leeLocales();
  await loadNotis(true);
  if ($('sheet').open) $('sheet-body').innerHTML = panelCampana();
  pintaCampana();
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
  if (ev.target.closest('#sheet-body [data-goto]') && $('sheet-body').querySelector('.notis, .notivacia')) closeSheets();  // y sigue clicGoto (o el día de Calle)
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
