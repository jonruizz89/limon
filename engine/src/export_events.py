"""Exporta los planes vigentes de cada zona a web/datos/eventos-<zona>.json para que la app los descargue de la CDN
(un archivo estático, comprimido y en caché) en lugar de pedírselos a Supabase en cada apertura.

Uso: python3 src/export_events.py ../web
Mismo formato que devuelve la consulta de la app (data.js → loadEvents), para que el mapeo sea idéntico.
"""
import datetime as dt, json, os, re, sys, urllib.parse, urllib.request

WEB = sys.argv[1] if len(sys.argv) > 1 else '../web'
cfg = open(os.path.join(WEB, 'config.js'), encoding='utf-8').read()
SB_URL = re.search(r"supabaseUrl:\s*'([^']+)'", cfg).group(1)
SB_KEY = re.search(r"supabaseKey:\s*'([^']+)'", cfg).group(1)  # clave pública: lo mismo que ve la app
COLS = ('id,city_id,title,description,starts_on,ends_on,time_text,district,price_text,is_free,image_url,organizer_url,'
        'is_unique,is_featured,ai_unique,topics,series,lat,lng,first_seen_at,venues(name),event_sessions(on_date),'
        'event_categories(category_id),event_sources(url,sources(name))')


def get(path):
    out, off = [], 0
    while True:
        req = urllib.request.Request(f'{SB_URL}/rest/v1/{path}&offset={off}&limit=1000',
                                     headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY})
        with urllib.request.urlopen(req, timeout=180) as r:
            part = json.loads(r.read().decode())
        out += part
        if len(part) < 1000:
            return out
        off += 1000


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
total = 0
for c in ciudades:
    evs = get(f"events?select={urllib.parse.quote(COLS, safe=',()')}&city_id=eq.{c['id']}&ends_on=gte.{hoy}&order=starts_on,id")
    json.dump({'generado': ahora, 'zona': c['id'], 'eventos': evs}, open(os.path.join(d, f"eventos-{c['id']}.json"), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    total += len(evs)
    print(f"{c['id']}: {len(evs)} planes, {os.path.getsize(os.path.join(d, f'eventos-' + c['id'] + '.json')) // 1024} kB")
print('total', total)
