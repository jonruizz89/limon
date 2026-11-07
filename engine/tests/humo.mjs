// Prueba de humo de la app: abre Limón como un visitante en móvil y comprueba lo básico.
// Uso: node engine/tests/humo.mjs http://localhost:8080   (la web servida con los datos de producción en web/datos)
import { chromium, devices } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8080';
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); console.log((cond ? '✓ ' : '✗ ') + msg); };

const b = await chromium.launch();
try {
  for (const zona of ['madrid', 'barcelona', 'bizkaia']) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'es-ES' });
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(m.text()); });
    const t0 = Date.now();
    await p.goto(`${BASE}/?c=${zona}`);
    const carga = await p.waitForSelector('#v-parati article.card', { timeout: 30000 }).then(() => true, () => false);
    ok(carga, `${zona}: «Para ti» muestra planes (${Date.now() - t0} ms)`);
    if (!carga) { await ctx.close(); continue; }

    await p.click('[data-bnav="explorar"]');
    await p.fill('#q-global', 'concierto');
    await p.waitForTimeout(600);
    const nres = await p.locator('#v-explorar article.card').count();
    ok(nres > 0, `${zona}: buscar «concierto» da resultados (${nres})`);
    await p.fill('#q-global', '');
    await p.waitForTimeout(400);

    const primero = p.locator('#v-explorar [data-open]').first();
    await primero.click();
    await p.waitForTimeout(300);
    ok(await p.locator('#v-explorar .more').first().isVisible().catch(() => false), `${zona}: se abre la ficha de un plan`);

    if (zona === 'madrid') {
      const guardar = p.locator('#v-explorar [data-save]').first();
      await guardar.click();
      await p.waitForTimeout(400);
      const n1 = (await p.textContent('#n-agenda')).trim();
      ok(n1 === '1', `guardar un plan pone la agenda a 1 (${n1 || 'vacío'})`);
      await p.reload();
      // vuelve a la última pestaña abierta; se espera sondeando (la CSP de la app no deja usar waitForFunction)
      for (let i = 0; i < 60 && !(await p.locator('article.card').count()); i++) await p.waitForTimeout(500);
      const n2 = (await p.textContent('#n-agenda')).trim();
      ok(n2 === '1', `la agenda sigue tras recargar (${n2 || 'vacío'})`);
      await p.click('[data-bnav="agenda"]');
      await p.waitForTimeout(300);
      ok(await p.locator('#ag-list article.card').count() === 1, 'el plan guardado aparece en la Agenda');
    }
    ok(errores.length === 0, `${zona}: sin errores de JavaScript${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
} finally {
  await b.close();
}
if (fallos.length) {
  console.log(`\n${fallos.length} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nTodo bien');
