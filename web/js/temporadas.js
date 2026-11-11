// Limón · temporadas (Navidad, Halloween…)

// ---------- temporadas (Navidad, Halloween…): en su época sale un botón con sus planes. Se decide por el título y el
// ciclo, no por la descripción (que menciona la Navidad de pasada). Mismas reglas que engine/src/site.py
const TEMPORADAS = [
  { id: 'navidad', nombre: 'Navidad', emo: '🎄', ver: ['11-01', '01-06'], re: /navidad|navide[ñn]|nadal|eguberri|christmas|xmas|\bbelenes\b|\bbel[eé]n (de|del|monumental|napolitano|viviente|municipal)|pesebre|reyes magos|cabalgata|nochevieja|nochebuena|campanadas|pap[aá] noel|olentzero|mari domingi|ti[oó] de nadal|villancic|turr[oó]n|fin de a[nñ]o|san silvestre|luces de navidad|mercad(o|illo)s? navide/i },
  { id: 'halloween', nombre: 'Halloween', emo: '🎃', ver: ['10-01', '11-01'], re: /hallow|samhain|d[ií]a de (los )?muertos|calabaza|zombi|terror|miedo|tenorio|todos los santos|gaztain|castañada|castanyada/i },
  { id: 'carnaval', nombre: 'Carnaval', emo: '🎭', ver: ['01-25', '03-08'], re: /carnaval|inauteri|ihauteri|carnestolt|disfraz|disfrac|entierro de la sardina/i },
  { id: 'san-valentin', nombre: 'San Valentín', emo: '💘', ver: ['02-01', '02-14'], re: /valent[ií]n|valentine|enamorad|rom[aá]ntic/i },
  { id: 'semana-santa', nombre: 'Semana Santa', emo: '✝️', ver: ['03-01', '04-25'], re: /semana santa|aste santu|setmana santa|procesi[oó]n|cofrad|torrija|pasos de/i },
  { id: 'orgullo', nombre: 'Orgullo', emo: '🏳️‍🌈', ver: ['06-01', '07-10'], re: /orgullo|\bpride\b|lgtb|lgbt|harrotasun|diversidad sexual/i },
];
const md = d => String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const enVentana = (v, d) => v[0] <= v[1] ? d >= v[0] && d <= v[1] : d >= v[0] || d <= v[1];
const esTemporada = e => !!TEMPORADA && (TEMPORADA.re.test(e.titulo) || TEMPORADA.re.test(e.serie || ''));
