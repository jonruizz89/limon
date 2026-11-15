"""Qué películas tiene en cartel cada sala que publica su cartelera (engine/cines.json) → web/datos/cartelera-<ciudad>.json.

La app lo usa para «Dónde verla» en las fichas de estrenos y para que al buscar una sala salgan sus películas.
Solo títulos y enlace a la ficha de la película en la web de la sala (sin horarios). Una petición por sala; si una sala
no responde, se mantiene lo que había publicado (de limonplanes.com) para no dejar el cine vacío.
Uso: python3 src/cartelera.py ../web
"""
import datetime as dt, html, json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CONF = json.load(open(os.path.join(HERE, '..', 'cines.json'), encoding='utf-8'))
UA = 'LimonBot/1.0 (+https://limonplanes.com)'


def get(url, enc=None):
    for i in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
                raw = r.read()
            time.sleep(2)
            if enc:
                return raw.decode(enc, 'replace')
            try:
                return raw.decode('utf-8')
            except UnicodeDecodeError:
                return raw.decode('latin-1')
        except Exception as ex:
            print('  ', type(ex).__name__, url[:80], file=sys.stderr)
            time.sleep(5)
    return None


def limpio(t):
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t or ''))).strip()
    if t.isupper() and len(t) > 3:  # «JALEOS» → «Jaleos»
        t = t[0] + t[1:].lower()
    return t


def verdi(c, page):
    out = []
    for b in re.findall(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            d = json.loads(b)
        except ValueError:
            continue
        for x in d.get('@graph', [d]) if isinstance(d, dict) else []:
            if x.get('@type') != 'ItemList':
                continue
            for it in x.get('itemListElement') or []:
                m = it.get('item') or {}
                if m.get('@type') == 'Movie' and m.get('name'):
                    out.append({'t': limpio(m['name']), 'u': m.get('url')})
    return out


def renoir(c, page):
    base = 'https://www.cinesrenoir.com'
    return [{'t': limpio(t), 'u': base + '/pelicula/' + s + '/'}
            for s, t in re.findall(r'<a href="(?:https://www\.cinesrenoir\.com)?/pelicula/([^/"]+)/">([^<]+)</a>', page)]


def golem(c, page):
    return [{'t': limpio(t), 'u': 'https://www.golem.es' + h}
            for h, t in re.findall(r'<a href="(/golem/pelicula/[^"]+)"[^>]*class="txtNegXXL[^"]*">(.*?)</a>', page, re.S)]


LECTORES = {'verdi': verdi, 'renoir': renoir, 'golem': golem}


def anterior(cid):
    try:
        with urllib.request.urlopen(urllib.request.Request(f'https://limonplanes.com/datos/cartelera-{cid}.json', headers={'User-Agent': UA}), timeout=20) as r:
            return {x['n']: x for x in json.loads(r.read().decode()).get('cines') or []}
    except Exception:
        return {}


def main(web):
    os.makedirs(os.path.join(web, 'datos'), exist_ok=True)
    for cid, cines in CONF.items():
        if cid.startswith('_'):
            continue
        antes, out = None, []
        for c in cines:
            page = get(c['url'], 'latin-1' if c['lector'] == 'golem' else None)
            pelis = LECTORES[c['lector']](c, page) if page else []
            vistos, unicas = set(), []
            for p in pelis:
                k = p['t'].lower()
                if p['t'] and k not in vistos:
                    vistos.add(k); unicas.append(p)
            if not unicas:  # sin respuesta o la web ha cambiado: lo de la última vez
                antes = antes if antes is not None else anterior(cid)
                unicas = (antes.get(c['nombre']) or {}).get('p') or []
                print(f'{c["nombre"]}: sin datos nuevos, se mantienen {len(unicas)}')
            else:
                print(f'{c["nombre"]}: {len(unicas)} películas')
            out.append({'n': c['nombre'], 'd': c['direccion'], 'la': c['lat'], 'lo': c['lng'], 'w': c['url'], 'p': unicas})
        json.dump({'generado': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'), 'cines': out},
                  open(os.path.join(web, 'datos', f'cartelera-{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../web')
