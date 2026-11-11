// Temporadas: cuándo sale cada botón (Navidad, Halloween…) y qué planes entran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './cargar.mjs';

const temporada = (ahora) => { const t = app(ahora)('TEMPORADA'); return t ? t.id : null; };
const esDe = (ahora, plan) => app(ahora)('esTemporada')(typeof plan === 'string' ? { titulo: plan } : plan);

test('temporadas · cada una sale en su época', () => {
  assert.equal(temporada('2026-10-15T12:00'), 'halloween');
  assert.equal(temporada('2026-10-31T23:00'), 'halloween');
  assert.equal(temporada('2026-11-01T09:00'), 'navidad', 'el 1 de noviembre ya es Navidad (va antes en la lista)');
  assert.equal(temporada('2026-12-24T12:00'), 'navidad');
  assert.equal(temporada('2027-01-06T12:00'), 'navidad', 'hasta Reyes');
  assert.equal(temporada('2027-01-07T12:00'), null);
  assert.equal(temporada('2027-02-10T12:00'), 'carnaval');
  assert.equal(temporada('2027-03-20T12:00'), 'semana-santa');
  assert.equal(temporada('2027-06-20T12:00'), 'orgullo');
  assert.equal(temporada('2027-08-15T12:00'), null);
});

test('Navidad · entran los planes navideños', () => {
  for (const t of ['Mercado de Navidad de la Plaza Mayor', 'Mercadillo navideño de Chamberí', 'Belén monumental del Ayuntamiento', 'Belén de la Real Casa de Correos',
    'Cabalgata de Reyes Magos', 'Concierto de villancicos', 'Fira de Nadal a la Sagrada Família', 'Eguberriko azoka', 'Christmas Market'])
    assert.equal(esDe('2026-12-12T12:00', t), true, t);
});

test('Navidad · no entran los que solo se le parecen', () => {
  for (const t of ['Navider en concierto', 'Belén Aguilera', 'Belén Aguilera · Gira 2026', 'Ana Belén: Más D Ana', 'Los Reyes del Mambo', 'Concierto de rock'])
    assert.equal(esDe('2026-12-12T12:00', t), false, t);
});

test('Navidad · cuenta el título y el ciclo, no la descripción', () => {
  assert.equal(esDe('2026-12-12T12:00', { titulo: 'Taller de cocina', serie: 'Navidad en Matadero' }), true);
  assert.equal(esDe('2026-12-12T12:00', { titulo: 'Taller de cocina', descripcion: 'Recetas para la cena de Navidad' }), false);
});

test('fuera de temporada no hay planes de temporada', () => {
  assert.equal(esDe('2027-08-15T12:00', 'Mercado de Navidad'), false);
  assert.equal(esDe('2026-10-15T12:00', 'Mercado de Navidad'), false, 'en octubre toca Halloween');
  assert.equal(esDe('2026-10-15T12:00', 'Ruta del terror por el Madrid de los Austrias'), true);
});
