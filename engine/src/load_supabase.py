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


def fuente_floja(n, antes):
    """Madrid: una fuente que solía traer 3 planes o más y hoy trae menos del 70 % no se da por leída (no se retira nada suyo)."""
    return antes >= 3 and n < 0.7 * antes


def retirada_sospechosa(n, total):
    """Retirar de golpe más de 30 planes y más del 10 % de los que hay parece un fallo de lectura: no se retira nada."""
    return n > max(30, 0.1 * total)


import os
import calidad as C  # limpieza común de hora, título, lugar y dirección
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
# el mismo plan repetido dentro de la carga (misma ficha de origen, o el mismo título «envuelto» de otra forma en el mismo
# sitio y día) se queda en una sola tarjeta; la sobrante que hubiera en la base la retira el paso 4
for e in evs:  # «Sala X, Calle Mayor 3» → lugar «Sala X» y dirección «Calle Mayor 3»
    e['lugar'], _d = C.lugar_dir(e.get('lugar'), e.get('direccion'))
    if _d:
        e['direccion'] = _d
_raras = [e for e in evs if C.fecha_rara(e)]
if _raras:  # p. ej. «Concierto de Año Nuevo» el 12 de noviembre (la fecha de venta)
    print('fechas que no cuadran con el título, fuera:', len(_raras), '·', '; '.join(f"{e['titulo'][:40]} ({e['inicio']})" for e in _raras[:5]))
    evs = [e for e in evs if not C.fecha_rara(e)]
evs, _unidos = C.unir_duplicados(evs)
if _unidos:
    print('repetidos unidos en esta carga', _unidos)
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
        elif k and not venues[k].get('district') and e.get('distrito'):
            venues[k]['district'] = e['distrito']
        d = (e.get('direccion') or '').strip()[:200]
        if k and d and not venues[k].get('address') and norm(d) != k:
            venues[k]['address'] = d
vid, vdist = {}, {}
# los recintos sin coordenadas (o sin dirección) no borran las que ya tenía la base (p. ej. corregidas a mano):
# se mandan en grupos con las mismas columnas
grupos = {}
for v in venues.values():
    # el barrio vacío tampoco borra el que ya tenía (antes se perdía cada noche si el plan no lo traía)
    cols = (('city_id', 'name', 'name_key') + (('lat', 'lng') if v.get('lat') is not None else ())
            + (('district',) if v.get('lat') is not None and v.get('district') else ()) + (('address',) if v.get('address') else ()))
    grupos.setdefault(cols, []).append({c: v.get(c) for c in cols})
for group in grupos.values():
    for part in chunks(group, 500):
        for r in api('POST', 'venues?on_conflict=city_id,name_key&select=id,name_key,district', part,
                     'resolution=merge-duplicates,return=representation'):
            vid[r['name_key']] = r['id']; vdist[r['name_key']] = r.get('district')
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
        'ext_key': k, 'city_id': CITY, 'title': C.titulo_limpio(e['titulo'])[:500],  # la clave (k) sale del título original 'description': e.get('descripcion') or None,
        'starts_on': e['inicio'], 'ends_on': max(e['inicio'], e['fin']), 'time_text': C.norm_hora(e.get('hora')) or (C.hora_de_texto(e.get('descripcion')) if e['inicio'] == e['fin'] else None),  # la hora de la descripción solo en planes de un día (en una exposición sería la de la inauguración)
        'venue_id': vid.get(norm(e.get('lugar') or '')[:200]), 'district': e.get('distrito') or vdist.get(norm(e.get('lugar') or '')[:200]),
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
prev, extra, ya_estan, de_fuera = {}, {}, set(), {}
# fuentes leídas en esta carga: un plan de la base que solo viene de ellas y hoy no aparece es un sobrante (lo retira el paso 4)
fuentes_hoy = {sources[n] for n in ((data.get('meta') or {}).get('por_fuente') or {f['nombre'] for e in evs for f in e['fuentes']}) if n in sources}
off = 0
while True:
    got = api('GET', f'events?select=id,ext_key,title,starts_on,time_text,venue_id,lat,lng,venues(name),event_sources(url,source_id)&city_id=eq.{CITY}&ends_on=gte.{desde}&order=id&offset={off}&limit=1000')
    for r in got:
        if r['ext_key'] not in mios:
            prev.setdefault(r['starts_on'], []).append((norm(r['title']), r['id'], r['ext_key'], r['venue_id'], r['lat'], r['lng']))
            extra[r['id']] = (r['title'], r.get('time_text'), (r.get('venues') or {}).get('name'),
                              {u for u in (C.url_ficha(x.get('url')) for x in r.get('event_sources') or []) if u})
        else:
            ya_estan.add(r['ext_key'])
        de_fuera[r['id']] = any(x.get('source_id') not in fuentes_hoy for x in r.get('event_sources') or [])
    if len(got) < 1000:
        break
    off += 1000
ajenos, ajenos_keys, sin_lugar, cambio_clave = {}, [], {}, {}
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
_ev = {e['_key']: e for e in evs if e.get('_key')}
_uso = {}
for e in evs:
    for u in {C.url_ficha(f.get('url')) for f in e.get('fuentes') or []} - {None}:
        _uso[u] = _uso.get(u, 0) + 1


def mismo_plan(r, pid, la, lo):
    """El plan r de hoy y el que ya está en la base (pid), que empiezan el mismo día, ¿son el mismo? Misma ficha de origen,
    o mismo título sin envoltorio en el mismo sitio y sin horas de inicio distintas."""
    e, (pt, ph, pl, purls) = _ev[r['ext_key']], extra[pid]
    if purls & {u for u in (C.url_ficha(f.get('url')) for f in e.get('fuentes') or []) if u and _uso.get(u, 0) <= 3}:
        return True
    ha, hb = C._hora1(r.get('time_text')), C._hora1(ph)
    if (ha and hb and ha != hb) or not C.mismo_titulo(r['title'], pt):
        return False
    return C.mismo_sitio({'lugar': e.get('lugar'), 'lat': r.get('lat'), 'lng': r.get('lng')}, {'lugar': pl, 'lat': la, 'lng': lo})


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
    # un plan que ya tiene su fila no se cede a un gemelo que solo viene de las fuentes de hoy (ese gemelo es el sobrante:
    # se retira en el paso 4); sí a uno de fuera de esta carga (el de un organizador, o el de la otra carga de Madrid)
    cand = [x for x in prev.get(r['starts_on'], []) if not (r['ext_key'] in ya_estan and not de_fuera.get(x[1]))]
    hit = next(((i, k, v) for (pt, i, k, v, la, lo) in cand if igual(t, pt) and (len(t) >= 20 or cerca(v, la, lo))), None)
    if not hit:
        hit = next(((i, k, v) for (pt, i, k, v, la, lo) in cand if mismo_plan(r, i, la, lo)), None)
    if hit and r['ext_key'] not in ya_estan and not de_fuera.get(hit[0]) and hit[0] not in cambio_clave:
        # el mismo plan de las mismas fuentes con otra clave (la fuente ha retocado el título o el nombre del lugar): la fila
        # de siempre toma la clave nueva y se actualiza como cualquier otra, en vez de quedarse congelada con los datos viejos
        cambio_clave[hit[0]] = r['ext_key']
        continue
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
for _id, _k in cambio_clave.items():
    api('PATCH', f'events?id=eq.{_id}', {'ext_key': _k}, 'return=minimal')
if cambio_clave:
    print('planes que conservan su ficha con la clave nueva', len(cambio_clave))

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
elif not PFX and leidas and not (data.get('meta') or {}).get('ventana'):
    # fuentes de Madrid leídas con el motor genérico (salas, clubes…): antes no se retiraba nada suyo y los planes repetidos
    # o cancelados se quedaban; se retira con el mismo tope de seguridad que el resto de Madrid (nunca más de un 10 %)
    args = {'p_city': CITY, 'p_keep': [r['ext_key'] for r in rows] + ajenos_keys, 'p_sources': leidas, 'p_until': '2099-12-31'}
    n = api('POST', 'rpc/retire_stale_events_window', dict(args, p_dry=True))
    if n > max(30, 0.1 * len(eid)):
        print(f'retirar {n} con {len(eid)} planes leídos parece un fallo de lectura: no se retira nada')
    else:
        print('retirados', api('POST', 'rpc/retire_stale_events_window', dict(args, p_dry=False)))
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
        if fuente_floja(n, antes):
            print(f"  {s_['name']}: solo {n} planes (antes {antes}): no se retira nada suyo hoy")
            continue
        ok_ids.append(s_['id'])
        api('PATCH', f"sources?id=eq.{s_['id']}", {'events_last': n}, 'return=minimal')
    if ok_ids:
        args = {'p_city': CITY, 'p_keep': [r['ext_key'] for r in rows] + ajenos_keys, 'p_sources': ok_ids, 'p_until': hasta}
        n = api('POST', 'rpc/retire_stale_events_window', dict(args, p_dry=True))
        total = len(eid) + sum(len(v) for v in prev.values())
        if retirada_sospechosa(n, total):
            print(f'retirar {n} de {total} parece un fallo de lectura: no se retira nada')
        else:
            print('retirados', api('POST', 'rpc/retire_stale_events_window', dict(args, p_dry=False)))
import datetime as _dt
api('PATCH', f'sources?city_id=eq.{CITY}&status=eq.activa', {'last_run_at': _dt.datetime.now(_dt.timezone.utc).isoformat()}, 'return=minimal')
print('ok')
