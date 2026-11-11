// Estado compartido de web/js: cada variable de nivel superior se asigna solo en el archivo que la declara
// (desde los demás se cambia con una función pon… del archivo dueño), y las que «se fijan al arrancar» no se vuelven a asignar.
// Así los archivos se pueden entender por separado y, el día que se quiera, pasar a módulos con import/export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './cargar.mjs';

const JS = path.join(RAIZ, 'web/js');
// el código sin comentarios ni textos (de los textos con comillas invertidas se conserva lo que va dentro de ${ })
export function soloCodigo(s) {
  let out = '', i = 0; const pila = [];  // pila: profundidad de llaves dentro de cada ${ } abierto
  let ultimo = '';  // último carácter de código con significado, para distinguir una división de una expresión regular
  const texto = (q) => { i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } i++; out += '""'; ultimo = '"'; };
  const plantilla = () => { while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (s[i] === '`') { i++; out += '``'; ultimo = '`'; return; } if (s[i] === '$' && s[i + 1] === '{') { i += 2; out += ' ( '; pila.push(0); ultimo = '('; return; } i++; } };
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"') { texto(c); continue; }
    if (c === '`') { i++; plantilla(); continue; }
    if (c === '/' && (ultimo === '' || '(,=:[!&|?{};+-*%<>~^'.includes(ultimo) || /\b(return|typeof|case|in|of)$/.test(out.trimEnd()))) {
      i++; let enClase = false; while (i < s.length && (s[i] !== '/' || enClase)) { if (s[i] === '\\') i++; else if (s[i] === '[') enClase = true; else if (s[i] === ']') enClase = false; i++; }
      i++; while (/[a-z]/i.test(s[i] || '')) i++; out += ' /re/ '; ultimo = '/'; continue;
    }
    if (pila.length) { if (c === '{') pila[pila.length - 1]++; else if (c === '}') { if (pila[pila.length - 1] === 0) { pila.pop(); i++; out += ' ) '; plantilla(); continue; } pila[pila.length - 1]--; } }
    out += c; if (!/\s/.test(c)) ultimo = c; i++;
  }
  return out;
}
const archivos = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));
const codigo = Object.fromEntries(archivos.map((f) => [f, soloCodigo(fs.readFileSync(path.join(JS, f), 'utf8'))]));
const crudo = Object.fromEntries(archivos.map((f) => [f, fs.readFileSync(path.join(JS, f), 'utf8')]));

// variables `let` de nivel superior (línea que empieza por «let » sin sangría) → archivo que las declara
function declaradas(s) {
  const out = [];
  for (const m of s.matchAll(/^let ([\s\S]*?);/gm)) {
    let prof = 0, cur = '';
    for (const ch of m[1] + ',') { if ('([{'.includes(ch)) prof++; if (')]}'.includes(ch)) prof--; if (ch === ',' && prof === 0) { const n = cur.trim().match(/^[A-Za-z_$][\w$]*/); if (n) out.push(n[0]); cur = ''; } else cur += ch; }
  }
  return out;
}
const dueño = new Map();
for (const f of archivos) for (const n of declaradas(codigo[f])) dueño.set(n, f);
// veces que se asigna `nombre` en un texto de código. No cuentan las declaraciones locales (`const me = …` dentro de una función)
function asignaciones(nombre, s) {
  const n = nombre.replace(/\$/g, '\\$');
  const re = new RegExp(`(?<![\\w$.])${n}\\s*(?:=(?![=>])|[-+*/%&|^]=|\\*\\*=|<<=|>>=|\\|\\|=|&&=|\\?\\?=|\\+\\+|--)|(?:\\+\\+|--)\\s*${n}(?![\\w$])`, 'g');
  let veces = 0;
  for (const m of s.matchAll(re)) {
    const desde = Math.max(s.lastIndexOf(';', m.index), s.lastIndexOf('{', m.index), s.lastIndexOf('}', m.index)) + 1;
    if (!/^\s*(const|let|var)\b/.test(s.slice(desde, m.index))) veces++;
  }
  return veces;
}

test('hay variables de estado declaradas (la prueba está mirando algo)', () => {
  assert.ok(dueño.size > 50, `solo ${dueño.size} variables encontradas`);
  for (const n of ['saved', 'prefs', 'F', 'userPos', 'MAP', 'me']) assert.ok(dueño.has(n), `no se encuentra la variable ${n}`);
});

test('cada variable se asigna solo en el archivo que la declara', () => {
  const fuera = [];
  for (const [n, f] of dueño) for (const g of archivos) if (g !== f && asignaciones(n, codigo[g])) fuera.push(`${n} (de ${f}) se asigna en ${g}`);
  assert.deepEqual(fuera, [], 'usa una función del archivo dueño (function ponX(v) { return (x = v); }) en vez de asignar desde fuera; si es una variable local con el mismo nombre, cámbiale el nombre');
});

test('lo que se fija al arrancar no se vuelve a asignar', () => {
  const fijas = [];
  for (const f of archivos) for (const m of crudo[f].matchAll(/^let ([^;]*);[ \t]*\/\/ se fijan? al arrancar/gm)) fijas.push(...m[1].split(',').map((x) => x.trim()).filter(Boolean).map((n) => [n, f]));
  assert.ok(fijas.length > 30, `solo ${fijas.length} variables marcadas «se fija al arrancar»`);
  const repetidas = fijas.filter(([n, f]) => asignaciones(n, codigo[f]) > 1).map(([n, f]) => `${n} (${f}) se asigna ${asignaciones(n, codigo[f])} veces`);
  assert.deepEqual(repetidas, []);
});

test('ninguna variable de nivel superior se llama como un id de la página', () => {
  // en Safari antiguo eso daba error; quedan dos de antes y no se añaden más
  const html = fs.readFileSync(path.join(RAIZ, 'web/index.html'), 'utf8') + Object.values(crudo).join('\n');
  const ids = new Set([...html.matchAll(/\bid\s*=\s*\\?["']([A-Za-z_][\w-]*)["'\\]/g)].map((m) => m[1]));
  const chocan = [...dueño.keys()].filter((n) => ids.has(n)).sort();
  assert.deepEqual(chocan, ['taste', 'ventajas']);
});
