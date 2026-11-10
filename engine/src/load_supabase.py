"""Carga out/events.json en Supabase (upsert idempotente).

Uso: python3 src/load_supabase.py [ruta a un .env]  (o variables de entorno SUPABASE_URL y SUPABASE_SECRET)
Se puede ejecutar cada noche: actualiza por ext_key y reemplaza sesiones y categorías.
"""
import gzip
import json, sys, hashlib, re, unicodedata, urllib.request, urllib.error
def http_only(u):
    """Las URLs de las fuentes se guardan solo si son http(s): un «javascript:» en una web rastreada no debe llegar a la app."""
    u = (u or '').strip()
    # la IA a veces devuelve el enlace entre ‹ › (como se lo damos) pegado a la web base: se queda solo el de dentro
    m = re.search(r'(?:‹|%E2%80%B9)(.+?)(?:›|%E2%80%BA)', u, re.I)
    if m:
        u = m.group(1).strip()
    u = re.sub(r'(?i)^(https?):/(?!/)', r'\1://', u)
    if re.match(r'(?i)https?://', u):
        return u
    # «www.sala.es/agenda» sin esquema (pasa en algunas fuentes): se completa; cualquier otra cosa se descarta
    return 'https://' + u if re.match(r'(?i)^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$', u) else None


import os
env = dict(l.strip().split('=', 1) for l in open(sys.argv[1]) if '=' in l) if len(sys.argv) > 1 else os.environ
URL, KEY = env['SUPABASE_URL'].rstrip('/'), env['SUPABASE_SECRET']
CITY = os.environ.get('BUREO_CITY', 'madrid')
PFX = '' if CITY == 'madrid' else CITY + '|'  # Madrid conserva sus claves de siempre


def norm(t):
    t = unicodedata.normalize('NFD', (t or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', t)).strip()


def api(method, path, body=None, prefer=None):
    req = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header('apikey', KEY)
    req.add_header('Authorization', 'Bearer ' + KEY)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept-Encoding', 'gzip')  # respuestas comprimidas: mucho menos cupo de transferencia de Supabase
    if prefer:
        req.add_header('Prefer', prefer)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            _b = r.read()
            txt = (gzip.decompress(_b) if r.headers.get('Content-Encoding') == 'gzip' else _b).decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path}: {e.code} {e.read().decode()[:500]}')


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


data = json.load(open(os.path.join(os.environ.get('BUREO_OUT', 'out'), 'events.json')))
evs = data['eventos']
sources = {s['name']: s['id'] for s in api('GET', f'sources?select=id,name&city_id=eq.{CITY}')}
cats_ok = {c['id'] for c in api('GET', 'categories?select=id')}

# 1) recintos
venues = {}
for e in evs:
    if e.get('lugar'):
        k = norm(e['lugar'])[:200]
        if k and k not in venues:
            venues[k] = {'city_id': CITY, 'name': e['lugar'], 'name_key': k, 'district': e.get('distrito'),
                         'lat': e.get('lat'), 'lng': e.get('lng')}
        d = (e.get('direccion') or '').strip()[:200]
        if k and d and not venues[k].get('address') and norm(d) != k:
            venues[k]['address'] = d
vid = {}
# los recintos sin coordenadas (o sin dirección) no borran las que ya tenía la base (p. ej. corregidas a mano):
# se mandan en grupos con las mismas columnas
grupos = {}
for v in venues.values():
    cols = ('city_id', 'name', 'name_key') + (('district', 'lat', 'lng') if v.get('lat') is not None else ()) + (('address',) if v.get('address') else ())
    grupos.setdefault(cols, []).append({c: v.get(c) for c in cols})
for group in grupos.values():
    for part in chunks(group, 500):
        for r in api('POST', 'venues?on_conflict=city_id,name_key&select=id,name_key', part,
                     'resolution=merge-duplicates,return=representation'):
            vid[r['name_key']] = r['id']
print('recintos', len(vid))

# 2) eventos
rows, seen = [], set()
for e in evs:
    k = hashlib.md5(f"{PFX}{norm(e['titulo'])}|{norm(e.get('lugar_clave') or e.get('lugar') or '')}|{e['inicio']}".encode()).hexdigest()
    if k in seen:
        continue
    seen.add(k)
    e['_key'] = k
    rows.append({
        'ext_key': k, 'city_id': CITY, 'title': e['titulo'][:500], 'description': e.get('descripcion') or None,
        'starts_on': e['inicio'], 'ends_on': max(e['inicio'], e['fin']), 'time_text': e.get('hora') if re.search(r'\w', e.get('hora') or '') else None,
        'venue_id': vid.get(norm(e.get('lugar') or '')[:200]), 'district': e.get('distrito'),
        'lat': e.get('lat'), 'lng': e.get('lng'), 'price_text': e.get('precio'), 'is_free': bool(e.get('gratis')),
        'image_url': http_only(e.get('imagen')), 'organizer_url': http_only(e.get('web_organizador')),
        'is_unique': bool(e.get('unico')), 'is_featured': bool(e.get('destacado')),
    })
    if PFX:  # en las demás ciudades «único» lo decide unicos.py después de clasificar: no se pisa
        rows[-1].pop('is_unique')
# 2b) mismo plan ya cargado por otra vía (p. ej. Conde Duque o Matadero, que también salen en la agenda municipal):
#     si coincide la fecha de inicio y el título (normalizado, o uno empieza por el otro), se añade la fuente al evento
#     que ya existe en lugar de crear un duplicado; sus sesiones y categorías no se tocan
import datetime as _d0
desde = (_d0.date.today() - _d0.timedelta(days=2)).isoformat()
mios = {r['ext_key'] for r in rows}
prev = {}
off = 0
while True:
    got = api('GET', f'events?select=id,ext_key,title,starts_on,venue_id,lat,lng&city_id=eq.{CITY}&ends_on=gte.{desde}&order=id&offset={off}&limit=1000')
    for r in got:
        if r['ext_key'] not in mios:
            prev.setdefault(r['starts_on'], []).append((norm(r['title']), r['id'], r['ext_key'], r['venue_id'], r['lat'], r['lng']))
    if len(got) < 1000:
        break
    off += 1000
ajenos, ajenos_keys, sin_lugar = {}, [], {}
import difflib as _dl

def igual(a, b):
    if a == b or (min(len(a), len(b)) >= 12 and (a.startswith(b) or b.startswith(a))):
        return True
    # el mismo título en catalán y en castellano («Gèneres Fantàstics» / «Géneros Fantásticos»): casi idéntico y largo
    if min(len(a), len(b)) >= 20 and _dl.SequenceMatcher(None, a, b).ratio() >= 0.88:
        return True
    # las mismas palabras en otro orden (al menos 3 con contenido)
    ta, tb = {w for w in a.split() if len(w) >= 4}, {w for w in b.split() if len(w) >= 4}
    return min(len(ta), len(tb)) >= 3 and (ta <= tb or tb <= ta)
for r in rows:
    t = norm(r['title'])
    # los títulos cortos se unen solo si además es el mismo sitio; los genéricos («Club de lectura», «Cuentacuentos») con más exigencia
    generico = t.startswith(('club de lectura', 'cuentacuentos', 'visita guiada', 'visitas guiadas', 'taller', 'concierto', 'cine', 'exposicion',
                             'charla', 'conferencia', 'hora del cuento')) or len(t) < 8
    def cerca(v, la, lo):
        if v and v == r['venue_id']:
            return True
        if la is None or r.get('lat') is None:  # sin coordenadas para comparar: basta un título que no sea genérico
            return not generico
        m = 1 if generico else 2.5  # 600 m para títulos genéricos; 1,5 km para el resto (las fuentes sitúan distinto un mismo recinto)
        return abs(la - r['lat']) < 0.0055 * m and abs(lo - r['lng']) < 0.0075 * m
    hit = next(((i, k, v) for (pt, i, k, v, la, lo) in prev.get(r['starts_on'], []) if igual(t, pt) and (len(t) >= 20 or cerca(v, la, lo))), None)
    if hit:
        ajenos[r['ext_key']] = hit[0]
        ajenos_keys.append(hit[1])
        if not hit[2] and r.get('venue_id'):  # el que ya estaba no tenía lugar y ahora sí lo sabemos
            sin_lugar.setdefault(r['venue_id'], []).append(hit[0])
if ajenos:
    print('ya estaban por otra fuente', len(ajenos))
for v, ids_ in sin_lugar.items():
    for part in chunks(sorted(set(ids_)), 200):
        api('PATCH', 'events?venue_id=is.null&id=in.(' + ','.join(map(str, part)) + ')', {'venue_id': v}, 'return=minimal')
if sin_lugar:
    print('lugar añadido a', sum(len(x) for x in sin_lugar.values()), 'eventos que no lo tenían')
rows = [r for r in rows if r['ext_key'] not in ajenos]

eid = dict(ajenos)
for part in chunks(rows, 400):
    for r in api('POST', 'events?on_conflict=ext_key&select=id,ext_key', part,
                 'resolution=merge-duplicates,return=representation'):
        eid[r['ext_key']] = r['id']
print('eventos', len(eid))

# 3) sesiones, categorías y fuentes (se reemplazan)
#    Las categorías de los eventos ya clasificados con IA no se tocan: las reglas solo sirven de pista inicial.
ids = [i for k, i in eid.items() if k not in ajenos]
ai_done = set()
for part in chunks(ids, 300):
    flt = 'id=in.(' + ','.join(map(str, part)) + ')'
    ai_done |= {r['id'] for r in api('GET', 'events?select=id&ai_hash=not.is.null&' + flt)}
sess, cats, srcs = [], [], []
for e in evs:
    i = eid.get(e.get('_key'))
    if not i:
        continue
    if e['_key'] in ajenos:  # solo se añade la fuente
        srcs += [{'event_id': i, 'source_id': sources[f['nombre']], 'url': http_only(f.get('url'))} for f in e['fuentes'] if f['nombre'] in sources]
        continue
    sess += [{'event_id': i, 'on_date': d} for d in sorted(set(e['sesiones']))]
    if i not in ai_done:
        cats += [{'event_id': i, 'category_id': c} for c in dict.fromkeys(e['cats']) if c in cats_ok]
    for f in e['fuentes']:
        if f['nombre'] in sources:
            srcs.append({'event_id': i, 'source_id': sources[f['nombre']], 'url': http_only(f.get('url'))})
# sin filas repetidas en un mismo envío (pasa cuando dos fichas nuevas se unen al mismo plan que ya existía)
def unicas(rws, campos):
    vistos, out = set(), []
    for r in rws:
        k = tuple(r[c] for c in campos)
        if k not in vistos:
            vistos.add(k)
            out.append(r)
    return out
sess, cats, srcs = unicas(sess, ('event_id', 'on_date')), unicas(cats, ('event_id', 'category_id')), unicas(srcs, ('event_id', 'source_id'))
# sesiones y categorías: borrar y poner las nuevas en una sola transacción por bloque (si falla, se queda lo que había)
por_ev_s, por_ev_c = {}, {}
for r in sess:
    por_ev_s.setdefault(r['event_id'], []).append(r)
for r in cats:
    por_ev_c.setdefault(r['event_id'], []).append(r)
for part in chunks(ids, 300):
    api('POST', 'rpc/replace_event_children', {
        'p_ids': part, 'p_rule': [i for i in part if i not in ai_done],
        'p_sess': [r for i in part for r in por_ev_s.get(i, [])], 'p_cats': [r for i in part for r in por_ev_c.get(i, [])]})
print('event_sessions', len(sess))
print('event_categories', len(cats))
for part in chunks(srcs, 1000):
    api('POST', 'event_sources?on_conflict=event_id,source_id', part, 'resolution=merge-duplicates,return=minimal')
print('event_sources', len(srcs))
# 4) ciudades del motor genérico: retirar lo que ya no publica ninguna de sus fuentes (si todas se leyeron bien)
leidas = [sources[n] for n in (data.get('meta') or {}).get('por_fuente', {}) if n in sources]
if PFX and leidas:
    print('retirados', api('POST', 'rpc/retire_stale_events', {'p_city': CITY, 'p_keep': [r['ext_key'] for r in rows] + ajenos_keys, 'p_sources': leidas}))
elif not PFX and (data.get('meta') or {}).get('ventana'):
    # Madrid: también se retiran los planes aplazados o cancelados, pero solo dentro de la ventana leída, solo de las fuentes
    # que hoy han traído un número normal de planes, y nunca más de un 10 % de golpe (eso sería un fallo de lectura)
    hasta = data['meta']['ventana'][1]
    cuenta = {}
    for e in evs:
        for f in e['fuentes']:
            cuenta[f['nombre']] = cuenta.get(f['nombre'], 0) + 1
    ok_ids = []
    for s_ in api('GET', 'sources?select=id,name,events_last&city_id=eq.madrid&id=in.(' + ','.join(str(sources[n]) for n in cuenta if n in sources) + ')') if any(n in sources for n in cuenta) else []:
        n, antes = cuenta.get(s_['name'], 0), s_.get('events_last') or 0
        if antes >= 3 and n < 0.7 * antes:
            print(f"  {s_['name']}: solo {n} planes (antes {antes}): no se retira nada suyo hoy")
            continue
        ok_ids.append(s_['id'])
        api('PATCH', f"sources?id=eq.{s_['id']}", {'events_last': n}, 'return=minimal')
    if ok_ids:
        args = {'p_city': CITY, 'p_keep': [r['ext_key'] for r in rows] + ajenos_keys, 'p_sources': ok_ids, 'p_until': hasta}
        n = api('POST', 'rpc/retire_stale_events_window', dict(args, p_dry=True))
        total = len(eid) + sum(len(v) for v in prev.values())
        if n > max(30, 0.1 * total):
            print(f'retirar {n} de {total} parece un fallo de lectura: no se retira nada')
        else:
            print('retirados', api('POST', 'rpc/retire_stale_events_window', dict(args, p_dry=False)))
import datetime as _dt
api('PATCH', f'sources?city_id=eq.{CITY}&status=eq.activa', {'last_run_at': _dt.datetime.now(_dt.timezone.utc).isoformat()}, 'return=minimal')
print('ok')
