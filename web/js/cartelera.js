// Limón · cartelera de las salas que la publican (engine/src/cartelera.py → datos/cartelera-<ciudad>.json): «Dónde verla» en la
// ficha de un estreno y, al buscar una sala («Golem», «Princesa»…), las películas que tiene en cartel. Solo salas con cartelera
// pública (Verdi, Golem, Renoir); las grandes cadenas no la dejan leer. Sin horarios: se enlaza a la ficha de la película en la sala.

let CARTELERA = null, carteleraDe = '';

function cargaCartelera() {
  const id = CITY && CITY.id;
  if (!id || carteleraDe === id) return;
  carteleraDe = id; CARTELERA = null;
  // en pruebas no se publican los archivos de datos: se usa la cartelera de la web pública (que permite leerla desde otra web)
  const url = (typeof LIMON_PRUEBAS !== 'undefined' && LIMON_PRUEBAS ? 'https://limonplanes.com/' : '') + 'datos/cartelera-' + encodeURIComponent(id) + '.json?d=' + ymd(today);
  fetch(url).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!j || carteleraDe !== id || !Array.isArray(j.cines) || Date.now() - Date.parse(j.generado) > 4 * 864e5) return;  // más de 4 días: ya no vale
    CARTELERA = j.cines.map(c => Object.assign({}, c, { k: (c.p || []).map(p => clavePeli(p.t)) }));
    if (document.querySelector('article.card.abierta') || $('ex-q').value.trim()) renderAll();
  }).catch(() => { });
}

// «Estreno en cines: Wild Horse Nine» y «Wild Horse Nine (V.O.S.E.)» son la misma película
function clavePeli(t) {
  return nf(t).replace(/^estreno en cines:\s*/, '').replace(/\((v\.?\s?o\.?\s?s?\.?\s?e?\.?|vose|ocap|ad|3d)\)/g, ' ')
    .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function mismaPeli(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [c, l] = a.length < b.length ? [a, b] : [b, a];  // «Los miserables» y «Los miserables: el musical» no; «Jaleos» y «Jaleos (versión…)» sí
  return c.length >= 10 && l.startsWith(c + ' ');
}

function dondeVerla(e) {
  if (!CARTELERA || !e.cats.includes('estrenos')) return '';
  const k = clavePeli(e.titulo);
  const pos = userPos || (ZONE && ZONE.c) || null;
  const hay = CARTELERA.map(c => ({ c, i: c.k.findIndex(x => mismaPeli(x, k)) })).filter(x => x.i >= 0)
    .map(x => Object.assign(x, { d: pos ? km(pos, [x.c.la, x.c.lo]) : null }))
    .sort((a, b) => (a.d == null ? 0 : a.d) - (b.d == null ? 0 : b.d));
  if (!hay.length) return '';
  return `<div class="donde"><p class="donde-t">Dónde verla</p><ul>${hay.map(x => `<li><a href="${ext(x.c.p[x.i].u || x.c.w)}" target="_blank" rel="noopener">${esc(x.c.n)} ↗</a>${x.d != null ? ` · <span class="dist">a ${fmtDist(x.d)}</span>` : ''}<span class="note"> · ${esc(x.c.d)}</span></li>`).join('')}</ul>
    <p class="note">Salas que publican su cartelera. En las grandes cadenas, mira su web.</p></div>`;
}

// al buscar una sala: sus películas (las que son estreno abren su ficha en Limón; las demás, la ficha en la web de la sala)
function carteleraBusqueda(q) {
  if (!CARTELERA || !q || q.length < 4 || /^(cine|cines|sala|salas|pelicula|peliculas)$/.test(q)) return '';
  const ws = q.split(/\s+/).filter(w => !/^(cine|cines|de|la|el|sala)$/.test(w));
  if (!ws.length) return '';
  const cines = CARTELERA.filter(c => { const n = nf(c.n + ' ' + c.d); return ws.every(w => n.includes(w)); });
  if (!cines.length || cines.length > 3) return '';
  const estrenos = EV.filter(e => e.cats.includes('estrenos'));
  const pos = userPos || null;
  return cines.map(c => `<section class="cinebox" aria-label="En cartel en ${esc(c.n)}">
      <p class="cinebox-t"><b>En cartel en ${esc(c.n)}</b>${pos ? ` · <span class="dist">a ${fmtDist(km(pos, [c.la, c.lo]))}</span>` : ''}</p>
      <p class="note">${esc(c.d)} · <a href="${ext(c.w)}" target="_blank" rel="noopener">Horarios en su web ↗</a></p>
      <ul class="pelis">${c.p.map((p, i) => { const e = estrenos.find(x => mismaPeli(clavePeli(x.titulo), c.k[i]));
        return `<li>${e ? `<a href="?ev=${esc(e.id)}" data-goto-ev="${esc(e.id)}">${esc(p.t)}</a> <span class="tag">Estreno</span>` : `<a href="${ext(p.u || c.w)}" target="_blank" rel="noopener">${esc(p.t)} ↗</a>`}</li>`; }).join('')}</ul></section>`).join('');
}
