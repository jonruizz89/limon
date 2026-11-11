// Fechas de la app: qué planes de hoy ya no salen (yaPaso), orden por hora (startHour, horaOrden),
// rangos de «¿Cuándo?» (range) y cómo se nombran (cuandoTxt).
// Uso: node --test engine/tests/app/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, gruposReales } from './cargar.mjs';

const GRUPOS = gruposReales();
const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// ¿ha pasado ya este plan de hoy a tal hora?
const pasoA = (hhmm, plan) => app('2026-11-10T' + hhmm, { grupos: GRUPOS })('yaPaso')(plan);

test('yaPaso · con hora de empezar: deja de salir 10 minutos después de empezar', () => {
  const concierto = { hora: '20:30', cats: ['rock'] };
  assert.equal(pasoA('20:35', concierto), false, 'a las 20:35 todavía se llega');
  assert.equal(pasoA('20:45', concierto), true, 'a las 20:45 ya ha empezado');
  const cine = { hora: '17:00 + 19:20', cats: ['estrenos'] };
  assert.equal(pasoA('18:00', cine), false, 'queda la sesión de las 19:20');
  assert.equal(pasoA('19:35', cine), true, 'ya ha empezado la última sesión');
  // un teatro de 20:30 a 23:30 dura 3 h, pero sigue teniendo hora de empezar
  const teatro = { hora: 'De 20:30 a 23:30', cats: ['teatro'] };
  assert.equal(pasoA('20:45', teatro), true);
  // apertura de puertas e inicio: cuenta la última hora (el inicio)
  const puertas = { hora: 'Apertura de puertas: 19:30 h Inicio: 21:00 h', cats: ['pop'] };
  assert.equal(pasoA('20:00', puertas), false);
  assert.equal(pasoA('21:15', puertas), true);
});

test('yaPaso · de entrar cuando quieras: sale hasta que acaba', () => {
  const expo = { hora: 'De 10:00 a 20:00', cats: ['pintura'] };
  assert.equal(pasoA('19:30', expo), false, 'la exposición sigue abierta');
  assert.equal(pasoA('20:05', expo), true, 'ya ha cerrado');
  // sin hora de fin: 3 h después de empezar
  const mercado = { hora: '11:00', cats: ['mercadillos'] };
  assert.equal(pasoA('13:45', mercado), false);
  assert.equal(pasoA('14:15', mercado), true);
  // «desde las…»: 5 h
  const fiesta = { hora: 'Desde las 12:00', cats: ['vecinal'] };
  assert.equal(pasoA('16:30', fiesta), false);
  assert.equal(pasoA('17:15', fiesta), true);
  // un horario de 3 h o más sin ser concierto, función, cine ni deporte también es de entrar cuando quieras
  const taller = { hora: '10:00 - 14:00', cats: ['manualidades'] };
  assert.equal(pasoA('12:00', taller), false);
  assert.equal(pasoA('14:10', taller), true);
});

test('yaPaso · sin hora, «todo el día», «consultar» o de madrugada: no se oculta', () => {
  for (const hora of [null, '', 'Todo el día', 'Consultar página oficial', 'Abierto 24 h'])
    assert.equal(pasoA('23:50', { hora, cats: ['rock'] }), false, String(hora));
  // acaba de madrugada
  assert.equal(pasoA('23:50', { hora: 'De 23:00 a 06:00', cats: ['discotecas'] }), false);
  assert.equal(pasoA('23:50', { hora: 'Desde las 22:00', cats: ['fiestas'] }), false);
});

test('yaPaso · «00:00» es «sin hora» en la agenda municipal: el plan no desaparece de hoy', () => {
  for (const hora of ['00:00', '0:00', '00:00:00', '00:00 h'])
    for (const cats of [['flamenco'], ['teatro', 'infantil'], ['conf', 'poesia']])
      assert.equal(pasoA('12:00', { hora, cats }), false, `${hora} [${cats}]`);
  // una sesión de madrugada con hora de verdad tampoco se da por pasada a media mañana
  assert.equal(pasoA('11:00', { hora: '00:30', cats: ['electronica'] }), false);
});

test('yaPaso · «19:30 a 21:00» (sin «de») es un horario con principio y fin', () => {
  // con hora de empezar: cuenta el principio, no el final
  const clase = { hora: '19:30 a 21:00', cats: ['rock'] };
  assert.equal(pasoA('19:35', clase), false);
  assert.equal(pasoA('19:50', clase), true, 'ya ha empezado, aunque acabe a las 21:00');
  // de entrar cuando quieras: hasta la hora de fin, no 3 h más
  const museo = { hora: 'Martes a domingos: 10:00 a 20:00 h', cats: ['museos'] };
  assert.equal(pasoA('19:30', museo), false);
  assert.equal(pasoA('20:15', museo), true, 'cerró a las 20:00');
  // de noche hasta la madrugada: no se oculta
  assert.equal(pasoA('10:00', { hora: '00:30 a 06:00', cats: ['discotecas'] }), false);
  assert.equal(pasoA('23:55', { hora: '23:30 a 06:00', cats: ['discotecas'] }), false);
});

test('yaPaso · horarios partidos y turnos', () => {
  // una exposición que cierra a mediodía sigue saliendo: vuelve a abrir por la tarde
  const expo = { hora: 'Martes a sábados: 10:00 - 14:00 h / 17:00 - 21:00 h', cats: ['pintura'] };
  assert.equal(pasoA('15:00', expo), false, 'cerrada a mediodía, pero abre a las 17:00');
  assert.equal(pasoA('21:10', expo), true);
  assert.equal(pasoA('15:00', { hora: '11:00-14:00 + 17:00-20:00', cats: ['talleres_familia'] }), false);
  // turnos: cuenta el último que empieza, no la hora a la que acaba
  const club = { hora: 'Turno 1: 18:15-19:45 / Turno 2: 19:45-21:15', cats: ['clubes'] };
  assert.equal(pasoA('19:50', club), false, 'el segundo turno acaba de empezar');
  assert.equal(pasoA('20:05', club), true);
  // un horario de apertura de 10 h es de entrar cuando quieras aunque el plan sea de teatro (una visita teatralizada)
  assert.equal(pasoA('15:00', { hora: 'Lunes a sábado: 10:00 - 20:00 h', cats: ['teatro'] }), false);
});

test('startHour · lee la hora de inicio en sus formas habituales', () => {
  const { startHour } = app()('({ startHour })');
  const h = (hora) => startHour({ hora });
  assert.equal(h('20:30'), 20.5);
  assert.equal(h('20.30'), 20.5);
  assert.equal(h('20h30'), 20.5);
  assert.equal(h('20 h'), 20);
  assert.equal(h('20h'), 20);
  assert.equal(h('19:00:00'), 19);
  assert.equal(h('De 10 a 14'), 10);
  assert.equal(h('Martes a domingos: 18:00 h'), 18);
  assert.equal(h('17:00 + 19:20'), 17);
  assert.equal(h('21:00 (puertas 20:30)'), 21);
  for (const sin of [null, '', 'Consultar página oficial', 'Por confirmar', 'Todo el día', '25:00'])
    assert.equal(h(sin), null, String(sin));
});

test('startHour · «00:00» a secas es «sin hora», no medianoche', () => {
  const { startHour, horaOrden } = app()('({ startHour, horaOrden })');
  for (const hora of ['00:00', '0:00', '00:00:00', '00:00 h']) assert.equal(startHour({ hora }), null, hora);
  assert.equal(horaOrden({ hora: '00:00' }), 99);
  // con más texto sí es una hora de verdad (las campanadas)
  assert.equal(startHour({ hora: '00:00 h Preuvas: 30 diciembre' }), 0);
  assert.equal(startHour({ hora: '00:30' }), 0.5);
});

test('horaOrden · dentro del día, por hora; los que no la dicen, al final', () => {
  const { horaOrden } = app()('({ horaOrden })');
  const planes = [{ t: 'sin hora', hora: null }, { t: 'noche', hora: '21:00' }, { t: 'mañana', hora: '10:30' }, { t: 'consultar', hora: 'Consultar' }, { t: 'tarde', hora: '17 h' }];
  planes.sort((a, b) => horaOrden(a) - horaOrden(b));
  assert.deepEqual(planes.map((p) => p.t), ['mañana', 'tarde', 'noche', 'sin hora', 'consultar']);
});

// 2026-11-10 es martes; 13 viernes; 14 sábado; 15 domingo
const rango = (ahora, cuando) => [...app(ahora)('range')(cuando)].map(dia);

test('range · hoy, mañana, 30 días y todo', () => {
  assert.deepEqual(rango('2026-11-10T19:00', 'hoy'), ['2026-11-10', '2026-11-10']);
  assert.deepEqual(rango('2026-11-10T19:00', 'manana'), ['2026-11-11', '2026-11-11']);
  assert.deepEqual(rango('2026-11-10T19:00', 'mes'), ['2026-11-10', '2026-12-10']);
  assert.deepEqual(rango('2026-11-10T19:00', 'todo'), ['2026-11-10', '2027-12-15']);
  // fin de mes y de año
  assert.deepEqual(rango('2026-12-31T23:30', 'manana'), ['2027-01-01', '2027-01-01']);
});

test('range · «esta semana» llega al domingo; en sábado y domingo, al domingo siguiente', () => {
  assert.deepEqual(rango('2026-11-09T08:00', 'semana'), ['2026-11-09', '2026-11-15'], 'lunes');
  assert.deepEqual(rango('2026-11-10T19:00', 'semana'), ['2026-11-10', '2026-11-15'], 'martes');
  assert.deepEqual(rango('2026-11-13T19:00', 'semana'), ['2026-11-13', '2026-11-15'], 'viernes');
  assert.deepEqual(rango('2026-11-14T10:00', 'semana'), ['2026-11-14', '2026-11-22'], 'sábado');
  assert.deepEqual(rango('2026-11-15T10:00', 'semana'), ['2026-11-15', '2026-11-22'], 'domingo');
});

test('range · «este finde» es sábado y domingo; ya en el finde, lo que queda', () => {
  assert.deepEqual(rango('2026-11-10T19:00', 'finde'), ['2026-11-14', '2026-11-15'], 'martes');
  assert.deepEqual(rango('2026-11-13T19:00', 'finde'), ['2026-11-14', '2026-11-15'], 'viernes');
  assert.deepEqual(rango('2026-11-14T10:00', 'finde'), ['2026-11-14', '2026-11-15'], 'sábado');
  assert.deepEqual(rango('2026-11-15T10:00', 'finde'), ['2026-11-15', '2026-11-15'], 'domingo');
});

test('range y cuandoTxt · días elegidos en el calendario', () => {
  const ev = app('2026-11-10T19:00');
  const elegir = (a, b) => { ev(`state.rango = [parse('${a}'), parse('${b}')]`); return { r: [...ev('range')('rango')].map(dia), ...ev('cuandoTxt')('rango') }; };
  assert.deepEqual(elegir('2026-11-25', '2026-11-25'), { r: ['2026-11-25', '2026-11-25'], boton: '25 nov', frase: 'el 25 de noviembre' });
  assert.deepEqual(elegir('2026-11-20', '2026-11-22'), { r: ['2026-11-20', '2026-11-22'], boton: '20–22 nov', frase: 'del 20 al 22 de noviembre' });
  assert.deepEqual(elegir('2026-11-28', '2026-12-02'), { r: ['2026-11-28', '2026-12-02'], boton: '28 nov – 2 dic', frase: 'del 28 de noviembre al 2 de diciembre' });
  assert.deepEqual(elegir('2026-12-30', '2027-01-02'), { r: ['2026-12-30', '2027-01-02'], boton: '30 dic – 2 ene', frase: 'del 30 de diciembre al 2 de enero' });
});

test('cuandoTxt · nombres de los rangos fijos, en el botón y en frases', () => {
  const { cuandoTxt } = app('2026-11-14T10:00')('({ cuandoTxt })');
  assert.deepEqual({ ...cuandoTxt('hoy') }, { boton: 'Hoy', frase: 'hoy' });
  assert.deepEqual({ ...cuandoTxt('manana') }, { boton: 'Mañana', frase: 'mañana' });
  assert.deepEqual({ ...cuandoTxt('finde') }, { boton: 'Este finde', frase: 'este finde' });
  assert.deepEqual({ ...cuandoTxt('semana') }, { boton: 'Esta semana', frase: 'esta semana' });
  assert.deepEqual({ ...cuandoTxt('mes') }, { boton: 'Próximos 30 días', frase: 'en los próximos 30 días' });
  assert.deepEqual({ ...cuandoTxt('todo') }, { boton: 'Todo lo disponible', frase: 'en todo lo disponible' });
});

test('occurs · un plan de hoy que ya ha pasado no cuenta para hoy, pero sí su sesión de mañana', () => {
  const ev = app('2026-11-10T21:00', { grupos: GRUPOS });
  const occurs = ev('occurs'), hoy = ev('today'), manana = ev('addDays(today, 1)');
  const uno = { inicio: '2026-11-10', fin: '2026-11-10', sesiones: ['2026-11-10'], hora: '19:00', cats: ['teatro'] };
  assert.equal(occurs(uno, hoy, hoy), null, 'la función de las 19:00 ya ha empezado');
  const varios = { ...uno, fin: '2026-11-11', sesiones: ['2026-11-10', '2026-11-11'] };
  assert.equal(occurs(varios, hoy, hoy), null);
  assert.equal(dia(occurs(varios, hoy, manana).date), '2026-11-11', 'queda la de mañana');
  const tarde = { ...uno, hora: '22:30' };
  assert.equal(dia(occurs(tarde, hoy, hoy).date), '2026-11-10', 'la de las 22:30 aún no ha empezado');
});
