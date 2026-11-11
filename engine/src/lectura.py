"""Una sola lectura de los planes por publicación, compartida por export_events.py y site.py.

Antes cada publicación de la web descargaba los planes vigentes dos veces (una por script, con columnas distintas) y además
los terminados en los últimos 60 días: unas 33.000 filas, 11 veces al día, que es lo que más gasta del cupo de transferencia
de Supabase. Ahora:
  · los vigentes se leen una vez (la unión de las columnas de los dos scripts) y el segundo script usa la copia del primero;
  · los terminados no se vuelven a pedir: un plan terminado ya no cambia, así que salen de la copia de la víspera
    (solo se leen enteros si no hay copia o si falta algún día).
La copia vive en SB_CACHE_DIR (planes.json); sin esa variable (en local) cada script lee por su cuenta, como antes.
"""
import datetime as dt, gzip, json, os, time, urllib.error, urllib.parse, urllib.request

COLS = ('id,city_id,title,description,details,starts_on,ends_on,time_text,district,price_text,is_free,image_url,organizer_url,lat,lng,'
        'is_unique,is_featured,ai_unique,topics,series,first_seen_at,venues(id,name,address,instagram,instagram_estado),'
        'event_sessions(on_date),event_categories(category_id),event_sources(url,sources(name,license))')
DIAS_PASADOS = 60
LEIDAS = {'filas': 0, 'peticiones': 0, 'bytes': 0}  # para el parte: cuánto se ha pedido a Supabase en esta ejecución


def _get(url, key, path):
    out, off = [], 0
    while True:
        req = urllib.request.Request(f'{url}/rest/v1/{path}&offset={off}&limit=1000',
                                     headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept-Encoding': 'gzip'})
        for intento in range(4):  # un 500 o un corte pasajero de Supabase no debe tumbar la publicación
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    b = r.read()
                    part = json.loads((gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b).decode())
                break
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
                if intento == 3 or (isinstance(e, urllib.error.HTTPError) and e.code < 500):
                    raise
                print('  reintento', intento + 1, 'tras', e)
                time.sleep(5 * (intento + 1))
        LEIDAS['filas'] += len(part); LEIDAS['peticiones'] += 1; LEIDAS['bytes'] += len(b)
        out += part
        if len(part) < 1000:
            return out
        off += 1000


def planes(url, key):
    """(vigentes, terminados hace poco) de todas las zonas, con COLS. Vigentes = ends_on >= hoy (fecha UTC), por (starts_on, id);
    terminados = los de los últimos DIAS_PASADOS días, del más reciente al más antiguo. Cada script filtra lo suyo."""
    hoy = dt.datetime.now(dt.timezone.utc).date()
    desde = hoy - dt.timedelta(days=DIAS_PASADOS)
    cdir, run = os.environ.get('SB_CACHE_DIR'), os.environ.get('GITHUB_RUN_ID') or os.environ.get('LIMON_RUN')
    f = os.path.join(cdir, 'planes.json') if cdir else None
    copia = None
    if f and os.path.exists(f):
        try:
            copia = json.load(open(f, encoding='utf-8'))
        except ValueError:
            copia = None
    def partir(filas):
        vig = sorted((r for r in filas if r['ends_on'] >= hoy.isoformat()), key=lambda r: (r['starts_on'], r['id']))
        pas = sorted((r for r in filas if desde.isoformat() <= r['ends_on'] < hoy.isoformat()), key=lambda r: r['id'])
        pas.sort(key=lambda r: r['ends_on'], reverse=True)
        return vig, pas
    if copia and (os.environ.get('SB_CACHE_USE') == '1' or (run and copia.get('run') == run)):
        # solo ha cambiado el código, o el otro script de esta misma publicación ya los ha leído: no se pide nada
        print('planes: se usa la copia de', copia.get('hecho'))
        return partir(copia['filas'])
    q = urllib.parse.quote(COLS, safe=',()')
    vig = _get(url, key, f'events?select={q}&ends_on=gte.{hoy.isoformat()}&order=starts_on,id')
    seguida = copia and copia.get('pasados_ok') and copia.get('dia', '') >= (hoy - dt.timedelta(days=1)).isoformat()
    if seguida:  # los terminados salen de la copia: los de antes, más los que estaban vigentes ayer y ya han acabado
        ids = {r['id'] for r in vig}
        pas = [r for r in copia['filas'] if r['id'] not in ids and desde.isoformat() <= r['ends_on'] < hoy.isoformat()]
    else:
        pas = _get(url, key, f'events?select={q}&ends_on=lt.{hoy.isoformat()}&ends_on=gte.{desde.isoformat()}&order=id')
    print(f"planes: {len(vig)} vigentes leídos; {len(pas)} terminados {'de la copia' if seguida else 'leídos'}; "
          f"{LEIDAS['peticiones']} peticiones, {LEIDAS['bytes'] // 1024} kB comprimidos")
    if f:
        os.makedirs(cdir, exist_ok=True)
        json.dump({'dia': hoy.isoformat(), 'hecho': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'run': run,
                   'pasados_ok': True, 'filas': vig + pas}, open(f + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        os.replace(f + '.tmp', f)
    return partir(vig + pas)
