// index.html: cómo se cargan los archivos de la app. Si esto se rompe la app sigue funcionando, pero tarda segundos más en abrir
// (medido con 4G: el navegador pide los scripts normales de uno en uno, cada uno al terminar el anterior).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './cargar.mjs';

const html = fs.readFileSync(path.join(RAIZ, 'web/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"[^>]*><\/script>/g)].map((m) => ({ src: m[2], defer: /\bdefer\b/.test(m[0]) }));
const propios = scripts.filter((s) => !/^https?:/.test(s.src));
const nombre = (s) => s.src.split('?')[0];

test('los archivos por tema llevan «defer» (se descargan a la vez) y el arranque va justo después de data.js', () => {
  const orden = propios.map(nombre);
  assert.deepEqual(orden.slice(0, 3), ['config.js', 'data.js', 'js/app.js'], 'config.js, data.js y js/app.js, en ese orden y los primeros');
  for (const s of propios.slice(0, 3)) assert.equal(s.defer, false, `${nombre(s)} no lleva defer: tiene que ejecutarse en cuanto llega`);
  const temas = propios.slice(3);
  assert.ok(temas.length >= 11, 'están los archivos por tema');
  for (const s of temas) assert.equal(s.defer, true, `${nombre(s)} tiene que llevar defer`);
  assert.ok(!orden.includes('js/inicio.js'), 'js/inicio.js no va en la página: lo carga js/app.js cuando llegan los datos');
});

test('todos los archivos de web/js están en la página (menos inicio.js) y en la lista del service worker', () => {
  const enDisco = fs.readdirSync(path.join(RAIZ, 'web/js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f).sort();
  const enPagina = propios.map(nombre).filter((s) => s.startsWith('js/')).sort();
  assert.deepEqual(enPagina, enDisco.filter((f) => f !== 'js/inicio.js'));
  const sw = fs.readFileSync(path.join(RAIZ, 'web/sw.js'), 'utf8');
  for (const f of [...enDisco, 'css/app.css', 'data.js', 'config.js']) assert.ok(sw.includes(`'${f}'`), `${f} falta en la lista SHELL de sw.js (no se guardaría para usarse sin conexión)`);
});

test('la misma versión (?v=) en el estilo, data.js y todos los archivos de js/', () => {
  const v = [...html.matchAll(/(?:href|src)="((?:css\/app\.css|data\.js|js\/[a-z]+\.js)\?v=([0-9a-z]+))"/g)];
  assert.ok(v.length >= 14);
  assert.equal(new Set(v.map((m) => m[2])).size, 1, 'versiones distintas: ' + [...new Set(v.map((m) => m[2]))].join(', '));
});

test('las precargas del arranque apuntan a la misma dirección que sus etiquetas <script>', () => {
  const pre = [...html.matchAll(/<link rel="preload" as="script" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(pre.map((u) => u.split('?')[0]), ['config.js', 'data.js', 'js/app.js']);
  for (const u of pre) assert.ok(propios.some((s) => s.src === u), `la precarga de ${u} no coincide con ninguna etiqueta <script> (se descargaría dos veces)`);
  assert.ok(html.indexOf('rel="preload"') < html.indexOf('rel="stylesheet"'), 'las precargas van antes que las hojas de estilo');
});
