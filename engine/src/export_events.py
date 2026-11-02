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
total = 0
for c in get('cities?select=id&order=position'):
    evs = get(f"events?select={urllib.parse.quote(COLS, safe=',()')}&city_id=eq.{c['id']}&ends_on=gte.{hoy}&order=starts_on,id")
    json.dump({'generado': ahora, 'zona': c['id'], 'eventos': evs}, open(os.path.join(d, f"eventos-{c['id']}.json"), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    total += len(evs)
    print(f"{c['id']}: {len(evs)} planes, {os.path.getsize(os.path.join(d, f'eventos-' + c['id'] + '.json')) // 1024} kB")
print('total', total)
