// Dirección de la página de cada plan (/evento/<id>-<slug>/): la app (slugEv) y el motor (slug, en engine/src/site.py)
// tienen que dar lo mismo, o los enlaces compartidos desde la app no existen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { app, RAIZ } from './cargar.mjs';

const TITULOS = [
  'Los miserables', 'Mercado de Navidad de la Plaza Mayor', 'JAZZMADRID26. Festival Internacional de Jazz', '¡Hola, Madrid! ¿Qué hacemos?',
  'Niño, pingüino y cigüeña', 'Gèneres Fantàstics: l’òpera', 'Año nuevo — «Fin de año» en Sol', 'Bilboko Aste Nagusia 2026',
  'ÁRBOL · ÉPOCA · ÍNDICE · ÓPERA · ÚLTIMO · ÑU · ÇA', 'Müller & Søren + Ångström', '  espacios   por   todas   partes  ', '100% Flamenco (2ª edición)',
  'Rock’n’roll / Pop_Rock', '東京 Tokyo', '!!!', '', 'Café́ con tilde suelta', 'İstanbul ve Straße', 'a'.repeat(69) + ' final que se corta', 'Título de exactamente setenta caracteres que termina con guion al cortar -x',
  'Exposición «Picasso: 1906»', 'Día de l’Àngel — Fira d’Artesania', 'Emoji 🎄 Navidad 🎅', 'MAYÚSCULAS Y minúsculas', 'tabulador\ty\nsalto'
];
// el slug de site.py, sin ejecutar el resto del archivo (que lee la base de datos)
const PY = `
import ast, json, re, sys
src = open(sys.argv[1], encoding='utf-8').read()
fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == 'slug')
ns = {'re': re}
exec(compile(ast.Module(body=[fn], type_ignores=[]), 'site.py', 'exec'), ns)
print(json.dumps([ns['slug'](t) for t in json.loads(sys.stdin.read())]))
`;

test('slug · la app y el motor dan la misma dirección', () => {
  const { slugEv } = app()('({ slugEv })');
  const motor = JSON.parse(execFileSync('python3', ['-c', PY, path.join(RAIZ, 'engine/src/site.py')], { input: JSON.stringify(TITULOS), encoding: 'utf8' }));
  TITULOS.forEach((t, i) => assert.equal(slugEv(t), motor[i], `título ${JSON.stringify(t)}`));
});

test('slug · casos conocidos', () => {
  const { slugEv } = app()('({ slugEv })');
  assert.equal(slugEv('Mercado de Navidad de la Plaza Mayor'), 'mercado-de-navidad-de-la-plaza-mayor');
  assert.equal(slugEv('¡Hola, Madrid! ¿Qué hacemos?'), 'hola-madrid-que-hacemos');
  assert.equal(slugEv('Niño, pingüino y cigüeña'), 'nino-pinguino-y-ciguena');
  assert.equal(slugEv('!!!'), 'x');
  assert.equal(slugEv(''), 'x');
  assert.ok(slugEv('a'.repeat(200)).length === 70);
});
