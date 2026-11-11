// Datos de prueba para los flujos en navegador (flujos.mjs): una ciudad pequeña y conocida, con el reloj parado.
// Así las pruebas no dependen de los planes de cada día ni de que producción responda, y no gastan cupo de Supabase.
// Tienen la misma forma que los archivos que publica el motor en web/datos (export_events.py, formato 2).

// sábado 12 de diciembre de 2026, 11:00 en Madrid: en Navidad, con planes de hoy ya pasados y otros por empezar
export const AHORA = '2026-12-12T11:00:00+01:00';
const GENERADO = '2026-12-12T07:00:00+00:00';

const ciudad = (id, name, region, lat, lng, bbox, position) => ({
  id, name, region, lat, lng, bbox, districts: [], stadiums: [], features: { calle: true }, status: 'publicada', position, kind: 'ciudad', parent: null, munis: null
});

const GRUPOS = [['musica', 'Música'], ['escena', 'Artes escénicas'], ['arte', 'Arte y exposiciones'], ['cine', 'Cine y audiovisual'], ['familia', 'Familia'],
  ['ciudad', 'Fiestas y vida en la ciudad'], ['patrimonio', 'Museos y patrimonio'], ['letras', 'Letras y pensamiento'], ['deporte', 'Deporte y carreras']];
const CATEGORIAS = [['pop', 'musica', 'Pop'], ['rock', 'musica', 'Rock'], ['clasica', 'musica', 'Clásica'], ['flamenco', 'musica', 'Flamenco'], ['teatro', 'escena', 'Teatro'],
  ['pintura', 'arte', 'Pintura'], ['estrenos', 'cine', 'Estrenos'], ['infantil', 'familia', 'Actividades infantiles'], ['mercadillos', 'ciudad', 'Mercadillos y rastros'],
  ['tradiciones', 'ciudad', 'Tradiciones únicas'], ['rutas', 'patrimonio', 'Rutas por la ciudad'], ['conf', 'letras', 'Conferencias y coloquios'],
  ['libros', 'letras', 'Presentaciones de libros'], ['futbol', 'deporte', 'Fútbol']];

// plan: [id, título, inicio, fin, hora, categorías, lugar, extras]
const plan = ([i, t, s, f, h, c, v, x = {}]) => ({ i, t, s, f, h, c, v, de: `${t}. Plan de prueba.`, a: '2026-12-01T08:00Z', fu: [[0, `https://ejemplo.limonplanes.com/plan/${i}`]], ...x });

export const MADRID = [
  [101, 'Mercado de Navidad de la Plaza Mayor', '2026-11-27', '2026-12-31', 'De 10:00 a 21:00', ['mercadillos', 'tradiciones'], 'Plaza Mayor', { g: 1 }],
  [102, 'Concierto de Belén Aguilera', '2026-12-12', '2026-12-12', '21:00', ['pop'], 'Movistar Arena', { p: 'Desde 35 €' }],
  [103, 'Charla matinal sobre el Madrid medieval', '2026-12-12', '2026-12-12', '09:00', ['conf'], 'Museo de San Isidro', { g: 1 }],  // hoy, ya ha pasado
  [104, 'Los miserables', '2026-12-12', '2026-12-20', '20:00', ['teatro'], 'Teatro Apolo', { ss: ['2026-12-12', '2026-12-13', '2026-12-18', '2026-12-19', '2026-12-20'] }],
  [105, 'Exposición de pintura flamenca', '2026-10-01', '2027-02-28', 'De 10:00 a 20:00', ['pintura'], 'Museo del Prado'],
  [106, 'Cuentacuentos de invierno', '2026-12-13', '2026-12-13', '12:00', ['infantil'], 'Biblioteca Eugenio Trías', { g: 1 }],
  [107, 'Navider en concierto', '2026-12-15', '2026-12-15', '20:30', ['rock'], 'Sala El Sol'],
  [108, 'Ruta por el Madrid de los Austrias', '2026-12-16', '2026-12-16', '11:00', ['rutas'], 'Plaza de la Villa'],
  [109, 'Real Madrid - Sevilla', '2026-12-19', '2026-12-19', '21:00', ['futbol'], 'Bernabéu'],
  [110, 'Cabalgata de Reyes Magos', '2027-01-05', '2027-01-05', '18:30', ['tradiciones'], 'Paseo de la Castellana', { g: 1 }],
  [111, 'Concierto de Año Nuevo', '2027-01-01', '2027-01-01', '12:00', ['clasica'], 'Auditorio Nacional'],
  [112, 'Festival de cine documental', '2026-12-14', '2026-12-18', '19:00', ['estrenos'], 'Cineteca'],
  [113, 'Presentación del libro «Madrid»', '2026-12-17', '2026-12-17', '19:00', ['libros'], 'Librería La Central', { g: 1 }],
  [114, 'Noche de flamenco', '2026-12-12', '2026-12-12', '22:30', ['flamenco'], 'Corral de la Morería']
].map(plan);

export const BARCELONA = [
  [201, 'Fira de Santa Llúcia', '2026-11-27', '2026-12-23', 'De 10:30 a 20:30', ['mercadillos', 'tradiciones'], 'Avinguda de la Catedral', { g: 1 }],
  [202, 'Concert de Nadal al Palau', '2026-12-12', '2026-12-12', '21:00', ['clasica'], 'Palau de la Música'],
  [203, 'Ruta pel Barri Gòtic', '2026-12-13', '2026-12-13', '11:00', ['rutas'], 'Plaça Nova'],
  [204, 'Els miserables', '2026-12-18', '2026-12-18', '20:00', ['teatro'], 'Teatre Tívoli']
].map(plan);

const corte = (title, streets, from, to) => ({
  title, kind: 'obras', summary: `${title}. Aviso de prueba.`, streets, lines: [], stations: [], district: null,
  ranges: [{ from, to, start: null, end: null, holidays: true, weekdays: [] }], source_url: 'https://ejemplo.limonplanes.com/cortes'
});

// nombre de archivo (dentro de web/datos) → contenido
export function archivos() {
  const eventos = (zona, lista) => ({ generado: GENERADO, zona, formato: 2, fuentes: ['Fuente de prueba'], eventos: lista });
  const fuentes = { generado: GENERADO, fuentes: [{ name: 'Fuente de prueba', url: 'https://ejemplo.limonplanes.com', method: 'Prueba', license: 'CC BY 4.0', last_run_at: GENERADO }] };
  return {
    'ciudades.json': { generado: GENERADO, ciudades: [ciudad('madrid', 'Madrid', 'Comunidad de Madrid', 40.4168, -3.7038, [-3.89, 40.31, -3.52, 40.65], 1),
      ciudad('barcelona', 'Barcelona', 'Cataluña', 41.3874, 2.1686, [2.05, 41.31, 2.24, 41.47], 2)] },
    'taxonomia.json': { generado: GENERADO, grupos: GRUPOS.map(([id, name], position) => ({ id, name, position })),
      categorias: CATEGORIAS.map(([id, group_id, label], position) => ({ id, group_id, label, position })) },
    'eventos-madrid.json': eventos('madrid', MADRID),
    'eventos-barcelona.json': eventos('barcelona', BARCELONA),
    'fuentes-madrid.json': fuentes, 'fuentes-barcelona.json': fuentes,
    'cortes-madrid.json': { generado: GENERADO, cortes: [corte('Obras en la calle de Alcalá', ['Calle de Alcalá'], '2026-12-10', '2026-12-14'),
      corte('Corte por la carrera popular en el paseo de la Castellana', ['Paseo de la Castellana'], '2026-12-20', '2026-12-20')] },
    'cortes-barcelona.json': { generado: GENERADO, cortes: [] }
  };
}
