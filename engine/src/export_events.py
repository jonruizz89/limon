"""Exporta los planes vigentes de cada zona a web/datos/eventos-<zona>.json para que la app los descargue de la CDN
(un archivo estático, comprimido y en caché) en lugar de pedírselos a Supabase en cada apertura.

Uso: python3 src/export_events.py ../web
Formato compacto (formato 2): claves cortas, sin nulos ni falsos, nombres de fuente en una lista aparte y
coordenadas a 5 decimales; la app (data.js → desdeCompacto) lo devuelve a la forma de la consulta de Supabase.
Pesa la mitad sin comprimir (menos que leer en el móvil) y un 15–35 % menos comprimido.
"""
import gzip
import datetime as dt, json, os, re, sys, urllib.parse, urllib.request

WEB = sys.argv[1] if len(sys.argv) > 1 else '../web'
cfg = open(os.path.join(WEB, 'config.js'), encoding='utf-8').read()
SB_URL = re.search(r"supabaseUrl:\s*'([^']+)'", cfg).group(1)
SB_KEY = re.search(r"supabaseKey:\s*'([^']+)'", cfg).group(1)  # clave pública: lo mismo que ve la app
COLS = ('id,city_id,title,description,starts_on,ends_on,time_text,district,price_text,is_free,image_url,organizer_url,'
        'is_unique,is_featured,ai_unique,topics,series,lat,lng,first_seen_at,venues(name,address),event_sessions(on_date),'
        'event_categories(category_id),event_sources(url,sources(name))')


def _get(path):
    out, off = [], 0
    while True:
        req = urllib.request.Request(f'{SB_URL}/rest/v1/{path}&offset={off}&limit=1000',
                                     headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Accept-Encoding': 'gzip'})
        with urllib.request.urlopen(req, timeout=180) as r:
            _b = r.read()
            part = json.loads((gzip.decompress(_b) if r.headers.get('Content-Encoding') == 'gzip' else _b).decode())
        out += part
        if len(part) < 1000:
            return out
        off += 1000



# Copia local de las lecturas (SB_CACHE_DIR): al publicar solo cambios de código (push) se reutiliza la última lectura en vez de
# volver a descargar toda la base de datos, que es lo que más consume del cupo de transferencia de Supabase.
import hashlib as _hl
def _cache_get(path, fetch):
    cdir = os.environ.get('SB_CACHE_DIR')
    if not cdir:
        return fetch(path)
    f = os.path.join(cdir, _hl.sha1(path.encode()).hexdigest() + '.json')
    fresca = os.environ.get('SB_CACHE_FRESH') and re.search(os.environ['SB_CACHE_FRESH'], path)  # p. ej. solo los cortes, tras leer cortes nuevos
    if os.environ.get('SB_CACHE_USE') == '1' and os.path.exists(f) and not fresca:
        return json.load(open(f, encoding='utf-8'))
    out = fetch(path)
    os.makedirs(cdir, exist_ok=True)
    json.dump(out, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return out


def get(path):
    return _cache_get(path, _get)

hoy = dt.datetime.now(dt.timezone(dt.timedelta(hours=1))).date().isoformat()
ahora = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
d = os.path.join(WEB, 'datos')
os.makedirs(d, exist_ok=True)
def dump(nombre, datos):
    json.dump(datos, open(os.path.join(d, nombre + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# lo que la app necesita para arrancar, también en estático: si Supabase no responde (p. ej. bloqueos de IPs de
# Cloudflare los días de partido), la app abre igual con planes y cortes; solo fallan las funciones de cuenta
ciudades = get('cities?select=id,name,region,lat,lng,bbox,districts,stadiums,features,status,position,kind,parent,munis&order=position')
dump('ciudades', {'generado': ahora, 'ciudades': ciudades})
dump('taxonomia', {'generado': ahora,
                   'grupos': get('category_groups?select=id,name,position&order=position'),
                   'categorias': get('categories?select=id,group_id,label,position&is_generic=eq.false&order=position')})
for c in ciudades:
    dump(f"fuentes-{c['id']}", {'generado': ahora, 'fuentes': get(f"sources?select=name,url,method,license,last_run_at&city_id=eq.{c['id']}&status=eq.activa&order=id")})
    dump(f"cortes-{c['id']}", {'generado': ahora, 'cortes': get(f"closures?select=title,kind,summary,streets,lines,stations,district,ranges,source_url,source_name,geom&city_id=eq.{c['id']}&order=id")})
def compacto(zona, evs):
    fuentes, idx, out = [], {}, []
    for e in evs:
        r = {'i': e['id'], 't': e['title'], 's': e['starts_on']}
        if e['ends_on'] != e['starts_on']:
            r['f'] = e['ends_on']
        for k, c in (('description', 'de'), ('time_text', 'h'), ('district', 'd'), ('price_text', 'p'), ('image_url', 'im'),
                     ('series', 'se'), ('topics', 'tp')):
            if e.get(k):
                r[c] = e[k]
        if e.get('is_free'):
            r['g'] = 1
        if e.get('is_unique') or e.get('ai_unique'):
            r['u'] = 1
        if e.get('is_featured'):
            r['x'] = 1
        if e.get('lat') is not None and e.get('lng') is not None:
            r['la'], r['lo'] = round(e['lat'], 5), round(e['lng'], 5)
        if e.get('first_seen_at'):
            r['a'] = dt.datetime.fromisoformat(e['first_seen_at']).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
        if e.get('venues') and e['venues'].get('name'):
            r['v'] = e['venues']['name']
            if e['venues'].get('address'):
                r['vd'] = e['venues']['address']
        ss = sorted(x['on_date'] for x in e.get('event_sessions') or [])
        if ss and ss != [e['starts_on']]:
            r['ss'] = ss
        if e.get('event_categories'):
            r['c'] = [x['category_id'] for x in e['event_categories']]
        urls = set()
        for x in e.get('event_sources') or []:
            n = (x.get('sources') or {}).get('name') or 'Fuente'
            if n not in idx:
                idx[n] = len(fuentes)
                fuentes.append(n)
            r.setdefault('fu', []).append([idx[n], x['url']] if x.get('url') else [idx[n]])
            urls.add(x.get('url'))
        if e.get('organizer_url') and e['organizer_url'] not in urls:
            r['w'] = e['organizer_url']
        elif e.get('organizer_url'):  # es el enlace de una de sus fuentes: se guarda su posición (número)
            r['w'] = next(i for i, x in enumerate(e['event_sources']) if x.get('url') == e['organizer_url'])
        if e.get('city_id') != zona:
            r['m'] = e['city_id']
        out.append(r)
    return {'generado': ahora, 'zona': zona, 'formato': 2, 'fuentes': fuentes, 'eventos': out}


total = 0
for c in ciudades:
    evs = get(f"events?select={urllib.parse.quote(COLS, safe=',()')}&city_id=eq.{c['id']}&ends_on=gte.{hoy}&order=starts_on,id")
    json.dump(compacto(c['id'], evs), open(os.path.join(d, f"eventos-{c['id']}.json"), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    total += len(evs)
    print(f"{c['id']}: {len(evs)} planes, {os.path.getsize(os.path.join(d, f'eventos-' + c['id'] + '.json')) // 1024} kB")
print('total', total)
