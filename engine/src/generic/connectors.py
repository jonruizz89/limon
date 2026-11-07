"""Conectores para APIs públicas de agenda que una página no deja ver (documentación interactiva, paginación…).

Cada conector sabe 1) si cubre una ciudad (`match`) y con qué parámetros, y 2) leer sus eventos (`read`).
discover.py los da de alta solos cuando la ciudad está en su territorio; probe.py y extract.py los leen con `read`.
"""
import datetime as dt, html, json, re, time, urllib.parse
from lib import fetch, fold, UA_API

# ---------- Kulturklik · agenda cultural del Gobierno Vasco (opendata.euskadi.eus, licencia CC BY 4.0)
KK = 'https://api.euskadi.eus/culture/events/v1.0'
JSON = 'application/json'
KK_REGIONS = {'bizkaia', 'gipuzkoa', 'araba', 'alava', 'araba alava', 'euskadi', 'pais vasco'}


def _clean(t):
    t = re.sub(r'<[^>]+>', ' ', html.unescape(t or ''))
    return re.sub(r'\s+', ' ', t).strip()


KK_PROV = {'bizkaia': '48', 'vizcaya': '48', 'gipuzkoa': '20', 'guipuzcoa': '20', 'araba': '01', 'alava': '01', 'araba alava': '01'}


def kk_match(city):
    if fold(city.get('region')) not in KK_REGIONS:
        return None
    if city.get('kind') == 'provincia':  # toda la provincia: todos sus municipios
        prov = KK_PROV.get(fold(city['name'])) or KK_PROV.get(fold(city.get('region')))
        return {'method': 'kulturklik', 'province': prov, 'municipality': None} if prov else None
    for prov in ('48', '20', '01'):
        st, _, txt, _ = fetch(f'{KK}/municipalities/byProvince/{prov}?_elements=400', accept=JSON, ua=UA_API)
        if st != 200:
            continue
        data = json.loads(txt)
        for m in data if isinstance(data, list) else data.get('items', []):
            if fold(m.get('nameEs')) == fold(city['name']) or fold(m.get('nameEu')) == fold(city['name']):
                return {'method': 'kulturklik', 'province': prov, 'municipality': m['municipalityId']}
    return None


def kk_read(cfg, max_pages=None):
    max_pages = max_pages or (30 if cfg.get('municipality') else 90)
    out, page, pages = [], 1, 1
    while page <= min(pages, max_pages):
        params = {'provinceNoraCode': cfg['province'], '_elements': 50, '_page': page}
        if cfg.get('municipality'):
            params['municipalityNoraCode'] = cfg['municipality']
        q = urllib.parse.urlencode(params)
        for intento in range(3):
            st, _, txt, _ = fetch(f'{KK}/events/upcoming?{q}', accept=JSON, ua=UA_API)
            if st == 200:
                break
            time.sleep(5 * (intento + 1))
        if st != 200:
            print(f'  Kulturklik: página {page} sin respuesta ({st})')
            if not out:
                return None
            page += 1
            continue
        d = json.loads(txt)
        pages = d.get('totalPages') or 1
        for i in d.get('items') or []:
            name = _clean(i.get('nameEs') or i.get('nameEu'))
            if not name or re.match(r'^\(?\s*(suspendid|cancelad|aplazad)', fold(name)) or i.get('online') in (True, 'true', 'Si', 'Sí'):
                continue
            price = _clean(i.get('priceEs'))
            ini, fin = (i.get('startDate') or '')[:10], (i.get('endDate') or i.get('startDate') or '')[:10]
            if not ini:
                continue
            web = i.get('urlEventEs') or i.get('sourceUrlEs') or i.get('purchaseUrlEs')
            out.append({
                'titulo': name[:300], 'descripcion': _clean(i.get('descriptionEs'))[:600], 'inicio': ini, 'fin': max(ini, fin),
                'hora': _clean(i.get('openingHoursEs'))[:60] or None,
                'lugar': _clean(i.get('establishmentEs') or i.get('placeEs')) or None,
                'direccion': _clean(i.get('placeEs')) or None,
                'precio': price or None, 'gratis': bool(re.search(r'\b(gratis|gratuit|doan)', fold(price))),
                'imagen': ((i.get('images') or [{}])[0] or {}).get('imageUrl'),
                'web_organizador': web, 'url': i.get('sourceUrlEs') or web,
                'municipio': i.get('municipalityEs'), 'tipo': i.get('typeEs'),
                'muni_ll': [float(i['municipalityLatitude']), float(i['municipalityLongitude'])] if i.get('municipalityLatitude') else None,
            })
        page += 1
    return out


# ---------- Agenda de Zaragoza · datos abiertos del Ayuntamiento (API de eventos, coordenadas en WGS84 con srsname)
ZGZ = 'https://www.zaragoza.es/sede/servicio/cultura/evento/list.json'


def zgz_match(city):
    return {'method': 'zaragoza'} if fold(city.get('name')) == 'zaragoza' else None


def _zgz_precio(e):
    ps = [p for p in e.get('price') or [] if isinstance(p, dict)]
    vals = [float(p.get('hasCurrencyValue') or 0) for p in ps]
    if ps and all(v == 0 for v in vals):
        return 'Gratis', True
    if vals:
        m = min(v for v in vals if v > 0)
        return (f'Desde {m:g} €' if len(set(vals)) > 1 else f'{m:g} €'), False
    return _clean(e.get('priceComment')) or None, False


def zgz_read(cfg, max_pages=20):
    out, start, total = [], 0, None
    while (total is None or start < total) and start < max_pages * 500:
        for intento in range(3):
            st, _, txt, _ = fetch(f'{ZGZ}?rows=500&start={start}&srsname=wgs84', accept=JSON, ua=UA_API)
            if st == 200:
                break
            time.sleep(5 * (intento + 1))
        if st != 200:
            print(f'  Zaragoza: página {start // 500 + 1} sin respuesta ({st})')
            return out or None
        d = json.loads(txt)
        total = d.get('totalCount') or 0
        for e in d.get('result') or []:
            name = _clean(e.get('title'))
            if not name or e.get('visible') == 'N':
                continue
            subs = [s for s in e.get('subEvent') or [] if isinstance(s, dict)]
            loc = next((s.get('location') for s in subs if s.get('location')), None) or e.get('location') or {}
            ini, fin = (e.get('startDate') or '')[:10], (e.get('endDate') or e.get('startDate') or '')[:10]
            if not ini:
                continue
            horas = [h.get('startTime') for s in subs for h in s.get('openingHours') or [] if h.get('startTime')]
            g = (loc.get('geometry') or {}).get('coordinates')
            img = e.get('image') or ''
            precio, gratis = _zgz_precio(e)
            junta = re.sub(r'^Junta (Municipal|Vecinal) (de )?', '', loc.get('junta') or '').strip() or None
            web = e.get('url') or e.get('alt')
            out.append({
                'titulo': name[:300], 'descripcion': _clean(e.get('description'))[:600], 'inicio': ini, 'fin': max(ini, fin),
                'hora': (horas[0] if ini == fin and len(set(horas)) == 1 else None),
                'lugar': _clean(loc.get('title')) or None, 'direccion': _clean(loc.get('streetAddress')) or None,
                'lat': g[1] if g and len(g) == 2 and abs(g[1]) <= 90 else None, 'lng': g[0] if g and len(g) == 2 and abs(g[0]) <= 180 else None,
                'distrito': junta, 'precio': precio, 'gratis': gratis,
                'imagen': ('https:' + img if img.startswith('//') else img) if img and '/icon/' not in img else None,
                'web_organizador': web, 'url': e.get('alt') or web,
            })
        start += 500
    return out


# ---------- Gijón/Xixón · contenidos del Ayuntamiento (Drupal JSON:API: eventos con fechas, distrito y la ficha del lugar)
GIJ = 'https://drupal.gijon.es/es/jsonapi/node/eventos'


def gij_match(city):
    return {'method': 'gijon'} if fold(city.get('name')).startswith('gijon') or fold(city.get('name')).startswith('xixon') else None


def gij_read(cfg, max_pages=40):
    hoy = dt.date.today().isoformat()
    q = {'filter[f][condition][path]': 'field_rango_de_fechas.end_value', 'filter[f][condition][operator]': '>=', 'filter[f][condition][value]': hoy,
         'page[limit]': '50', 'include': 'field_localizacion_en_el_directo'}
    url, out, pages = f'{GIJ}?{urllib.parse.urlencode(q)}', [], 0
    while url and pages < max_pages:
        for intento in range(3):
            st, _, txt, _ = fetch(url, accept='application/vnd.api+json', ua=UA_API)
            if st == 200:
                break
            time.sleep(5 * (intento + 1))
        if st != 200:
            print(f'  Gijón: página {pages + 1} sin respuesta ({st})')
            return out or None
        d = json.loads(txt)
        pages += 1
        lugares = {i['id']: i.get('attributes') or {} for i in d.get('included') or []}
        for e in d.get('data') or []:
            a = e.get('attributes') or {}
            name = _clean(a.get('title'))
            fechas = [f for f in a.get('field_rango_de_fechas') or [] if f.get('value')]
            if not name or not fechas or a.get('status') is False:
                continue
            ini = min(f['value'][:10] for f in fechas)
            fin = max((f.get('end_value') or f['value'])[:10] for f in fechas)
            if fin < hoy:
                continue
            horas = {f['value'][11:16] for f in fechas if f['value'][11:16] not in ('', '00:00')}
            rel = ((e.get('relationships') or {}).get('field_localizacion_en_el_directo') or {}).get('data') or []
            lug = lugares.get(rel[0]['id'], {}) if rel else {}
            lat = lng = None
            try:
                lat, lng = float(lug.get('field_latitud')), float(lug.get('field_longitud'))
            except (TypeError, ValueError):
                lo = (lug.get('field_lo') or [{}])[0] if isinstance(lug.get('field_lo'), list) else {}
                try:
                    lat, lng = float(lo.get('lat')), float(lo.get('lon'))
                except (TypeError, ValueError):
                    pass
            dist = a.get('field_distrito') or []
            alias = ((a.get('path') or {}).get('alias') or '').lstrip('/')
            web = f'https://www.gijon.es/es/eventos/{alias}' if alias else 'https://www.gijon.es/es/eventos'
            body = _clean((a.get('body') or {}).get('value') if isinstance(a.get('body'), dict) else a.get('body'))
            out.append({
                'titulo': name[:300], 'descripcion': body[:600], 'inicio': ini, 'fin': max(ini, fin),
                'hora': next(iter(horas)) if ini == fin and len(horas) == 1 else None,
                'lugar': _clean(lug.get('title')) or None, 'direccion': _clean(lug.get('field_direccion')) or None,
                'lat': lat, 'lng': lng, 'distrito': dist[0] if len(dist) == 1 else None,
                'precio': None, 'gratis': bool(re.search(r'\b(gratis|gratuit|entrada libre)', fold(body))),
                'imagen': None, 'web_organizador': web, 'url': web,
            })
        url = ((d.get('links') or {}).get('next') or {}).get('href')
    return out


# ---------- Barcelona · Open Data BCN (agenda diaria + agenda cultural del Ayuntamiento, CC BY 4.0)
# Las descargas de archivo (CSV/JSON) devuelven 403, pero la API del almacén de datos (CKAN datastore) responde.
BCN = 'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search_sql'
BCN_RES = ('877ccf66-9106-4ae2-be51-95a9f6469e4c', '3abb2414-1ee0-446e-9c25-380e938adb73')  # agenda diaria, agenda cultural
BCN_COLS = ('register_id,name,start_date,end_date,timetable,addresses_road_name,addresses_start_street_number,'
            'addresses_district_name,addresses_neighborhood_name,geo_epgs_4326_lat,geo_epgs_4326_lon')


BCN_EQ = 'f3721b17-bf9e-4bdd-853c-cb6200e1b442'  # equipaments de cultura i lleure: nombre de cada centro por dirección
_BCN_TIPOS = r'(c|carrer|cl|pl|placa|pg|passeig|pje|passatge|av|avda|avinguda|ctra|carretera|rda|ronda|rbla|rambla|trav|travessera|cami|via|moll|parc)'
# de más a menos claro como «lugar» de un plan; lo demás (wifi, áreas de juego, restaurantes…) no se usa
_BCN_PRIO = ['Centres cívics', 'Biblioteques municipals', 'Biblioteques', 'Teatres', 'Auditoris', 'Museus municipals', 'Museus', 'Cinemes',
             'Casals de barri comunitaris', 'Casals i espais per a joves', 'Ateneus de fabricació', 'Sales de festes', 'Tablaos flamencs',
             'Bars i pubs musicals', 'Discoteques', 'Universitats', "Casals d'avis", 'Casals infantils', 'Arxius municipals', 'Parcs i jardins']
_BCN_GEN = set('teatre teatres biblioteca auditori auditoris auditorium sala sales de del estudi d museu cinema espai jardi conferencies'.split())
# recintos que el listado nombra por una de sus partes y la gente conoce por el conjunto
_BCN_FIJOS = {'sant adria|20': 'Fabra i Coats - Fàbrica de Creació', 'palau musica|2': 'Palau de la Música Catalana'}


def _bcn_clave(via, num):
    v = re.sub(r'[^a-z0-9 ]', ' ', re.sub(r"[’'`]", ' ', fold(via or ''))).strip()
    v = re.sub(r'^' + _BCN_TIPOS + r'\b\s*', '', v)
    v = ' '.join(re.sub(r'\b(de|del|dels|d|la|les|el|els|l)\b', ' ', v).split())
    n = re.match(r'\d+', (num or '').strip())
    return f'{v}|{n.group(0)}' if v and n else None


def _bcn_equipaments():
    """Dirección → nombre del centro (Centre Cívic Vil·la Urània, Razzmatazz…), del listado municipal de equipamientos."""
    por = {}
    for off in range(0, 6000, 1000):
        sql = (f'SELECT name, addresses_road_name, addresses_start_street_number, secondary_filters_name FROM "{BCN_EQ}" '
               f'ORDER BY _id LIMIT 1000 OFFSET {off}')
        st, _, txt, _ = fetch(f'{BCN}?{urllib.parse.urlencode({"sql": sql})}', accept=JSON, ua=UA_API)
        recs = (json.loads(txt).get('result') or {}).get('records') or [] if st == 200 else []
        for r in recs:
            k, cat = _bcn_clave(r.get('addresses_road_name'), r.get('addresses_start_street_number')), r.get('secondary_filters_name')
            n = re.sub(r'\s*\*.*$', '', ' '.join((r.get('name') or '').split()))  # fuera «*Tancada temporalment», «*Poble Espanyol»…
            if k and cat in _BCN_PRIO and n and not all(w in _BCN_GEN for w in re.findall(r'[a-z]+', fold(n))):
                por.setdefault(k, []).append((_BCN_PRIO.index(cat), n))
        if len(recs) < 1000:
            break
    out = {}
    for k, v in por.items():
        p = min(x[0] for x in v)
        cuenta = {}
        for q, n in v:
            if q == p:
                cuenta[n] = cuenta.get(n, 0) + 1
        out[k] = max(cuenta, key=cuenta.get)
    out.update(_BCN_FIJOS)
    print(f'  Barcelona: {len(out)} direcciones con nombre de centro')
    return out


def bcn_match(city):
    return {'method': 'barcelona'} if fold(city.get('name')) == 'barcelona' else None


def _bcn_horario(t):
    """Del cuadro de horarios (HTML): hora de inicio si solo hay una, y el precio."""
    filas = re.findall(r'<tr(?![^>]*header)[^>]*>(.*?)</tr>', t or '', re.S)
    horas, precios = set(), []
    for f in filas:
        cel = [_clean(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', f, re.S)]
        if len(cel) >= 2:
            m = re.search(r'(\d{1,2})[.:](\d{2})', cel[1])
            if m:
                horas.add(f'{int(m.group(1)):02d}:{m.group(2)}')
        if len(cel) >= 3 and cel[2]:
            precios.append(cel[2])
    txt = ' '.join(precios)
    gratis = bool(re.search(r'gratu[iï]t|entrada lliure|acc[eé]s lliure|gratis|entrada libre', fold(txt)))
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*€', txt)
    precio = 'Gratis' if gratis and not m else (f'{m.group(1).replace(".", ",")} €' if m else None)
    return (next(iter(horas)) if len(horas) == 1 else None), precio, gratis


def bcn_read(cfg, max_rows=20000):
    hoy = dt.date.today().isoformat()
    out, vistos = [], set()
    try:
        centros = _bcn_equipaments()
    except Exception as ex:  # sin el listado se queda la dirección, como antes
        print('  Barcelona: sin listado de equipamientos', ex)
        centros = {}
    for res in BCN_RES:
        off = 0
        while off < max_rows:
            sql = (f'SELECT {BCN_COLS} FROM "{res}" WHERE end_date >= \'{hoy}\' ORDER BY _id LIMIT 1000 OFFSET {off}')
            for intento in range(3):
                st, _, txt, _ = fetch(f'{BCN}?{urllib.parse.urlencode({"sql": sql})}', accept=JSON, ua=UA_API)
                if st == 200:
                    break
                time.sleep(5 * (intento + 1))
            if st != 200:
                print(f'  Barcelona: {res[:8]} desde {off} sin respuesta ({st})')
                break
            recs = (json.loads(txt).get('result') or {}).get('records') or []
            for e in recs:
                rid = (e.get('register_id') or '').lstrip('\ufeff').strip()
                name = _clean(e.get('name'))
                ini, fin = (e.get('start_date') or '')[:10], (e.get('end_date') or e.get('start_date') or '')[:10]
                if not rid or rid in vistos or not name or not ini:
                    continue
                vistos.add(rid)
                hora, precio, gratis = _bcn_horario(e.get('timetable'))
                try:
                    lat, lng = float(e.get('geo_epgs_4326_lat')), float(e.get('geo_epgs_4326_lon'))
                except (TypeError, ValueError):
                    lat = lng = None
                calle = ' '.join(x for x in [_clean(e.get('addresses_road_name')), _clean(e.get('addresses_start_street_number'))] if x)
                centro = centros.get(_bcn_clave(e.get('addresses_road_name'), e.get('addresses_start_street_number')))
                web = f'https://guia.barcelona.cat/es/detall/{rid}_{rid}.html'
                out.append({
                    'titulo': name[:300], 'descripcion': '', 'inicio': ini, 'fin': max(ini, fin),
                    'hora': hora if ini == fin else None, 'lugar': centro or calle or None, 'direccion': calle or None,
                    'lugar_clave': calle or None,  # la clave del plan sigue siendo la dirección: si cambia el nombre del centro no se duplica
                    'lat': lat, 'lng': lng, 'distrito': _clean(e.get('addresses_district_name')) or None,
                    'precio': precio, 'gratis': gratis, 'imagen': None, 'web_organizador': web, 'url': web,
                })
            if len(recs) < 1000:
                break
            off += 1000
    return out


# ---------- Madrid · Pasea Madrid (visitas guiadas gratuitas del Ayuntamiento: patrimonio, quintas, Beti Jai…)
# La central de reservas lista cada visita con su página: título, fechas («Del 13 de noviembre al 18 de diciembre»),
# descripción y punto de encuentro. Los días y horas concretos los da un calendario de reserva aparte: entra como plan con rango.
PASEA = 'https://paseamadrid.reservaspatrimonio.es'
_MESES = {m: i + 1 for i, m in enumerate('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split())}


def pasea_match(city):
    return {'method': 'paseamadrid'} if fold(city.get('name')) == 'madrid' else None


def _texto(h):
    return _clean(re.sub(r'<(script|style)[^>]*>.*?</\1>|<!--.*?-->', ' ', h or '', flags=re.S | re.I))


def _rango(t, hoy):
    m = re.search(r'\bDel (\d{1,2}) de (\w+)(?: de (\d{4}))? al (\d{1,2}) de (\w+)(?: de (\d{4}))?', t, re.I)
    if not m or fold(m.group(2)) not in _MESES or fold(m.group(5)) not in _MESES:
        return None
    m1, m2 = _MESES[fold(m.group(2))], _MESES[fold(m.group(5))]
    if m.group(6) or m.group(3):  # con año: el que falte se deduce del otro
        y2 = int(m.group(6) or m.group(3))
        y1 = int(m.group(3) or (y2 - 1 if m1 > m2 else y2))
    else:  # sin año: la temporada en curso o la próxima (si el mes ya pasó hace mucho, es del año que viene)
        y1 = hoy.year + (1 if m1 < hoy.month - 6 else 0)
        y2 = y1 + (1 if m2 < m1 else 0)
    try:
        return dt.date(y1, m1, int(m.group(1))), dt.date(y2, m2, int(m.group(4)))
    except ValueError:
        return None


def pasea_read(cfg):
    hoy = dt.date.today()
    st, _, txt, _ = fetch(PASEA + '/')
    if st != 200:
        print('  Pasea Madrid: portada', st)
        return []
    paginas = list(dict.fromkeys(re.findall(r'href="(/\d+-[^"]+)"', txt)))
    vistos, out = {}, []
    for ruta in paginas:
        st, _, h, _ = fetch(PASEA + ruta)
        if st != 200:
            continue
        t = _texto(h)
        m = re.search(r'(Visita[^“"]*|Itinerario[^“"]*|Ruta[^“"]*)[“"]([^”"]{3,150})[”"]\s*(-\s*Personas mayores)?', t)
        r = _rango(t, hoy)
        if not m or not r or r[1] < hoy:
            continue
        mayores = bool(m.group(3))
        base = f'{m.group(1).strip().capitalize()}: {m.group(2).strip()}'
        titulo = base + (' (mayores de 65)' if mayores else '')
        desc = re.search(r'-\s*info\s+(.*?)\s+AFORO\b', t)
        punto = re.search(r'PUNTO DE ENCUENTRO\s+(.*?)\s+(?:ACCESIBILIDAD|DESCARGAR|METRO|AUTOB[ÚU]S|DURACI[ÓO]N)\b', t)
        dur = re.search(r'DURACI[ÓO]N\s+(.{1,40}?)\s+(?:OBSERVACIONES|SELECCIONE)', t)
        texto = (desc.group(1) if desc else '')[:900]
        extra = ' '.join(x for x in [f'Duración: {dur.group(1)}.' if dur else '', 'Gratis, con inscripción previa en la central de reservas de Pasea Madrid.',
                                     'Solo para mayores de 65 años.' if mayores else ''] if x)
        e = {'titulo': titulo[:300], 'descripcion': (texto + ' ' + extra).strip(), 'inicio': r[0].isoformat(), 'fin': r[1].isoformat(),
             'hora': None, 'lugar': punto.group(1).strip()[:200] if punto else None, 'direccion': punto.group(1).strip()[:200] if punto else None,
             'lat': None, 'lng': None, 'distrito': None, 'precio': 'Gratis', 'gratis': True, 'imagen': None,
             'web_organizador': PASEA + ruta, 'url': PASEA + ruta}
        # si la misma visita existe para todos los públicos, la de mayores no se repite
        if base in vistos:
            if not mayores and vistos[base]['_mayores']:
                out.remove(vistos[base])
            else:
                continue
        e['_mayores'] = mayores
        vistos[base] = e
        out.append(e)
    for e in out:
        e.pop('_mayores', None)
    print(f'  Pasea Madrid: {len(out)} visitas de {len(paginas)} páginas')
    return out


# ---------- Ticketmaster · Discovery API (grandes conciertos, festivales, espectáculos y deporte con entradas a la venta)
# Clave en el secreto TICKETMASTER_KEY. 5.000 llamadas/día y 5 por segundo: se pide por meses (máx. 1.000 resultados por consulta)
# alrededor del centro de la zona; el filtro de zona del motor deja solo lo de la ciudad (o de la provincia sin sus ciudades).
TM = 'https://app.ticketmaster.com/discovery/v2/events.json'
TM_NO = re.compile(r'parking|aparcamiento|\bvip\b|paquete|package|upgrade|hospitality|merchandising|fast ?track|early entry|'
                   r'acceso preferente|meet ?& ?greet|abono de temporada|suite|palco|gift card|tarjeta regalo', re.I)
TM_SEG = {'Music': 'Música', 'Sports': 'Deporte', 'Arts & Theatre': 'Artes escénicas', 'Film': 'Cine', 'Miscellaneous': 'Otros'}


def tm_match(city):
    return None  # se da de alta a mano por zona (config: latlong, radio, excluir)


def _tm_get(params):
    import os
    key = os.environ.get('TICKETMASTER_KEY')
    if not key:
        print('  Ticketmaster: falta el secreto TICKETMASTER_KEY')
        return None
    q = dict(params, apikey=key, countryCode='ES', locale='es-es,*', size=199)
    for intento in range(3):
        time.sleep(0.25)
        st, _, txt, _ = fetch(f'{TM}?{urllib.parse.urlencode(q)}', accept=JSON, ua=UA_API)
        if st == 200:
            return json.loads(txt)
        if st in (401, 403):
            print('  Ticketmaster: clave rechazada', st)
            return None
        time.sleep(3 * (intento + 1))
    print('  Ticketmaster: sin respuesta', st)
    return None


def tm_read(cfg):
    hoy = dt.date.today()
    dias = int(cfg.get('horizonte_dias') or 365)
    excluir = re.compile(cfg['excluir'], re.I) if cfg.get('excluir') else None
    out, vistos, fallos = [], set(), 0
    a = hoy
    while a < hoy + dt.timedelta(days=dias):
        b = min(a + dt.timedelta(days=31), hoy + dt.timedelta(days=dias))
        page = 0
        while True:
            d = _tm_get({'latlong': cfg['latlong'], 'radius': cfg.get('radio', 25), 'unit': 'km', 'sort': 'date,asc', 'page': page,
                         'startDateTime': f'{a.isoformat()}T00:00:00Z', 'endDateTime': f'{b.isoformat()}T00:00:00Z'})
            if d is None:
                fallos += 1
                break
            for e in (d.get('_embedded') or {}).get('events') or []:
                st = ((e.get('dates') or {}).get('status') or {}).get('code')
                if st in ('cancelled', 'postponed') or TM_NO.search(e.get('name') or ''):
                    continue
                ini = ((e.get('dates') or {}).get('start') or {})
                fecha = ini.get('localDate')
                v = ((e.get('_embedded') or {}).get('venues') or [{}])[0]
                lugar = (v.get('name') or '').strip()
                if not fecha or (excluir and excluir.search(lugar)):
                    continue
                titulo = _clean(e.get('name'))[:300]
                clave = (fold(titulo), fecha, fold(lugar))
                if clave in vistos:
                    continue
                vistos.add(clave)
                pr = (e.get('priceRanges') or [{}])[0]
                precio = None
                if pr.get('min'):
                    precio = f"Desde {pr['min']:.0f} €" if not pr.get('max') or pr['max'] == pr['min'] else f"{pr['min']:.0f}–{pr['max']:.0f} €"
                cl = (e.get('classifications') or [{}])[0]
                genero = ' · '.join(x for x in [TM_SEG.get((cl.get('segment') or {}).get('name'), ''),
                                                 (cl.get('genre') or {}).get('name') if (cl.get('genre') or {}).get('name') not in (None, 'Undefined', 'Otros') else ''] if x)
                venta = ((e.get('sales') or {}).get('public') or {}).get('startDateTime') or ''
                aviso = ''
                if venta[:10] > hoy.isoformat():
                    aviso = f"Entradas a la venta desde el {dt.date.fromisoformat(venta[:10]).strftime('%d/%m/%Y')}."
                desc = ' '.join(x for x in [_clean(e.get('info') or '')[:500], f'Género: {genero}.' if genero else '', aviso,
                                             'Entradas en Ticketmaster.'] if x)
                loc = v.get('location') or {}
                try:
                    lat, lng = float(loc.get('latitude')), float(loc.get('longitude'))
                except (TypeError, ValueError):
                    lat = lng = None
                dirn = ', '.join(x for x in [(v.get('address') or {}).get('line1'), v.get('postalCode')] if x) or None
                out.append({'titulo': titulo, 'descripcion': desc, 'inicio': fecha, 'fin': fecha,
                            'hora': (ini.get('localTime') or '')[:5] or None, 'lugar': lugar or None, 'direccion': dirn,
                            'lat': lat, 'lng': lng, 'distrito': None, 'municipio': (v.get('city') or {}).get('name'),
                            'precio': precio, 'gratis': False, 'imagen': None,
                            'web_organizador': e.get('url'), 'url': e.get('url')})
            pg = d.get('page') or {}
            page += 1
            if page >= (pg.get('totalPages') or 0) or page * 199 >= 1000:
                break
        a = b
    if fallos and not out:
        return None
    print(f'  Ticketmaster: {len(out)} eventos')
    return out


CONNECTORS = {
    'kulturklik': {'name': 'Kulturklik · Agenda cultural de Euskadi', 'url': 'https://www.kulturklik.euskadi.eus/', 'layer': 'regional',
                   'license': 'Open Data Euskadi (CC BY 4.0)', 'match': kk_match, 'read': kk_read},
    'zaragoza': {'name': 'Agenda de Zaragoza (datos abiertos del Ayuntamiento)', 'url': 'https://www.zaragoza.es/sede/servicio/cultura/evento/',
                 'layer': 'municipal', 'license': 'Datos abiertos del Ayuntamiento de Zaragoza (CC BY 4.0)', 'match': zgz_match, 'read': zgz_read},
    'gijon': {'name': 'Agenda del Ayuntamiento de Gijón/Xixón', 'url': 'https://www.gijon.es/es/eventos', 'layer': 'municipal',
              'license': 'Enlace a la ficha original', 'match': gij_match, 'read': gij_read},
    'barcelona': {'name': 'Agenda de Barcelona (Open Data BCN: agenda diaria y cultural)', 'url': 'https://guia.barcelona.cat/es/agenda',
                  'layer': 'municipal', 'license': 'Open Data BCN (CC BY 4.0)', 'match': bcn_match, 'read': bcn_read},
    'paseamadrid': {'name': 'Pasea Madrid (visitas guiadas del Ayuntamiento)', 'url': PASEA, 'layer': 'municipal',
                    'license': 'Enlace a la ficha original', 'match': pasea_match, 'read': pasea_read},
    'ticketmaster': {'name': 'Ticketmaster (grandes conciertos y espectáculos)', 'url': 'https://www.ticketmaster.es/', 'layer': 'recinto',
                     'license': 'Ticketmaster Discovery API (enlace a la compra)', 'match': tm_match, 'read': tm_read},
}


def suggest(city):
    """Fuentes de conector que cubren esta ciudad, listas para insertar en `sources`."""
    rows = []
    for key, c in CONNECTORS.items():
        try:
            cfg = c['match'](city)
        except Exception as ex:
            print(f'  conector {key}: {type(ex).__name__}'); cfg = None
        if cfg:
            rows.append({'city_id': city['id'], 'name': c['name'], 'url': c['url'], 'layer': c['layer'], 'method': None,
                         'license': c['license'], 'active': False, 'status': 'candidata', 'notes': 'API pública conocida',
                         'config': dict(cfg, descubierta=dt.date.today().isoformat(), ambito='conector')})
    return rows


def read(cfg):
    c = CONNECTORS.get(cfg.get('method'))
    return c['read'](cfg) if c else None
