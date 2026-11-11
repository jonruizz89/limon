// Seguridad de la página: la política de contenido (CSP) de index.html no permite scripts en línea salvo los suyos, por huella.
// Si alguien cambia un <script> en línea y no recalcula su huella, el navegador lo bloquea sin avisar: esta prueba lo avisa antes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const web = new URL('../../../web/', import.meta.url);
const html = readFileSync(new URL('index.html', web), 'utf8');
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/) || [])[1] || '';
const dir = (n) => (csp.split(';').map((x) => x.trim()).find((x) => x.startsWith(n + ' ')) || '');

test('la CSP no deja ejecutar scripts en línea ni cualquier cosa de un CDN', () => {
  const s = dir('script-src');
  assert.ok(s, 'falta script-src');
  assert.ok(!s.includes("'unsafe-inline'"), "script-src no debe llevar 'unsafe-inline'");
  assert.ok(!s.includes("'unsafe-eval'"), "script-src no debe llevar 'unsafe-eval'");
  for (const src of s.split(' ').filter((x) => x.startsWith('https://cdn.jsdelivr.net'))) {
    assert.match(src, /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^ ]+@\d[^ ]*\/$/, 'jsDelivr solo con paquete y versión fijos: ' + src);
  }
  assert.ok(csp.includes("object-src 'none'") && csp.includes("base-uri 'self'"));
});

test('cada script en línea de index.html tiene su huella en la CSP', () => {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(inline.length > 0);
  for (const code of inline) {
    const h = "'sha256-" + createHash('sha256').update(code, 'utf8').digest('base64') + "'";
    assert.ok(csp.includes(h), 'falta en la CSP la huella ' + h + ' del script que empieza por: ' + code.trim().slice(0, 60));
  }
});

test('no hay manejadores en línea (onclick=, onerror=…) ni enlaces javascript:', () => {
  const files = ['index.html', 'data.js', ...readdirSync(new URL('js/', web)).map((f) => 'js/' + f)];
  for (const f of files) {
    const t = readFileSync(new URL(f, web), 'utf8');
    assert.ok(!/<[a-z][^<>]*\son[a-z]+\s*=\s*["']/i.test(t), f + ': hay un manejador en línea, que la CSP bloquea');
    assert.ok(!/href\s*=\s*["']javascript:/i.test(t), f + ': hay un enlace javascript:');
  }
});

test('los scripts externos van con versión fija y comprobación de integridad', () => {
  for (const m of html.matchAll(/<script[^>]*\ssrc="(https:[^"]+)"[^>]*>/g)) {
    assert.match(m[0], /integrity="sha384-/, 'sin integrity: ' + m[1]);
  }
});
