// Flujos de la app en un navegador de verdad (Playwright), en móvil y en escritorio.
// Uso: node engine/tests/flujos.mjs http://localhost:8080   (la web servida tal cual; no hacen falta los datos de producción)
//
// Los planes son de prueba (datos.mjs) y el reloj está parado en un sábado de diciembre, así que el resultado no depende del día.
// No se llama a Supabase ni a servicios de fuera: lo que la app les pida se corta o se contesta desde aquí.
process.env.TZ = 'Europe/Madrid';
import { chromium, devices } from 'playwright';
import { AHORA, MADRID, BARCELONA, archivos } from './datos.mjs';

const BASE = process.argv[2] || 'http://localhost:8080';
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); console.log((cond ? '✓ ' : '✗ ') + msg); return !!cond; };
const igual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// lo que devolvería Supabase para una zona (misma forma que desdeCompacto en web/data.js)
const filas = (zona, lista) => lista.map((r) => ({
  id: r.i, city_id: zona, title: r.t, description: r.de, starts_on: r.s, ends_on: r.f, time_text: r.h, district: null, price_text: r.p || null, is_free: !!r.g,
  image_url: null, organizer_url: null, is_unique: false, is_featured: false, ai_unique: false, topics: [], series: null, lat: null, lng: null, first_seen_at: null,
  venues: { name: r.v, address: null }, event_sessions: (r.ss || []).map((d) => ({ on_date: d })), event_categories: r.c.map((c) => ({ category_id: c })),
  event_sources: [{ url: r.fu[0][1], sources: { name: 'Fuente de prueba' } }]
}));

const PERFILES = [
  ['móvil', { ...devices['Pixel 7'] }],
  ['escritorio', { viewport: { width: 1440, height: 900 } }]
];

// Abre la app con los datos de prueba. sinArchivo: zonas cuyo archivo de planes «falta»; supabase: 'cortado' o 'responde'
async function abrir(b, perfil, { sinArchivo = [], supabase = 'cortado', url = '/?c=madrid' } = {}) {
  const ctx = await b.newContext({ ...perfil, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(m.text()); });
  await p.clock.setFixedTime(new Date(AHORA));
  const A = archivos();
  const estado = { sinArchivo: new Set(sinArchivo), supabase };
  await p.route(/\/datos\/[^?]+/, (r) => {
    const n = r.request().url().match(/\/datos\/([^?]+)/)[1], zona = (n.match(/^eventos-(.+)\.json$/) || [])[1];
    if (!A[n] || estado.sinArchivo.has(zona)) return r.fulfill({ status: 404, body: 'no existe' });
    return r.fulfill({ json: A[n] });
  });
  await p.route(/supabase\.co/, (r) => {
    const u = new URL(r.request().url());
    if (estado.supabase === 'responde' && u.pathname.endsWith('/rest/v1/events')) {
      const zona = /barcelona/.test(u.search) ? 'barcelona' : 'madrid';
      return r.fulfill({ json: filas(zona, zona === 'barcelona' ? BARCELONA : MADRID), headers: { 'access-control-allow-origin': '*' } });
    }
    return r.abort();
  });
  await p.route(/open-meteo|tile\.|cartocdn|openstreetmap|googletagmanager|plausible/, (r) => r.abort());
  await p.goto(BASE + url);
  return { ctx, p, errores, estado };
}
const planes = (p, vista) => p.locator(`#v-${vista} article.card [data-save]`).evaluateAll((x) => x.map((e) => +e.dataset.save.replace(/^e/, '')));
const ir = async (p, tab) => { await p.locator(`a[href="?tab=${tab}"]:visible`).first().click(); await p.waitForTimeout(250); };
const cargada = (p) => p.waitForSelector('#v-parati article.card', { timeout: 20000 }).then(() => true, () => false);
const dia = (p, n) => p.locator('#sheet [data-cald]:not([disabled])').filter({ hasText: new RegExp(`^${n}$`) }).first().click();
const aviso = (p) => p.locator('#toast-t').textContent();

const b = await chromium.launch();
try {
  for (const [nombre, perfil] of PERFILES) {
    console.log(`\n— ${nombre} —`);
    const T = (msg) => `${nombre}: ${msg}`;

    // ───────── arranque: los planes de hoy que ya han pasado no salen
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      if (ok(await cargada(p), T('«Para ti» muestra planes'))) {
        const pt = await planes(p, 'parati');
        ok(!pt.includes(103) && pt.includes(102) && pt.includes(114), T('hoy no sale la charla de las 9:00 (ya ha pasado) y sí los conciertos de la noche'));
        await ir(p, 'explorar');
        const ex = await planes(p, 'explorar');
        ok(igual(ex, [101, 102, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114]), T(`«Explorar» enseña los 13 planes de los próximos 30 días (${ex.length})`));
        const d12 = ex.filter((i) => [104, 102, 114].includes(i));
        ok(igual(d12, [104, 102, 114]) && ex.indexOf(104) < ex.indexOf(102) && ex.indexOf(102) < ex.indexOf(114), T('los de hoy, por hora: 20:00, 21:00, 22:30'));
      }
      ok(errores.length === 0, T(`arranque sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── cambiar de zona
    {
      const { ctx, p, errores, estado } = await abrir(b, perfil);
      await cargada(p);
      await p.click('#city-btn');
      await p.fill('#zone-q', 'barce');
      await p.click('#zone-list [data-zone-v="barcelona"]');
      await p.waitForSelector('#v-parati article.card [data-save="e201"]', { timeout: 20000 }).catch(() => { });
      ok(igual(await planes(p, 'parati'), [201, 202, 203, 204]) && /Barcelona/.test(await p.textContent('#city-btn')), T('cambiar a Barcelona enseña los planes de Barcelona'));
      await p.reload(); await cargada(p);
      ok(/Barcelona/.test(await p.textContent('#city-btn')), T('la zona elegida se recuerda al recargar'));

      // falta el archivo de planes de Madrid, pero la base de datos responde: se cambia igual y se lee de ella
      estado.sinArchivo.add('madrid'); estado.supabase = 'responde';
      await p.click('#city-btn');
      await p.click('#zone-list [data-zone-v="madrid"]');
      await p.waitForSelector('#v-parati article.card [data-save="e104"]', { timeout: 20000 }).catch(() => { });
      const pt = await planes(p, 'parati');
      ok(pt.includes(104) && !pt.includes(201) && /Madrid/.test(await p.textContent('#city-btn')), T('sin archivo de planes, la zona se carga desde la base de datos'));
      ok(errores.length === 0, T(`cambio de zona sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));

      // falta el archivo y la base de datos tampoco responde: aviso y botón para volver a la zona anterior
      estado.sinArchivo.add('barcelona'); estado.sinArchivo.delete('madrid'); estado.supabase = 'cortado';
      await p.click('#city-btn');
      await p.click('#zone-list [data-zone-v="barcelona"]');
      const volver = p.getByRole('button', { name: 'Volver a la zona anterior' });
      await volver.waitFor({ timeout: 20000 }).catch(() => { });
      ok(/No se han podido cargar los planes/.test(await p.textContent('#pt-h')) && await volver.isVisible().catch(() => false), T('sin archivo ni base de datos: avisa y ofrece volver a la zona anterior'));
      await volver.click().catch(() => { });
      await p.waitForSelector('#v-parati article.card [data-save="e104"]', { timeout: 20000 }).catch(() => { });
      ok((await planes(p, 'parati')).includes(104) && /Madrid/.test(await p.textContent('#city-btn')), T('«Volver a la zona anterior» recupera Madrid'));
      await ctx.close();
    }

    // ───────── agenda: guardar, deshacer, quitar, deshacer
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      await ir(p, 'explorar');
      const n = async () => (await p.textContent('#n-agenda')).trim();
      const boton = (id) => p.locator(`#v-explorar [data-save="e${id}"]`);
      await boton(104).click();
      ok(await n() === '1' && await boton(104).getAttribute('aria-pressed') === 'true', T('guardar un plan pone la agenda a 1'));
      await boton(102).click();
      ok(await n() === '2' && /Guardado en tu agenda/.test(await aviso(p)), T('guardar otro: agenda a 2 y aviso «Guardado en tu agenda»'));
      await p.click('#toast-undo');
      ok(await n() === '1' && await boton(102).getAttribute('aria-pressed') === 'false', T('«Deshacer» tras guardar lo quita'));
      await boton(104).click();
      ok(['', '0'].includes(await n()) && /Quitado de tu agenda/.test(await aviso(p)), T('quitar un plan guardado: agenda vacía y aviso «Quitado de tu agenda»'));
      await p.click('#toast-undo');
      ok(await n() === '1' && await boton(104).getAttribute('aria-pressed') === 'true', T('«Deshacer» tras quitar lo devuelve'));
      await ir(p, 'agenda');
      ok(igual(await p.locator('#ag-list article.card [data-save]').evaluateAll((x) => x.map((e) => e.dataset.save)), ['e104']), T('el plan guardado sale en la Agenda'));
      await p.reload();
      await p.waitForSelector('#ag-list article.card', { timeout: 20000 }).catch(() => { });
      ok(await n() === '1' && await p.locator('#ag-list article.card').count() === 1, T('la agenda sigue tras recargar'));
      await p.locator('#ag-list [data-save="e104"]').click();
      ok(await p.locator('#ag-list article.card').count() === 0, T('quitar desde la Agenda la deja vacía'));
      ok(errores.length === 0, T(`agenda sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── calendario de fechas en Para ti, Explorar y Calle
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      const rotulo = async (v) => (await p.locator(`#v-${v} [data-cuando] span`).first().textContent()).trim();
      ok(await rotulo('parati') === 'Esta semana', T('Para ti empieza en «Esta semana»'));
      const dentro = (lista, posibles) => lista.length > 0 && lista.every((i) => posibles.includes(i));
      ok(dentro(await planes(p, 'parati'), [101, 102, 104, 105, 106, 107, 108, 109, 112, 113, 114]), T('…con planes del sábado 12 al domingo 20 (en sábado, «esta semana» llega al domingo siguiente)'));

      // Para ti → Mañana
      await p.click('#v-parati [data-cuando]');
      await p.click('#sheet [data-calq="manana"]');
      let pt = await planes(p, 'parati');
      ok(await rotulo('parati') === 'Mañana' && pt.includes(104) && dentro(pt, [101, 104, 105, 106]), T(`Para ti · «Mañana» enseña solo planes del domingo 13 (${pt})`));
      // Para ti → un día suelto del mes siguiente
      await p.click('#v-parati [data-cuando]');
      await p.click('#sheet [data-calm="1"]');
      await dia(p, 5);
      await p.click('#sheet [data-calok]');
      pt = await planes(p, 'parati');
      ok(await rotulo('parati') === '5 ene' && pt.includes(110) && dentro(pt, [105, 110]), T(`Para ti · elegir el 5 de enero en el calendario enseña la cabalgata (${pt})`));
      // el calendario no deja elegir días pasados
      await p.click('#v-parati [data-cuando]');
      await p.click('#sheet [data-calm="-1"]').catch(() => { });
      const ayer = p.locator('#sheet [data-cald]').filter({ hasText: /^11$/ }).first();
      ok(await ayer.isDisabled(), T('el calendario no deja elegir un día que ya ha pasado'));
      await p.click('#sheet [data-sheet-close]').catch(() => p.keyboard.press('Escape'));

      // Explorar → del 14 al 16
      await ir(p, 'explorar');
      ok(await rotulo('explorar') === 'Próximos 30 días', T('Explorar empieza en «Próximos 30 días»'));
      await p.click('#v-explorar [data-cuando]');
      await dia(p, 14); await dia(p, 16);
      ok(/Ver 5 planes/.test(await p.textContent('#sheet [data-calok]')), T(`el botón del calendario cuenta los planes de esos días (${(await p.textContent('#sheet [data-calok]')).trim()})`));
      await p.click('#sheet [data-calok]');
      let ex = await planes(p, 'explorar');
      ok(await rotulo('explorar') === '14–16 dic' && igual(ex, [101, 105, 107, 108, 112]), T(`Explorar · del 14 al 16 de diciembre: los planes de esos días y nada más (${ex})`));
      // Explorar → Hoy
      await p.click('#v-explorar [data-cuando]');
      await p.click('#sheet [data-calq="hoy"]');
      ex = await planes(p, 'explorar');
      ok(await rotulo('explorar') === 'Hoy' && igual(ex, [101, 102, 104, 105, 114]), T(`Explorar · «Hoy»: sin la charla de las 9:00, que ya ha pasado (${ex})`));

      // Calle → hoy hay un aviso; el domingo 20, otro
      await ir(p, 'calle');
      await p.waitForTimeout(300);
      const avisos = () => p.locator('#ca-list').innerText();
      ok(/calle de Alcalá/.test(await avisos()) && !/Castellana/.test(await avisos()), T('Calle · hoy sale la obra de Alcalá y no el corte del día 20'));
      await p.click('#ca-days [data-cuando]');
      await dia(p, 20);
      await p.waitForTimeout(300);
      ok(/Castellana/.test(await avisos()) && !/calle de Alcalá/.test(await avisos()), T('Calle · elegir el 20 en el calendario enseña el corte de la Castellana'));
      ok(/20/.test(await p.textContent('#ca-count')), T(`Calle · el rótulo dice el día elegido (${(await p.textContent('#ca-count')).trim()})`));
      await p.click('#ca-days [data-caday="hoy"]');
      ok(/calle de Alcalá/.test(await avisos()), T('Calle · «Hoy» vuelve a los avisos de hoy'));
      ok(errores.length === 0, T(`calendario sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── enlace propio de un plan (?ev=) y botón atrás
    {
      const { ctx, p, errores } = await abrir(b, perfil, { url: '/?c=madrid&ev=e110' });
      await p.waitForSelector('article.card[data-eid="e110"]', { timeout: 20000 }).catch(() => { });
      const ficha = (v, id) => p.locator(`#v-${v} article.card[data-eid="e${id}"] .more`).first().isVisible().catch(() => false);
      ok(await p.locator('article.card[data-eid="e110"] .more:visible').count() > 0, T('abrir ?ev= enseña ese plan con la ficha abierta (aunque no sea de esta semana)'));
      ok(!/[?&]ev=/.test(p.url()), T(`la dirección se queda limpia tras abrir el enlace (${p.url().replace(BASE, '')})`));
      // un enlace a un plan que ya no existe abre la app normal
      await p.goto(BASE + '/?c=madrid&ev=e999999');
      const hay = await p.waitForSelector('article.card', { timeout: 20000 }).then(() => true, () => false);
      ok(hay && await p.locator('article.card .more:visible').count() === 0, T('un ?ev= de un plan que ya no existe abre la app sin ficha y sin romperse'));

      // abrir una ficha pone su enlace en la barra; atrás la cierra sin salir de la app
      await ir(p, 'explorar');
      await p.locator('#v-explorar [data-open="e104"]').click();
      await p.waitForTimeout(250);
      ok(await ficha('explorar', 104) && /[?&]ev=e104/.test(p.url()) && /[?&]c=madrid/.test(p.url()), T(`abrir una ficha pone su enlace en la barra (${p.url().replace(BASE, '')})`));
      await p.locator('#v-explorar [data-open="e102"]').click();
      await p.waitForTimeout(250);
      ok(await ficha('explorar', 102) && /[?&]ev=e102/.test(p.url()), T('abrir otra ficha cambia el enlace'));
      await p.goBack();
      await p.waitForTimeout(350);
      ok(!(await ficha('explorar', 102)) && !/[?&]ev=/.test(p.url()) && p.url().startsWith(BASE) && await p.locator('#v-explorar article.card').count() > 0,
        T('el botón atrás cierra la ficha y deja la app en Explorar'));
      // cerrar la ficha tocándola otra vez también quita el enlace
      await p.locator('#v-explorar [data-open="e113"]').click(); await p.waitForTimeout(250);
      const abierta = await ficha('explorar', 113) && /[?&]ev=e113/.test(p.url());
      await p.locator('#v-explorar [data-open="e113"]').click(); await p.waitForTimeout(350);
      ok(abierta && !(await ficha('explorar', 113)) && !/[?&]ev=/.test(p.url()), T('cerrar la ficha tocándola otra vez quita su enlace de la barra'));
      ok(errores.length === 0, T(`enlace de plan sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── botón Navidad
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      const boton = (v) => p.locator(`#v-${v} [data-ftemp]`);
      ok(await boton('parati').isVisible() && /Navidad/.test(await boton('parati').textContent()), T('en diciembre sale el botón «🎄 Navidad» en Para ti'));
      await ir(p, 'explorar');
      ok(await boton('explorar').isVisible(), T('…y en Explorar'));
      await boton('explorar').click();
      await p.waitForTimeout(250);
      const ex = await planes(p, 'explorar');
      ok(igual(ex, [101, 110]) && await boton('explorar').getAttribute('aria-pressed') === 'true',
        T(`Navidad en Explorar: el mercado y la cabalgata; ni «Navider» ni «Belén Aguilera» (${ex})`));
      await ir(p, 'parati');
      const pt = await planes(p, 'parati');
      ok(igual(pt, [101]) && await boton('parati').getAttribute('aria-pressed') === 'true', T(`el filtro vale también en Para ti: esta semana, el mercado (${pt})`));
      await boton('parati').click();
      await p.waitForTimeout(250);
      ok((await planes(p, 'parati')).includes(102) && await boton('parati').getAttribute('aria-pressed') === 'false', T('volver a tocarlo quita el filtro'));
      ok(errores.length === 0, T(`Navidad sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── «Elegidos para ti» con un plan que ya no cae en las fechas (rompía la lista y las fichas no se abrían)
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      await p.evaluate(() => { logged = true; prefs.pop = 1; aiReco.semana = { planes: [{ id: 104, por_que: 'Te gusta el pop' }, { id: 103, por_que: 'Ya pasó' }, { id: 110, por_que: 'Otro mes' }], candidatos: 9 }; renderAll(); });
      await p.waitForTimeout(250);
      const ai = await p.locator('#pt-list .ai article.card').evaluateAll((x) => x.map((e) => e.dataset.eid));
      ok(igual(ai, ['e104']), T(`«Elegidos para ti» quita los planes que ya no caen en estas fechas (${ai})`));
      await p.locator('#pt-list .ai article.card[data-eid="e104"] [data-open]').first().click();
      await p.waitForTimeout(250);
      ok(await p.locator('#pt-list article.card.abierta[data-eid="e104"]').count() > 0, T('…y su ficha se abre'));
      ok(errores.length === 0, T(`«Elegidos para ti» sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── ficha: Compartir abre el menú con «Proponer a amigos»; el logo vuelve al inicio
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      await p.evaluate(() => { logged = true; });
      await ir(p, 'explorar');
      await p.locator('#v-explorar [data-open="e104"]').click();
      await p.waitForTimeout(250);
      await p.locator('#v-explorar article.card.abierta .acts [data-sharev]').click();
      await p.waitForTimeout(300);
      const menu = await p.locator('#sheet').evaluate((d) => d.open).catch(() => false);
      ok(menu && await p.locator('#sheet [data-share-ya]').count() === 1 && await p.locator('#sheet [data-invite]').count() === 1, T('Compartir en la ficha abre el menú: compartir el plan o proponerlo a amigos'));
      ok(await p.locator('#v-explorar article.card.abierta .acts [data-invite], #v-explorar article.card.abierta .acts [data-went]').count() === 0, T('la ficha ya no lleva «Proponer plan» ni «Ya fui» sueltos'));
      await p.locator('#sheet [data-invite]').click();
      await p.waitForTimeout(400);
      ok(await p.locator('[data-invite-form="e104"]').count() === 1 && await p.locator('#v-explorar article.card.abierta[data-eid="e104"]').count() === 1, T('«Proponer a amigos» abre el formulario sin cerrar la ficha'));
      await p.locator('a.home').first().click();
      await p.waitForTimeout(400);
      ok(await p.locator('#v-parati').isVisible() && await p.locator('article.card.abierta:visible').count() === 0 && !/[?&]ev=/.test(p.url()), T('el logo lleva al inicio: Para ti, sin fichas abiertas y con la dirección limpia'));
      ok(errores.length === 0, T(`ficha y logo sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── campana de avisos
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      await p.locator('#bell').click();
      await p.waitForTimeout(300);
      ok(/Con una cuenta te avisamos/.test(await p.locator('#sheet').innerText().catch(() => '')), T('sin cuenta, la campana explica qué avisos recibirías'));
      await p.locator('#sheet [data-sheet-close]').click().catch(() => p.keyboard.press('Escape'));
      await p.waitForTimeout(400);
      await p.evaluate(() => {
        window.limonDB.user = () => ({ id: 'x' });
        const t = Date.now();
        NOTIS = [{ id: 1, kind: 'amigo_plan', title: 'Ane se apunta a un plan', body: 'Concierto', url: '?ev=e104', created_at: new Date(t - 6e5).toISOString() },
          { id: 2, kind: 'calle', title: 'Cortes en tus calles', body: 'Gran Vía', url: '?tab=calle', created_at: new Date(t - 9e7).toISOString(), read_at: 'x' }];
        pintaCampana(); openSheet(panelCampana());
      });
      await p.waitForTimeout(300);
      ok(await p.locator('#bell .dot').isVisible() && await p.locator('#sheet .notis li').count() === 2 && await p.locator('#sheet .notis li.nueva').count() === 1,
        T('con avisos: punto rojo y la lista, con los nuevos resaltados'));
      await p.locator('#sheet .notis a[data-goev="e104"]').click();
      await p.waitForTimeout(400);
      ok(await p.locator('article.card.abierta[data-eid="e104"]').count() > 0, T('tocar un aviso abre su plan'));
      ok(errores.length === 0, T(`campana sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }

    // ───────── «¿Al final fuiste?» → estrellas → aprende gustos
    {
      const { ctx, p, errores } = await abrir(b, perfil);
      await cargada(p);
      await p.evaluate(() => { PAST.e999 = { id: 'e999', titulo: 'Concierto de ayer', fecha: ymd(addDays(today, -1)), lugar: 'Sala de prueba', cats: ['rock'], temas: [], serie: null }; renderParaTi(); });
      await p.waitForTimeout(200);
      await p.locator('[data-fui="si"][data-id="e999"]').click();
      await p.waitForTimeout(300);
      ok(await p.locator('.consent [data-rate="e999"]').count() === 5, T('tras «Sí, fui» la misma tarjeta pide la nota con 5 estrellas'));
      await p.locator('.consent [data-rate="e999"][data-n="5"]').click();
      await p.waitForTimeout(400);
      const l = await p.evaluate(() => ({ cat: learned['cat:rock'] || 0, sala: learned['sala:' + nf('Sala de prueba')] || 0 }));
      ok(l.cat > 1 && l.sala > 0 && await p.locator('.consent [data-rate="e999"]').count() === 0, T(`5 ★ suben la categoría y la sala (${JSON.stringify(l)}) y la tarjeta se cierra`));
      await p.evaluate(() => notaAprende(PAST.e999, 5, 1));
      const k = await p.evaluate(() => ({ sala: learned['sala:' + nf('Sala de prueba')] || 0, titulo: learned['titulo:' + nf('Concierto de ayer')] || 0 }));
      ok(k.sala < 0 && k.titulo <= -3, T(`cambiar a 1 ★ deshace la nota anterior y no vuelve a recomendar ese evento (${JSON.stringify(k)})`));
      ok(errores.length === 0, T(`valoración sin errores de consola${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`));
      await ctx.close();
    }
  }
} finally {
  await b.close();
}
if (fallos.length) {
  console.log(`\n${fallos.length} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nTodo bien');
