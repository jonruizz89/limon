// Carga los archivos de web/js en un contexto aislado de Node, con el reloj parado en el momento que diga la prueba.
// Los archivos por tema solo declaran funciones y valores (lo que se ejecuta al arrancar está en inicio.js), así que se pueden
// cargar sin navegador. De inicio.js se toman, tal cual, las líneas que calculan «hoy» y la temporada.
process.env.TZ = 'Europe/Madrid';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const JS = path.join(RAIZ, 'web/js');
const TEMAS = ['base', 'calendario', 'filtros', 'temporadas', 'tarjetas', 'compartir', 'calle'];
const DE_INICIO = [/^const today = .*$/m, /^const HOY0 = .*$/m, /^const TEMPORADA = .*$/m];

// app('2026-11-10T19:00') → función que evalúa código dentro de la app: const { yaPaso } = app(...)(`({ yaPaso })`)
export function app(ahora = '2026-11-10T12:00', { grupos = {} } = {}) {
  const T = new Date(ahora).getTime();
  if (isNaN(T)) throw new Error('fecha no válida: ' + ahora);
  const nada = () => { };
  const ctx = vm.createContext({
    console, sync: null,
    localStorage: { getItem: () => null, setItem: nada, removeItem: nada },
    location: { origin: 'https://limonplanes.com', hostname: 'limonplanes.com', search: '', pathname: '/' },
    document: { querySelectorAll: () => [], getElementById: () => null, documentElement: { dataset: {} } },
    navigator: {}, matchMedia: () => ({ matches: false })
  });
  ctx.window = ctx;
  // reloj parado: new Date() y Date.now() devuelven siempre el mismo instante
  vm.runInContext(`{ const R = Date; globalThis.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(${T}); } static now() { return ${T}; } }; }`, ctx);
  for (const f of TEMAS) vm.runInContext(fs.readFileSync(path.join(JS, f + '.js'), 'utf8'), ctx, { filename: 'web/js/' + f + '.js' });
  const inicio = fs.readFileSync(path.join(JS, 'inicio.js'), 'utf8');
  for (const re of DE_INICIO) {
    const m = inicio.match(re);
    if (!m) throw new Error('inicio.js ya no tiene la línea ' + re + ': revisa engine/tests/app/cargar.mjs');
    vm.runInContext(m[0], ctx, { filename: 'web/js/inicio.js' });
  }
  // grupo de cada categoría (en la app sale de la taxonomía): { rock: 'musica', teatro: 'escena' }
  vm.runInContext(`Object.assign(GROUP_OF, ${JSON.stringify(grupos)})`, ctx);
  return (codigo) => vm.runInContext(codigo, ctx);
}

// las categorías de verdad y su grupo, de la taxonomía del motor
export function gruposReales() {
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'engine/taxonomy.json'), 'utf8'));
  const out = {};
  (function rec(n, g) {
    if (Array.isArray(n)) return n.forEach((x) => rec(x, g));
    if (!n || typeof n !== 'object') return;
    const hijos = n.items || n.categorias || n.categories || n.children;
    if (hijos && n.id) return rec(hijos, n.id);
    if (n.id && g) out[n.id] = n.group_id || g;
    else if (n.id && n.group_id) out[n.id] = n.group_id;
    for (const k of Object.keys(n)) if (typeof n[k] === 'object') rec(n[k], g);
  })(t, null);
  return out;
}
