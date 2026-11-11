// Calle: ¿el corte es en una de mis calles? (mismaCalle)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './cargar.mjs';

const { mismaCalle } = app()('({ mismaCalle })');
const si = (corte, mia) => assert.equal(mismaCalle(corte, mia), true, `«${corte}» debería ser «${mia}»`);
const no = (corte, mia) => assert.equal(mismaCalle(corte, mia), false, `«${corte}» no es «${mia}»`);

test('mismaCalle · palabras completas, no trozos', () => {
  no('Plaza de Murillo', 'Bravo Murillo');
  no('Calle de Bravo Murillo', 'Plaza de Murillo');
  no('Calle de Alcalá', 'Alcalá Galiano');
  no('Calle Mayor', 'Arenal');
});

test('mismaCalle · con o sin tipo de vía, artículos, tildes y mayúsculas', () => {
  si('Paseo de la Castellana', 'Castellana');
  si('Castellana', 'Paseo de la Castellana');
  si('paseo de la castellana', 'PASEO DE LA CASTELLANA');
  si('Calle de Alcalá', 'alcala');
  si('C/ Bravo Murillo', 'Calle de Bravo Murillo');
  si('Avda. de América', 'Avenida de América');
  si('Gran Vía', 'gran via');
});

test('mismaCalle · si las dos dicen el tipo de vía y es distinto, no es la misma', () => {
  no('Plaza Mayor', 'Calle Mayor');
  no('Plaza de Castilla', 'Paseo de Castilla');
  si('Plaza Mayor', 'Mayor');  // quien solo escribe «Mayor» recibe los dos
});

test('mismaCalle · ignora el tramo y el número', () => {
  si('Paseo de la Castellana (entre Colón y Cuzco)', 'Castellana');
  si('Calle de Bravo Murillo entre Cuatro Caminos y Estrecho', 'Bravo Murillo');
  si('Calle de Alcalá, 45', 'Calle de Alcalá');
  si('Calle de Atocha desde la plaza de Jacinto Benavente', 'Atocha');
  si('Bravo Murillo 120', 'Bravo Murillo');
});

test('mismaCalle · nombres vacíos o de menos de 3 letras no casan con nada', () => {
  no('', 'Castellana');
  no('Calle de Alcalá', '');
  no('Calle O', 'O');
});
