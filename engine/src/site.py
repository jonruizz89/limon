"""Páginas estáticas para buscadores: una por zona (ciudad, provincia, municipio, distrito), por zona y tipo de plan, y por evento.

La app es una página que se pinta con JavaScript y los buscadores apenas la ven. Estas páginas son HTML normal, con los datos
del día, datos estructurados de evento (schema.org/Event, los que usa Google para mostrar eventos) y enlaces a la app.
Se generan dentro de la carpeta de la web antes de publicarla (pages.yml); no se guardan en el repositorio.

Uso: python3 src/site.py ../web   (lee la URL y la clave pública de web/config.js)
"""
import gzip
import datetime as dt, hashlib, html, json, math, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import defaultdict

WEB = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '../web')
# imágenes solo de fuentes oficiales o de datos abiertos (las publican para difundir los eventos); las de salas y promotores no se muestran
OFICIAL = re.compile(r'https://([a-z0-9-]+\.)*(euskadi\.eus|zaragoza\.es|esmadrid\.com|madrid\.es|donostiakultura\.eus|donostia\.eus|bilbao\.eus|vitoria-gasteiz\.org|gijon\.es|bizkaia\.eus|gipuzkoa\.eus|araba\.eus)/')
BASE = 'https://limonplanes.com'
cfg = open(os.path.join(WEB, 'config.js'), encoding='utf-8').read()
SB_URL = re.search(r"supabaseUrl:\s*'([^']+)'", cfg).group(1)
SB_KEY = re.search(r"supabaseKey:\s*'([^']+)'", cfg).group(1)
HOY = dt.date.today()
HASTA_LISTA = HOY + dt.timedelta(days=45)    # lo que sale en las páginas de zona
HASTA_FICHA = HOY + dt.timedelta(days=370)   # eventos con página propia (los grandes conciertos se anuncian con un año)
MIN_ZONA = 40  # planes que necesita una zona para tener páginas «hoy», «mañana», «gratis» y «con niños»
DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
ABIERTAS = re.compile(r'CC BY|Open Data|datos abiertos|dominio público', re.I)  # fuentes cuya descripción se puede reproducir entera


def _get(path):
    out, off = [], 0
    while True:
        req = urllib.request.Request(f'{SB_URL}/rest/v1/{path}&offset={off}&limit=1000', headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Accept-Encoding': 'gzip'})
        for intento in range(4):  # un 500 o un corte pasajero de Supabase no debe tumbar la publicación
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    _b = r.read()
                    part = json.loads((gzip.decompress(_b) if r.headers.get('Content-Encoding') == 'gzip' else _b).decode())
                break
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
                if intento == 3 or (isinstance(e, urllib.error.HTTPError) and e.code < 500):
                    raise
                print('  reintento', intento + 1, 'tras', e)
                time.sleep(5 * (intento + 1))
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

def slug(t):
    t = t.lower().translate(str.maketrans('áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'))
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', t)).strip('-')[:70] or 'x'


esc = lambda t: html.escape(str(t or ''), quote=True)
d = lambda s: dt.date.fromisoformat(s)


def fecha(x, dia=True):
    return (DIAS[x.weekday()] + ' ' if dia else '') + f'{x.day} de {MESES[x.month - 1]}'


def cuando(e):
    a, b = d(e['starts_on']), d(e['ends_on'])
    if a == b:
        return fecha(a) + (f', {e["time_text"]}' if e.get('time_text') and len(e['time_text']) < 30 else '')
    if a <= HOY:
        return 'Hasta el ' + fecha(b, False)
    return f'Del {fecha(a, False)} al {fecha(b, False)}'


def km(a, b):
    r = math.pi / 180
    x = (b[1] - a[1]) * r * math.cos((a[0] + b[0]) / 2 * r)
    return math.hypot(x, (b[0] - a[0]) * r) * 6371


# ---------- datos
cities = get('cities?select=id,name,kind,parent,status,districts,munis,lat,lng,features&status=eq.publicada&order=position')
# cuentas en redes de cada zona (cities.features.instagram / .x): se enlazan en el pie de sus páginas
REDES_Z = {c['id']: {k: (c.get('features') or {}).get(k) for k in ('instagram', 'x') if re.fullmatch(r'[A-Za-z0-9._]{1,30}', (c.get('features') or {}).get(k) or '')} for c in cities}
groups = {g['id']: g['name'] for g in get('category_groups?select=id,name&order=position') if g['id'] != 'otros'}
cats = {c['id']: c for c in get('categories?select=id,group_id,label&order=position')}
# los planes se leen una sola vez por publicación (los comparte export_events.py) y los terminados salen de la copia: lectura.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lectura
_zonas = {c['id'] for c in cities}
_vig, _pas = lectura.planes(SB_URL, SB_KEY)
evs = [e for e in _vig if e['city_id'] in _zonas and e['ends_on'] >= HOY.isoformat() and e['starts_on'] <= HASTA_FICHA.isoformat()]
# terminados en los últimos 60 días: su página sigue (sin indexar) para que Google y quien la tenga guardada no encuentren un error
DIAS_PASADOS = 60
pasados = [e for e in _pas if e['city_id'] in _zonas and (HOY - dt.timedelta(days=DIAS_PASADOS)).isoformat() <= e['ends_on'] < HOY.isoformat()]
print(len(evs), 'eventos;', len(pasados), 'terminados hace poco;', len(cities), 'zonas publicadas')
byc = {c['id']: c for c in cities}
for e in evs + pasados:
    e['grupos'] = sorted({cats[c['category_id']]['group_id'] for c in e.get('event_categories') or [] if c['category_id'] in cats} & set(groups), key=list(groups).index)
    e['lugar'] = (e.get('venues') or {}).get('name')
    e['direccion'] = (e.get('venues') or {}).get('address')
    ve = e.get('venues') or {}
    e['ig'] = ve.get('instagram') if ve.get('instagram_estado') == 'ok' else None  # se etiqueta en el carrusel
    e['url'] = f"/evento/{e['id']}-{slug(e['title'])}/"
    e['largo'] = (d(e['ends_on']) - d(e['starts_on'])).days > 6
    e['img'] = e['image_url'] if OFICIAL.match(e.get('image_url') or '') else ''
    e['vid'] = ve.get('id')
    # ferias profesionales (Construtec, Empack…): se pueden visitar, pero no son el plan que buscas un finde
    e['prof'] = any(c['category_id'] == 'profesionales' for c in e.get('event_categories') or [])

# ---------- zonas: ciudades, provincias, municipios de cada provincia y distritos de las ciudades
zonas = []  # {path, name, titulo, evs, parent, center, kids}
used = set()


def zona(path, name, lista, **kw):
    z = dict(path=path, name=name, evs=lista, kids=[], **kw)
    zonas.append(z)
    used.add(path)
    return z


for c in cities:
    if c['parent'] and c['parent'] in byc:
        continue  # las ciudades dentro de una provincia van con ella
    kids = [k for k in cities if k['parent'] == c['id']]
    if c['kind'] == 'provincia':
        allids = {c['id']} | {k['id'] for k in kids}
        prov = zona(c['id'], c['name'], [e for e in evs if e['city_id'] in allids], center=[c['lat'], c['lng']], provincia=True)
        munis = c.get('munis') or {}
        for k in kids:
            prov['kids'].append(zona(k['id'], k['name'], [e for e in evs if e['city_id'] == k['id']], center=[k['lat'], k['lng']], parent=prov))
        for m in sorted({e['district'] for e in evs if e['city_id'] == c['id'] and e.get('district')}, key=slug):
            p = slug(m) if slug(m) not in used else f"{c['id']}-{slug(m)}"
            prov['kids'].append(zona(p, m, [e for e in evs if e['city_id'] == c['id'] and e.get('district') == m], center=munis.get(m), parent=prov))
    else:
        city = zona(c['id'], c['name'], [e for e in evs if e['city_id'] == c['id']], center=[c['lat'], c['lng']])
        for dist in sorted(c.get('districts') or [], key=slug):
            lista = [e for e in evs if e['city_id'] == c['id'] and e.get('district') == dist]
            if lista:
                city['kids'].append(zona(f"{c['id']}/{slug(dist)}", dist, lista, center=None, parent=city, distrito=True))
zpath = {}
for z in zonas:
    for e in z['evs']:
        if not z.get('provincia') and not z['kids']:  # la zona más concreta de cada evento
            zpath[e['id']] = z
        else:
            zpath.setdefault(e['id'], z)

# ---------- lugares con página propia: los que tienen al menos 3 planes próximos y un nombre de verdad (no una frase de punto de encuentro)
porlugar = defaultdict(list)
for e in evs:
    if e['vid'] and e['lugar'] and len(e['lugar']) <= 70 and not re.match(r'(?i)(bajo|en los|puerta|frente|junto)\b', e['lugar']):
        porlugar[e['vid']].append(e)
LUGARES = {}
for vid, l in porlugar.items():
    if len(l) >= 3:
        ve = l[0]['venues']
        LUGARES[vid] = {'id': vid, 'name': ve['name'], 'address': ve.get('address'), 'evs': sorted(l, key=lambda e: (e['largo'], e['starts_on'], e.get('time_text') or '', e['id'])),
                        'url': f"/lugar/{vid}-{slug(ve['name'])}/", 'lat': next((e['lat'] for e in l if e.get('lat')), None), 'lng': next((e['lng'] for e in l if e.get('lat')), None)}
print(len(LUGARES), 'lugares con página')

# ---------- HTML
CSS = """:root{--bg:#F6F7F9;--s:#fff;--ink:#12182B;--q:#4B5366;--l:#DDE1E8;--a:#FFD43B;--ai:#231D02;--at:#7A5900}
@media (prefers-color-scheme:dark){:root{--bg:#0F1320;--s:#181E2E;--ink:#E8EBF2;--q:#A3ABBD;--l:#2A3247;--at:#FFDF6E}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 'IBM Plex Sans',system-ui,-apple-system,sans-serif}
a{color:inherit}main,header,footer{max-width:760px;margin:0 auto;padding:0 16px}
header{display:flex;align-items:center;justify-content:space-between;padding-top:14px;padding-bottom:14px}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;font:italic 700 24px 'Space Grotesk',system-ui,sans-serif}
.cta{display:inline-block;background:var(--a);color:var(--ai);font-weight:600;text-decoration:none;border-radius:10px;padding:10px 16px}
h1{font:700 30px/1.2 'Space Grotesk',system-ui,sans-serif;margin:10px 0 8px}h2{font:600 20px 'Space Grotesk',system-ui,sans-serif;margin:28px 0 8px}
.lead,.q{color:var(--q)}.crumbs{font-size:14px;color:var(--q);margin-top:6px}.crumbs a{color:var(--q)}
ul.ev{list-style:none;padding:0;margin:0}ul.ev li{background:var(--s);border:1px solid var(--l);border-radius:14px;margin:10px 0;overflow:hidden}
ul.ev li>a{display:flex;gap:12px;padding:10px;text-decoration:none}ul.ev li>a:hover .tt{text-decoration:underline}
.th{flex:0 0 84px;height:84px;align-self:flex-start;border-radius:10px;overflow:hidden;background:#FFF3BF;display:grid;place-items:center;font-size:34px}
.th img{width:100%;height:100%;object-fit:cover}.tx{min-width:0;flex:1}
.dt{font-size:13px;font-weight:700;color:var(--at);text-transform:uppercase;letter-spacing:.02em}
.tt{font:600 16.5px/1.3 'Space Grotesk',system-ui,sans-serif;margin:2px 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.m{font-size:14px;color:var(--q)}.tx .m{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tg{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}.tg b{font-size:12px;font-weight:600;background:var(--bg);border:1px solid var(--l);border-radius:999px;padding:1px 9px}.tg b.gr{background:#D3F9D8;border-color:#B2F2BB;color:#1B5E20}
.top{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-inline:16px;padding:4px 16px 10px;margin:0 -16px}
.top a{display:flex;flex-direction:column;flex:0 0 74%;max-width:300px;scroll-snap-align:start;background:var(--s);border:1px solid var(--l);border-radius:16px;overflow:hidden;text-decoration:none}
.top .im{height:150px;flex:none;overflow:hidden;background:#FFE066;display:grid;place-items:center;font-size:56px}.top .im img{width:100%;height:100%;object-fit:cover}
.top .tx{padding:10px 12px 12px}
.fbar{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px;position:relative}
.fbar summary{list-style:none;cursor:pointer;border:1px solid var(--l);background:var(--s);border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600}
.fbar summary::-webkit-details-marker{display:none}.fbar summary::after{content:' ▾'}.fbar details[open] summary{background:var(--ink);color:var(--bg)}
.fbar details[open] summary::after{content:' ▴'}
.fbar .chips{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:5;margin:0;padding:12px;background:var(--s);border:1px solid var(--l);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.15);max-height:60vh;overflow:auto}
.fbar>a{border:1px solid var(--l);background:var(--s);border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;text-decoration:none}
.share{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.share a{border:1px solid var(--l);background:var(--s);border-radius:10px;padding:8px 14px;text-decoration:none;font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.chips a{background:var(--s);border:1px solid var(--l);border-radius:999px;padding:5px 12px;font-size:14px;text-decoration:none}
.card{background:var(--s);border:1px solid var(--l);border-radius:14px;padding:16px;margin:12px 0}.card p{margin:8px 0}
img.hero{width:100%;max-height:340px;object-fit:cover;border-radius:14px;margin:8px 0}
footer{color:var(--q);font-size:13px;padding-top:30px;padding-bottom:40px}"""
# Cloudflare Web Analytics: visitas sin cookies (token público)
BEACON = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "279d742c8af84146b16f4ef30d20adcc"}\'></script>'
CSP = ("default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; script-src https://static.cloudflareinsights.com; connect-src https://cloudflareinsights.com; "
       "object-src 'none'; base-uri 'self'; form-action 'none'")


def page(path, title, desc, body, crumbs=(), ld=None, app='/', img=None, noindex=False, mapa=True, clave=None, grupo=None):
    bc = ' › '.join(f'<a href="{esc(u)}">{esc(t)}</a>' for t, u in crumbs)
    raiz = path.strip('/').split('/')[1] if path.startswith('/planes/') and path.count('/') > 2 else None
    rz = REDES_Z.get(raiz) or {}
    sig = ('<br>Síguenos: ' + ' · '.join(x for x in (
        f'<a href="https://x.com/{rz["x"]}" rel="noopener">X @{rz["x"]}</a>' if rz.get('x') else '',
        f'<a href="https://www.instagram.com/{rz["instagram"]}/" rel="noopener">Instagram @{rz["instagram"]}</a>' if rz.get('instagram') else '') if x)) if rz else ''
    ldj = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False).replace("</", "<\\/")}</script>' for x in (ld or []))
    doc = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title>{'<meta name="robots" content="noindex,follow">' if noindex else ''}
<meta name="description" content="{esc(desc[:300])}"><link rel="canonical" href="{BASE}{path}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc[:300])}"><meta property="og:url" content="{BASE}{path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Limón"><meta property="og:locale" content="es_ES">
{f'<meta property="og:image" content="{esc(img)}">' if img else f'<meta property="og:image" content="{BASE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/limon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/limon-180.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>{CSS}</style>{ldj}</head><body>
<header><a class="brand" href="/"><img src="/limon.svg" alt="" width="30" height="30">limón</a><a class="cta" href="{esc(app)}">Abrir la app</a></header>
<main>{f'<nav class="crumbs" aria-label="Estás en">{bc}</nav>' if bc else ''}{body}</main>
<footer>Limón reúne los planes de tu zona de agendas públicas y webs de organizadores; comprueba siempre la información en la fuente.
Datos de la agenda municipal de Madrid (datos.madrid.es) de Kulturklik (Open Data Euskadi, CC BY 4.0) y de la agenda del Ayuntamiento de Zaragoza, entre otros.
{sig}<br><a href="/planes/">Todas las zonas</a> · <a href="/privacidad.html">Privacidad</a> · <a href="/condiciones.html">Condiciones</a></footer>
@@LIMON_BEACON@@</body></html>""".replace('@@LIMON_BEACON@@', BEACON)
    out = os.path.join(WEB, path.strip('/'), 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(doc)
    if mapa and not noindex:
        # la fecha de cambio sale de lo esencial de la página (clave), no de las listas que cambian cada día
        h = hashlib.sha1((clave if clave is not None else doc).encode()).hexdigest()[:16]
        PAGES.append((path, h, grupo or ('zonas' if path.startswith('/planes/') or path == '/planes/' else 'otras')))


PAGES = []


def app_link(e):
    c = e['city_id'] if not byc[e['city_id']].get('parent') else byc[e['city_id']]['parent']
    return f"/?c={c}&ev=e{e['id']}"


def zone_app(z):
    top = z
    while top.get('parent'):
        top = top['parent']
    if z is top or z['path'] in byc:
        return f"/?c={z['path']}"
    return f"/?c={top['path']}&m={urllib.parse.quote(z['name'])}" if not z.get('distrito') else f"/?c={top['path']}"


EMO = {'musica': '🎵', 'escena': '🎭', 'arte': '🖼️', 'patrimonio': '🏛️', 'cine': '🎬', 'letras': '📚', 'ciencia': '🔬', 'gastro': '🍽️', 'aprender': '✏️',
       'naturaleza': '🌿', 'ciudad': '🎉', 'deporte': '🏃', 'mascotas': '🐾', 'ferias': '🛍️', 'familia': '🧒', 'comunidad': '🤝'}


def ico(e):
    return next((EMO[g] for g in e['grupos'] if g in EMO), '🍋')


def etiqueta(e):
    a, b = d(e['starts_on']), d(e['ends_on'])
    m = lambda x: f"{x.day} {MESES[x.month - 1][:3]}"
    if a <= HOY and b > HOY:
        return 'Hasta el ' + m(b)
    if a == b:
        h = e.get('time_text') if e.get('time_text') and len(e['time_text']) <= 12 else ''
        return ('Hoy' if a == HOY else 'Mañana' if a == HOY + dt.timedelta(days=1) else DIAS[a.weekday()][:3].capitalize() + ' ' + m(a)) + (' · ' + h if h else '')
    return f'{m(a)} – {m(b)}'


def li(e, z=None):
    sitio = e['lugar'] or ''
    zz = zpath.get(e['id'])
    if zz and z is not zz and zz['name'] not in sitio:
        sitio = (sitio + ' · ' if sitio else '') + zz['name']
    g = (e['grupos'] or [''])[0]
    img = e['img']
    th = f'<img src="{esc(img)}" alt="" loading="lazy" decoding="async">' if img else f'<span>{EMO.get(g, "🍋")}</span>'
    tags = ('<b class="gr">Gratis</b>' if e.get('is_free') else '') + (f'<b>{esc(groups[g])}</b>' if g else '')
    return (f'<li><a href="{e["url"]}"><div class="th">{th}</div><div class="tx"><div class="dt">{esc(etiqueta(e))}</div>'
            f'<div class="tt">{esc(e["title"])}</div>{f"<div class=m>{esc(sitio)}</div>" if sitio else ""}<div class="tg">{tags}</div></div></a></li>')


def finde():
    w = HOY.weekday()
    vie = HOY + dt.timedelta(days=(4 - w) % 7) if w < 4 else HOY
    return vie, HOY + dt.timedelta(days=6 - w)


def secciones(lista, z):
    vie, dom = finde()
    con = [e for e in lista if not e['largo'] and d(e['starts_on']) <= HASTA_LISTA]
    s1 = [e for e in con if d(e['starts_on']) <= dom and d(e['ends_on']) >= vie]
    s2 = [e for e in con if e not in s1 and d(e['starts_on']) <= HOY + dt.timedelta(days=14)]
    s3 = [e for e in con if e not in s1 and e not in s2]
    largos = [e for e in lista if e['largo']]
    out = ''
    s1, s2, s3 = (sorted(l, key=lambda e: bool(e.get('prof'))) for l in (s1, s2, s3))  # las ferias profesionales, al final
    for t, l, n in (('Este fin de semana', s1, 60), ('Próximos días', s2, 60), ('Más adelante', s3, 40), ('En curso: exposiciones, ciclos y cursos', largos, 40)):
        if l:
            out += f'<h2>{t}</h2><ul class="ev">' + ''.join(li(e, z) for e in l[:n]) + '</ul>' + (f'<p class="q">Y {len(l) - n} más en la app.</p>' if len(l) > n else '')
    return out


def crumbs_of(z):
    c, p = [], z.get('parent')
    while p:
        c.insert(0, (p['name'], f"/planes/{p['path']}/"))
        p = p.get('parent')
    return [('Planes', '/planes/')] + c


def vecinos(z):
    if not z.get('center') or not z.get('parent'):
        return []
    sib = [k for k in z['parent']['kids'] if k is not z and k.get('center')]
    return sorted(sib, key=lambda k: km(z['center'], k['center']))[:8]


def picks(lista, vie, dom, n=12):
    cand = [e for e in lista if d(e['starts_on']) <= dom and d(e['ends_on']) >= vie and not e.get('prof')]
    def score(e):
        return (3 if e.get('is_unique') or e.get('ai_unique') else 0) + (0 if e['largo'] else 1.5) + (0.7 if e.get('is_free') else 0) + \
               (0.5 if e['img'] else 0) + (0.5 if e.get('description') or e.get('details') else 0) + 0.3 * len(e.get('event_sources') or [])
    out, por_grupo = [], defaultdict(int)
    for e in sorted(cand, key=lambda e: (-score(e), e['starts_on'], e['id'])):
        g = (e['grupos'] or ['otros'])[0]
        if por_grupo[g] >= 3:  # variedad: como mucho 3 del mismo tipo
            continue
        por_grupo[g] += 1
        out.append(e)
        if len(out) >= n:
            break
    return sorted(out, key=lambda e: (e['largo'], max(e['starts_on'], vie.isoformat()), e.get('time_text') or '', e['id']))


def recorta(t, n):
    return t if len(t) <= n else t[:n].rsplit(' ', 1)[0].rstrip(',;:') + '…'


def sitio_corto(t):
    t = re.split(r' - | \(|, ', t)[0].strip()
    return recorta(t, 35)


def corto(e, vie):
    a = d(e['starts_on'])
    dia = DIAS[max(a, vie).weekday()][:3] if not e['largo'] and a >= vie else 'todo el finde'
    h = e.get('time_text') if e.get('time_text') and len(e['time_text']) < 12 and not e['largo'] else ''
    return f"{dia}{' ' + h if h else ''}"


# zonas
for z in zonas:
    lista = z['evs']
    if not lista:
        continue
    n = len(lista)
    gr = defaultdict(list)
    for e in lista:
        for g in e['grupos']:
            gr[g].append(e)
    gl = [(g, gr[g]) for g in groups if len(gr[g]) >= 3]
    tit = f"Planes en {z['name']}: agenda de eventos, conciertos y actividades"
    desc = f"Qué hacer en {z['name']} esta semana y este fin de semana: {n} planes entre conciertos, teatro, exposiciones, actividades infantiles y más. Agenda actualizada cada día."
    body = f"<h1>Planes en {esc(z['name'])}</h1><p class='lead'>{n} planes en las próximas semanas, actualizados cada día.</p>"
    body += f'<p><a class="cta" href="{esc(zone_app(z))}">Abrir en la app, con mapa y tu agenda</a></p>'
    vie0, dom0 = finde()
    fb = ''
    if sum(1 for e in lista if d(e['starts_on']) <= dom0 and d(e['ends_on']) >= vie0) >= 3:
        fb += f'<a href="/planes/{z["path"]}/este-finde/">Este finde</a>'
    if n >= MIN_ZONA and not z.get('distrito'):  # las mismas condiciones que las páginas por intención (más abajo)
        fb += f'<a href="/planes/{z["path"]}/hoy/">Hoy</a><a href="/planes/{z["path"]}/manana/">Mañana</a>'
        if sum(1 for e in lista if e.get('is_free') and d(e['starts_on']) <= HASTA_LISTA and not e.get('prof')) >= 5:
            fb += f'<a href="/planes/{z["path"]}/gratis/">Gratis</a>'
        if sum(1 for e in lista if 'familia' in e['grupos'] and d(e['starts_on']) <= HASTA_LISTA) >= 5:
            fb += f'<a href="/planes/{z["path"]}/con-ninos/">Con niños</a>'
    if gl:
        fb += '<details name="f"><summary>Categorías</summary><div class="chips">' + ''.join(f'<a href="/planes/{z["path"]}/{g}/">{esc(groups[g])} ({len(l)})</a>' for g, l in gl) + '</div></details>'
    if z['kids']:
        fb += '<details name="f"><summary>Zonas</summary><div class="chips">' + ''.join(f'<a href="/planes/{k["path"]}/">{esc(k["name"])}</a>' for k in sorted(z['kids'], key=lambda k: -len(k['evs'])) if k['evs']) + '</div></details>'
    if fb:
        body += f'<nav class="fbar" aria-label="Filtrar">{fb}</nav>'
    top = [e for e in picks(lista, vie0, dom0, n=8)]
    if len(top) >= 4:
        def tc(e):
            g = (e['grupos'] or [''])[0]
            img = e['img']
            im = f'<img src="{esc(img)}" alt="" loading="lazy" decoding="async">' if img else EMO.get(g, '🍋')
            return (f'<a href="{e["url"]}"><div class="im">{im}</div><div class="tx"><div class="dt">{esc(etiqueta(e))}</div>'
                    f'<div class="tt">{esc(e["title"])}</div><div class="m">{esc(sitio_corto(e["lugar"]) if e["lugar"] else z["name"])}</div></div></a>')
        body += '<h2>Destacados de esta semana</h2><div class="top">' + ''.join(tc(e) for e in top) + '</div>'
    body += secciones(lista, z)
    lz = sorted({e['vid'] for e in lista if e['vid'] in LUGARES}, key=lambda v: -sum(1 for e in lista if e['vid'] == v))[:12]
    if len(lz) >= 3:
        body += '<h2>Lugares con más planes</h2><div class="chips">' + ''.join(f'<a href="{LUGARES[v]["url"]}">{esc(LUGARES[v]["name"])}</a>' for v in lz) + '</div>'
    vz = vecinos(z)
    if vz:
        body += '<h2>Cerca</h2><div class="chips">' + ''.join(f'<a href="/planes/{k["path"]}/">{esc(k["name"])}</a>' for k in vz if k['evs']) + '</div>'
    page(f"/planes/{z['path']}/", tit, desc, body, crumbs_of(z), app=zone_app(z),
         ld=[{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
             {'@type': 'ListItem', 'position': i + 1, 'name': t, 'item': BASE + u} for i, (t, u) in enumerate(crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")])]}])
    for g, l in gl:
        gn = groups[g]
        page(f"/planes/{z['path']}/{g}/", f"{gn} en {z['name']}: agenda y próximos planes",
             f"{gn} en {z['name']}: {len(l)} planes en las próximas semanas. Fechas, horarios, lugares y precios, actualizados cada día.",
             f"<h1>{esc(gn)} en {esc(z['name'])}</h1><p class='lead'>{len(l)} planes de {esc(gn.lower())} en {esc(z['name'])}.</p>"
             f'<p><a class="cta" href="{esc(zone_app(z))}">Ver en Limón</a></p>' + secciones(l, z),
             crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")], app=zone_app(z))

# ---------- «Este finde en …»: los mejores planes del fin de semana, para compartir por WhatsApp o Telegram
vie, dom = finde()
FINDE = {}
for z in zonas:
    sel = picks(z['evs'], vie, dom)
    if len(sel) < 3:
        continue
    path = f"/planes/{z['path']}/este-finde/"
    FINDE[z['path']] = path
    msg = f"🍋 Planes este finde en {z['name']}:\n" + '\n'.join(f"{ico(e)} {corto(e, vie)} · {recorta(e['title'], 70)}" + (f" ({sitio_corto(e['lugar'])})" if e['lugar'] else '') for e in sel[:8]) + \
          f"\n\nTodos: {BASE}{path}"
    wa = 'https://wa.me/?text=' + urllib.parse.quote(msg)
    tg = 'https://t.me/share/url?' + urllib.parse.urlencode({'url': BASE + path, 'text': msg.rsplit('\n\n', 1)[0]})
    rango = f"del {vie.day} al {fecha(dom, False)}" if vie.month == dom.month else f"del {fecha(vie, False)} al {fecha(dom, False)}"
    body = (f"<h1>Este finde en {esc(z['name'])}</h1><p class='lead'>Los {len(sel)} planes que no te puedes perder {rango}: variados, con fecha y lugar.</p>"
            f'<div class="share"><a href="{esc(wa)}" rel="noopener" target="_blank">Compartir por WhatsApp</a><a href="{esc(tg)}" rel="noopener" target="_blank">Compartir por Telegram</a></div>'
            '<ul class="ev">' + ''.join(li(e, z) for e in sel) + '</ul>'
            f'<p><a href="/planes/{z["path"]}/">Toda la agenda de {esc(z["name"])}</a> · <a class="cta" href="{esc(zone_app(z))}">Ver en Limón</a></p>')
    page(path, f"Qué hacer este fin de semana en {z['name']} ({rango}) · Limón",
         f"Planes para este fin de semana en {z['name']}, {rango}: " + ', '.join(e['title'] for e in sel[:4]) + ' y más.',
         body, crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")], app=zone_app(z))
json.dump(FINDE, open(os.path.join(WEB, 'planes', 'finde.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(FINDE), 'páginas de «este finde»')

# ---------- Páginas por intención: lo que más se busca («qué hacer hoy en …», «planes gratis en …», «con niños»)
# Solo en zonas con agenda suficiente (ciudades, provincias y municipios grandes, no distritos). «Hoy» y «mañana» cambian
# cada día; si un día hay pocos planes, la página lo dice y manda a la semana, pero no se ofrece a Google (noindex).
INTENTOS = defaultdict(dict)  # zona → {intención: ruta}, para enlazarlas desde la página de la zona


def _hoy_o(dia, lista):
    """Planes de ese día: primero los que empiezan ese día (por hora), luego los que están en curso."""
    dd = dia.isoformat()
    un = [e for e in lista if e['starts_on'] <= dd <= e['ends_on'] and not e['largo'] and not e.get('prof')]
    curso = [e for e in lista if e['starts_on'] <= dd <= e['ends_on'] and e['largo']]
    un.sort(key=lambda e: (e['starts_on'] != dd, e.get('time_text') or '99', e['title']))
    curso.sort(key=lambda e: (e['ends_on'], e['title']))
    return un, curso


def _ld_lista(nombre, sel):
    return {'@context': 'https://schema.org', '@type': 'ItemList', 'name': nombre,
            'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': BASE + e['url'], 'name': e['title']} for i, e in enumerate(sel[:40])]}


def _intencion(z, tipo, h1, title, desc, lead, bloques, total, minimo=3):
    path = f"/planes/{z['path']}/{tipo}/"
    body = f"<h1>{esc(h1)}</h1><p class='lead'>{esc(lead)}</p>"
    for t, l, n in bloques:
        if l:
            body += (f'<h2>{esc(t)}</h2>' if t else '') + '<ul class="ev">' + ''.join(li(e, z) for e in l[:n]) + '</ul>' + \
                    (f'<p class="q">Y {len(l) - n} más en la app.</p>' if len(l) > n else '')
    if total < minimo:
        body += f"<p>Hoy hay pocos planes con fecha aquí. Mira <a href='/planes/{z['path']}/'>toda la agenda de {esc(z['name'])}</a>" + \
                (f" o <a href='{FINDE[z['path']]}'>lo mejor del fin de semana</a>" if z['path'] in FINDE else '') + '.</p>'
    body += f'<p><a href="/planes/{z["path"]}/">Toda la agenda de {esc(z["name"])}</a> · <a class="cta" href="{esc(zone_app(z))}">Ver en Limón</a></p>'
    sel = [e for _, l, _ in bloques for e in l]
    page(path, title, desc, body, crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")], app=zone_app(z),
         ld=[_ld_lista(h1, sel)] if sel else None, noindex=total < minimo,
         clave=json.dumps([title, [e['id'] for e in sel[:40]]]))
    INTENTOS[z['path']][tipo] = path


manana = HOY + dt.timedelta(days=1)
n_int = 0
for z in zonas:
    lista = z['evs']
    if len(lista) < MIN_ZONA or z.get('distrito'):
        continue
    nom = z['name']
    for tipo, dia, rotulo in (('hoy', HOY, 'hoy'), ('manana', manana, 'mañana')):
        un, curso = _hoy_o(dia, lista)
        cuando_ = fecha(dia)
        _intencion(z, tipo, f"Qué hacer {rotulo} en {nom}", f"Qué hacer {rotulo} en {nom}, {cuando_} · Limón",
                   f"Planes para {rotulo}, {cuando_}, en {nom}: " + (', '.join(e['title'] for e in un[:4]) + ' y más.' if un else 'conciertos, teatro, exposiciones y actividades.'),
                   f"{len(un)} planes con fecha {rotulo}, {cuando_}, por orden de hora" + (f", y {len(curso)} exposiciones y ciclos en curso." if curso else '.'),
                   [('', un, 80), ('En curso: exposiciones, ciclos y cursos', curso, 30)], len(un))
        n_int += 1
    grat = [e for e in lista if e.get('is_free') and d(e['starts_on']) <= HASTA_LISTA and not e.get('prof')]
    if len(grat) >= 5:
        vie_, dom_ = finde()
        g1 = [e for e in grat if not e['largo'] and d(e['starts_on']) <= HOY + dt.timedelta(days=7)]
        g2 = [e for e in grat if not e['largo'] and e not in g1]
        g3 = [e for e in grat if e['largo']]
        _intencion(z, 'gratis', f"Planes gratis en {nom}", f"Planes gratis en {nom}: qué hacer sin gastar · Limón",
                   f"{len(grat)} planes gratis en {nom} en las próximas semanas: conciertos, exposiciones, visitas, talleres y actividades de entrada libre.",
                   f"{len(grat)} planes gratis o de entrada libre en {nom}, por orden de fecha. Algunos piden inscripción: compruébalo en la ficha.",
                   [('Esta semana', g1, 60), ('Más adelante', g2, 40), ('Exposiciones y ciclos gratis', g3, 30)], len(grat), 5)
        n_int += 1
        fg = [e for e in picks(grat, vie_, dom_, n=20)]
        if len(fg) >= 3:
            _intencion(z, 'este-finde/gratis', f"Planes gratis este finde en {nom}", f"Planes gratis este fin de semana en {nom} · Limón",
                       f"Planes gratis para este fin de semana en {nom}: " + ', '.join(e['title'] for e in fg[:4]) + ' y más.',
                       f"Del {fecha(vie_, False)} al {fecha(dom_, False)}: {len(fg)} planes sin gastar un euro.", [('', fg, 20)], len(fg))
            n_int += 1
    nin = [e for e in lista if 'familia' in e['grupos'] and d(e['starts_on']) <= HASTA_LISTA]
    if len(nin) >= 5:
        vie_, dom_ = finde()
        n1 = [e for e in nin if not e['largo'] and d(e['starts_on']) <= dom_ and d(e['ends_on']) >= vie_]
        n2 = [e for e in nin if not e['largo'] and e not in n1]
        n3 = [e for e in nin if e['largo']]
        ngr = sum(1 for e in nin if e.get('is_free'))
        _intencion(z, 'con-ninos', f"Planes con niños en {nom}", f"Planes con niños en {nom} este finde y próximos días · Limón",
                   f"{len(nin)} planes para ir con niños en {nom}: teatro infantil, cuentacuentos, talleres, cine y actividades en familia" + (f", {ngr} gratis." if ngr else '.'),
                   f"{len(nin)} planes para ir con niños en {nom}" + (f", {ngr} de ellos gratis" if ngr else '') + ". Por orden de fecha.",
                   [('Este fin de semana', n1, 40), ('Próximos días', n2, 40), ('En curso', n3, 20)], len(nin), 5)
        n_int += 1
print(n_int, 'páginas por intención (hoy, mañana, gratis, con niños)')

# índice de zonas
tops = [z for z in zonas if not z.get('parent') and z['evs']]
body = "<h1>Planes por zona</h1><p class='lead'>Agenda de eventos, conciertos, teatro, exposiciones y actividades, actualizada cada día.</p>"
for z in tops:
    body += f'<h2><a href="/planes/{z["path"]}/">{esc(z["name"])}</a></h2>'
    if z['kids']:
        body += '<div class="chips">' + ''.join(f'<a href="/planes/{k["path"]}/">{esc(k["name"])}</a>' for k in sorted(z['kids'], key=lambda k: slug(k['name'])) if k['evs']) + '</div>'
page('/planes/', 'Planes por zona · Limón', 'Qué hacer en Madrid, Zaragoza, Gijón, Bilbao, Donostia, Vitoria-Gasteiz y toda Euskadi: agenda de eventos, conciertos, teatro y actividades, actualizada cada día.', body)

# ---------- Colecciones: programas con muchas visitas sueltas (p. ej. Pasea Madrid) reunidos en una página, que es lo que la gente busca
COLECCIONES = [{'zona': 'madrid', 'path': 'pasea-madrid', 'fuente': 'Pasea Madrid', 'nombre': 'Pasea Madrid',
                'title': 'Pasea Madrid: visitas guiadas gratuitas por Madrid',
                'lead': ('Todas las visitas guiadas gratuitas del programa Pasea Madrid del Ayuntamiento: el Madrid barroco, Goya, '
                         'las quintas históricas, el frontón Beti Jai, el búnker de El Capricho y más. Las plazas se reservan en la central '
                         'de reservas del Ayuntamiento y se agotan rápido.'),
                'reservas': 'https://paseamadrid.reservaspatrimonio.es', 'unidad': 'visitas', 'extra': 'gratis con inscripción'},
               {'zona': 'madrid', 'path': 'jazzmadrid', 'texto': r'jazzmadrid|jazz madrid\s?2\d|festival internacional (de )?jazz (de )?madrid', 'nombre': 'JAZZMADRID',
                'title': 'JAZZMADRID: Festival Internacional de Jazz de Madrid',
                'lead': ('Todos los conciertos del Festival Internacional de Jazz de Madrid en el Teatro Fernán Gómez, CentroCentro, Conde Duque y otras salas, '
                         'por orden de fecha.'), 'unidad': 'conciertos'}]
# temporadas (mismas reglas que TEMPORADAS en web/index.html): una página por zona en su época, desde 2 semanas antes
TEMPORADAS = [
    ('navidad', 'Navidad', ('11-01', '01-06'), r'navidad|navide[ñn]|nadal|eguberri|christmas|xmas|\bbelenes\b|\bbel[eé]n (de|del|monumental|napolitano|viviente|municipal)|pesebre|reyes magos|cabalgata|nochevieja|nochebuena|campanadas|pap[aá] noel|olentzero|mari domingi|ti[oó] de nadal|villancic|turr[oó]n|fin de a[nñ]o|san silvestre|luces de navidad|mercad(o|illo)s? navide',
     'Mercadillos navideños, luces, belenes, conciertos, cabalgatas y planes de Nochevieja'),
    ('halloween', 'Halloween', ('10-01', '11-01'), r'hallow|samhain|d[ií]a de (los )?muertos|calabaza|zombi|terror|miedo|tenorio|todos los santos|gaztain|castañada|castanyada',
     'Fiestas, pasajes del terror, cine de miedo, Tenorio y actividades para la noche de Halloween y Todos los Santos'),
    ('carnaval', 'Carnaval', ('01-25', '03-08'), r'carnaval|inauteri|ihauteri|carnestolt|disfraz|disfrac|entierro de la sardina',
     'Desfiles, concursos de disfraces, chirigotas y fiestas de Carnaval'),
    ('san-valentin', 'San Valentín', ('02-01', '02-14'), r'valent[ií]n|valentine|enamorad|rom[aá]ntic', 'Planes en pareja y para San Valentín'),
    ('semana-santa', 'Semana Santa', ('03-01', '04-25'), r'semana santa|aste santu|setmana santa|procesi[oó]n|cofrad|torrija|pasos de',
     'Procesiones, conciertos de música sacra y planes para Semana Santa'),
    ('orgullo', 'Orgullo', ('06-01', '07-10'), r'orgullo|\bpride\b|lgtb|lgbt|harrotasun|diversidad sexual', 'Manifestación, conciertos y fiestas del Orgullo'),
]
def _en_ventana(v, d):
    return v[0] <= d <= v[1] if v[0] <= v[1] else (d >= v[0] or d <= v[1])
_md = (HOY + dt.timedelta(days=14)).strftime('%m-%d')
for tid, tnom, tv, tre, tdesc in TEMPORADAS:
    if not (_en_ventana(tv, _md) or _en_ventana(tv, HOY.strftime('%m-%d'))):
        continue
    for z in zonas:
        if z.get('parent'):
            continue
        anyo = HOY.year + (1 if tid != 'navidad' and HOY.month > 10 else 0)
        COLECCIONES.append({'zona': z['path'], 'path': tid, 'titulo': tre, 'nombre': f"{tnom} en {z['name']}",
                            'title': f"{tnom} en {z['name']} {anyo}: todos los planes",
                            'lead': f"{tdesc} en {z['name']}, por orden de fecha, con horarios, lugares y precios. Se actualiza cada día.",
                            'unidad': 'planes'})
# Navidad por lo que se busca: «mercadillos navideños», «belenes», «luces», «cabalgata», «Nochevieja», «puente de diciembre»
_anyo_nav = HOY.year if HOY.month >= 6 else HOY.year - 1
NAVIDAD_TEMAS = [
    ('mercadillos-navidenos', 'Mercadillos navideños', r'^(?=.*(mercad|mercat|\bfira\b|\bferia\b|market|azoka))(?=.*(navid|navide|nadal|christmas|xmas|gabon|santa ll[uú]cia))',
     'Todos los mercadillos de Navidad: artesanía, figuras de belén, regalos y puestos de comida, con fechas, horarios y lugares.', 'mercadillos'),
    ('belenes', 'Belenes', r'\bbelenes\b|\bbel[eé]n (de|del|monumental|napolitano|viviente|municipal|navide|tradicional|artesan)|pesebre|pessebre|jaiotza',
     'Belenes monumentales, napolitanos y vivientes para visitar estas Navidades, con horarios y precios.', 'belenes'),
    ('luces-de-navidad', 'Luces de Navidad', r'luces de navidad|encendido (de )?(las |del )?(luces|alumbrado)|alumbrado navide|iluminaci[oó]n navide|llums de nadal|gabonetako argi',
     'El encendido de las luces y las iluminaciones de Navidad: fechas, horarios y recorridos.', 'planes'),
    ('cabalgata-de-reyes', 'Cabalgatas de Reyes', r'cabalgata|reyes magos|errege magoak|olentzero|mari domingi|\bpaje real\b|cartero real',
     'Cabalgatas de Reyes y de Olentzero, visitas de los Reyes Magos y carteros reales, con recorridos y horarios.', 'planes'),
    ('nochevieja', 'Nochevieja', r'nochevieja|fin de a[nñ]o|campanadas|cotill[oó]n|san silvestre|urtezahar|cap d.any',
     'Fiestas de Nochevieja, campanadas, carreras de San Silvestre y conciertos de fin de año.', 'planes'),
]
_puente = (dt.date(_anyo_nav, 12, 5), dt.date(_anyo_nav, 12, 8))
if _en_ventana(TEMPORADAS[0][2], _md) or _en_ventana(TEMPORADAS[0][2], HOY.strftime('%m-%d')):
    for z in zonas:
        if z.get('parent'):
            continue
        for tid, tnom, tre, tlead, uni in NAVIDAD_TEMAS:
            COLECCIONES.append({'zona': z['path'], 'path': tid, 'titulo': tre, 'nombre': f"{tnom} en {z['name']}",
                                'title': f"{tnom} en {z['name']} {_anyo_nav}", 'lead': f"{tlead} En {z['name']}, por orden de fecha. Se actualiza cada día.",
                                'unidad': uni, 'gratis': True})
        if HOY <= _puente[1]:
            COLECCIONES.append({'zona': z['path'], 'path': 'puente-de-diciembre', 'ventana': _puente, 'nombre': f"Puente de diciembre en {z['name']}",
                                'title': f"Qué hacer en el puente de diciembre en {z['name']} ({_puente[0].day}–{_puente[1].day} de diciembre)",
                                'lead': f"Planes con fecha entre el {fecha(_puente[0])} y el {fecha(_puente[1])} en {z['name']}: conciertos, teatro, mercadillos, actividades en familia y más.",
                                'unidad': 'planes', 'gratis': True})
# ciclos y festivales que ya vienen marcados en la fuente (Kulturklik, Zaragoza…): «Literaktum 2026», «Blues Hotsak 2026»…
def _serie(t):
    return re.sub(r'\s+', ' ', re.sub(r'\b(19|20)\d\d(\s?[-/]\s?(19|20)?\d\d)?\b', '', t or '')).strip(' -–·.')
_ya = {c['path'] for c in COLECCIONES}
for z in zonas:
    if z.get('parent'):
        continue  # una página por ciclo, en la zona principal
    grupos_s = defaultdict(list)
    for e in z['evs']:
        if e.get('series') and len(_serie(e['series'])) >= 4:
            grupos_s[slug(_serie(e['series']))].append(e)
    for k, l in grupos_s.items():
        if len(l) < 4 or k in used or f"{z['path']}/{k}" in used or k in groups or k in ('este-finde', 'hoy', 'manana', 'gratis', 'con-ninos') or k in _ya:
            continue
        nombres = defaultdict(int)
        for e in l:
            nombres[e['series'].strip()] += 1
        nombre = max(nombres, key=nombres.get)
        COLECCIONES.append({'zona': z['path'], 'path': k, 'serie': k, 'nombre': nombre, 'title': f"{nombre}: programa completo en {z['name']}",
                            'lead': f"Todas las actividades de {nombre} en {z['name']}, por orden de fecha, con horarios, lugares y precios.", 'unidad': 'planes'})
EN_COLECCION = {}


def _dentro(c, e):
    if c.get('fuente'):
        return any(c['fuente'] in ((s.get('sources') or {}).get('name') or '') for s in e.get('event_sources') or [])
    if c.get('serie'):
        return bool(e.get('series')) and slug(_serie(e['series'])) == c['serie']
    if c.get('ventana'):  # puente de diciembre: lo que tiene fecha esos días (sin las exposiciones que duran meses)
        a, b = c['ventana']
        return not e['largo'] and not e.get('prof') and d(e['starts_on']) <= b and d(e['ends_on']) >= a
    if c.get('titulo'):  # temporadas: por el título y el ciclo, no por la descripción
        return bool(re.search(c['titulo'], f"{e['title']} · {e.get('series') or ''}", re.I))
    return bool(re.search(c['texto'], f"{e['title']} {e.get('description') or ''}", re.I))


_sel_col = []
for c in COLECCIONES:
    z = next((x for x in zonas if x['path'] == c['zona']), None)
    sel = sorted((e for e in (z['evs'] if z else []) if _dentro(c, e)), key=lambda e: (e['largo'], e['starts_on'], e.get('time_text') or '', e['title']))
    if len(sel) >= 3:
        _sel_col.append((c, z, sel))
_hechas = {f"{z['path']}/{c['path']}": c for c, z, _ in _sel_col}
for c, z, sel in _sel_col:
    path = f"/planes/{z['path']}/{c['path']}/"
    for e in sel:
        EN_COLECCION.setdefault(e['id'], (c['nombre'], path))
    ini, fin = min(e['starts_on'] for e in sel), max(e['ends_on'] for e in sel)
    ngr = sum(1 for e in sel if e.get('is_free'))
    temas = ''
    if c['path'] == 'navidad':  # desde la página de Navidad, a cada búsqueda concreta
        subs = [(t[1], f"/planes/{z['path']}/{t[0]}/") for t in NAVIDAD_TEMAS + [('puente-de-diciembre', 'Puente de diciembre')] if f"{z['path']}/{t[0]}" in _hechas]
        if subs:
            temas = '<div class="chips">' + ''.join(f'<a href="{u}">{esc(t)}</a>' for t, u in subs) + '</div>'
    body = (f"<h1>{esc(c['title'])}</h1><p class='lead'>{esc(c['lead'])}</p>"
            f"<p class='m'>{len(sel)} {c['unidad']}{f', {ngr} gratis' if c.get('gratis') and ngr else ''} · del {esc(fecha(d(ini), False))} al {esc(fecha(d(fin), False))}{' · ' + c['extra'] if c.get('extra') else ''}</p>"
            + temas + (f"<p><a class='cta' href='{esc(c['reservas'])}' rel='nofollow noopener' target='_blank'>Ir a la central de reservas ↗</a></p>" if c.get('reservas') else '') +
            '<ul class="ev">' + ''.join(li(e, z) for e in sel) + '</ul>'
            + (f'<p><a href="/planes/{z["path"]}/navidad/">Toda la Navidad en {esc(z["name"])}</a></p>' if c['path'] != 'navidad' and f"{z['path']}/navidad" in _hechas and any(c['path'] == t[0] for t in NAVIDAD_TEMAS + [('puente-de-diciembre',)]) else '') +
            f'<p><a href="/planes/{z["path"]}/">Toda la agenda de {esc(z["name"])}</a></p>')
    ld = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': c['title'],
          'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': BASE + e['url'], 'name': e['title']} for i, e in enumerate(sel)]}
    page(path, f"{c['title']} · Limón", f"{c['lead']} {len(sel)} {c['unidad']} del {fecha(d(ini), False)} al {fecha(d(fin), False)}.", body,
         crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")], ld=[ld], app=zone_app(z), clave=json.dumps([c['title'], [e['id'] for e in sel]]))
print(sum(1 for c in COLECCIONES if any(v[1] == f"/planes/{c['zona']}/{c['path']}/" for v in EN_COLECCION.values())), 'colecciones')

# ---------- lugares: «Programación de …» con sus próximos planes
def top_de(e):
    z = zpath.get(e['id'])
    while z and z.get('parent'):
        z = z['parent']
    return z
for v in LUGARES.values():
    l = v['evs']
    z = zpath.get(l[0]['id'])
    zt = top_de(l[0])
    cerca = ' · '.join(x for x in (re.sub(r'\s+,', ',', v.get('address') or '').strip() or None, z['name'] if z else None) if x)
    mapa = f"https://www.google.com/maps/search/?api=1&query={v['lat']},{v['lng']}" if v.get('lat') else ''
    # resumen propio de cada lugar, con sus datos: qué tipo de planes tiene, cuántos gratis y cuándo es el próximo
    cuenta_g = defaultdict(int)
    for e in l:
        for g in e['grupos'][:1]:
            cuenta_g[g] += 1
    tipos = [groups[g].lower() for g, _ in sorted(cuenta_g.items(), key=lambda x: -x[1])[:3]]
    gratis = sum(1 for e in l if e.get('is_free'))
    prox = next((e for e in l if not e['largo'] and d(e['starts_on']) >= HOY), None)
    res = ''
    if tipos:
        res += f"En {v['name']} hay sobre todo planes de {', '.join(tipos[:-1]) + ' y ' + tipos[-1] if len(tipos) > 1 else tipos[0]}"
        res += (' (uno de ellos, gratis).' if gratis == 1 else f' ({gratis} de ellos, gratis).') if gratis else '.'
    if prox:
        res += f" El próximo es «{prox['title']}», el {fecha(d(prox['starts_on']))}{', a las ' + prox['time_text'] if prox.get('time_text') and len(prox['time_text']) <= 8 else ''}."
    body = (f"<h1>{esc(v['name'])}</h1><p class='lead'>Programación y próximos planes: {len(l)} en las próximas semanas, actualizados cada día.</p>"
            + (f"<p>{esc(res.strip())}</p>" if res else '')
            + (f"<p class='m'>📍 {esc(cerca)}" + (f' · <a href="{esc(mapa)}" rel="nofollow noopener" target="_blank">Cómo llegar ↗</a>' if mapa else '') + '</p>' if cerca or mapa else '')
            + '<ul class="ev">' + ''.join(li(e, z) for e in l[:80]) + '</ul>'
            + (f'<p><a href="/planes/{z["path"]}/">Toda la agenda de {esc(z["name"])}</a></p>' if z else ''))
    pl = {'@context': 'https://schema.org', '@type': 'Place', 'name': v['name'], 'url': BASE + v['url'],
          'event': [{'@type': 'Event', 'name': e['title'], 'startDate': e['starts_on'], 'endDate': e['ends_on'], 'url': BASE + e['url'],
                     'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode', 'location': {'@type': 'Place', 'name': v['name']}} for e in l[:20]]}
    if v.get('address'):
        pl['address'] = {'@type': 'PostalAddress', 'streetAddress': v['address'], 'addressLocality': z['name'] if z else '', 'addressCountry': 'ES'}
    if v.get('lat'):
        pl['geo'] = {'@type': 'GeoCoordinates', 'latitude': v['lat'], 'longitude': v['lng']}
    cr = (crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")]) if z else [('Planes', '/planes/')]
    page(v['url'], f"{v['name']}: programación y próximos planes{' · ' + z['name'] if z else ''}",
         f"Programación de {v['name']}{' (' + z['name'] + ')' if z else ''}: {len(l)} planes próximos. " + ', '.join(e['title'] for e in l[:4]) + ' y más.',
         body, cr, ld=[pl], app=zone_app(z) if z else '/', clave=json.dumps([v['name'], v.get('address'), [e['id'] for e in l]]),
         grupo='lugares-' + (zt['path'] if zt else 'otras'))

# eventos
for e in evs:
    z = zpath.get(e['id'])
    srcs = [s for s in e.get('event_sources') or [] if re.match(r'(?i)https?://', s.get('url') or '')]
    abierta = any(ABIERTAS.search(((s.get('sources') or {}).get('license') or '')) for s in srcs)
    txt = e.get('description') or ''
    if not txt and e.get('details'):  # texto leído de la web del evento: solo un extracto, la ficha completa está en su web
        t = e['details'].split('\n\n')[0]
        txt = t if abierta or len(t) <= 320 else t[:300].rsplit(' ', 1)[0] + '…'
    sitio = ', '.join(x for x in (e['lugar'], z['name'] if z and z['name'] not in (e['lugar'] or '') else None) if x)
    precio = 'Gratis' if e.get('is_free') else (e.get('price_text') or '')
    gs = ' · '.join(groups[g] for g in e['grupos'])
    links = ''.join(f'<p><a href="{esc(s["url"])}" rel="nofollow noopener" target="_blank">Más información en {esc((s.get("sources") or {}).get("name") or "la web del evento")} ↗</a></p>' for s in srcs[:2])
    if not re.match(r'(?i)https?://', e.get('organizer_url') or ''):
        e['organizer_url'] = None
    if e.get('organizer_url') and not any(s['url'] == e['organizer_url'] for s in srcs):
        links += f'<p><a href="{esc(e["organizer_url"])}" rel="nofollow noopener" target="_blank">Web del organizador ↗</a></p>'
    body = f"<h1>{esc(e['title'])}</h1><p class='lead'>{esc(cuando(e))}{' · ' + esc(sitio) if sitio else ''}</p>"
    if e.get('direccion'):
        body += f"<p class='m'>📍 {esc(e['direccion'])}</p>"
    if e['img']:
        body += f'<img class="hero" src="{esc(e["img"])}" alt="" loading="lazy">'
    body += '<div class="card">' + (f'<p>{esc(txt)}</p>' if txt else '') + \
        (f'<p class="m">Precio: {esc(precio)}</p>' if precio else '') + (f'<p class="m">{esc(gs)}</p>' if gs else '') + links + \
        f'<p><a class="cta" href="{esc(app_link(e))}">Guardar en Limón y ver en el mapa</a></p></div>'
    if e['id'] in EN_COLECCION:
        n, u = EN_COLECCION[e['id']]
        body += f'<p><a href="{u}">Todo el programa de {esc(n)}</a></p>'
    if e['vid'] in LUGARES:
        body += f'<p><a href="{LUGARES[e["vid"]]["url"]}">Programación de {esc(LUGARES[e["vid"]]["name"])}</a></p>'
    if z:
        mas = [x for x in z['evs'] if x is not e and not x['largo'] and d(x['starts_on']) >= HOY][:6]
        if mas:
            body += f'<h2>Más planes en {esc(z["name"])}</h2><ul class="ev">' + ''.join(li(x, z) for x in mas) + f'</ul><p><a href="/planes/{z["path"]}/">Toda la agenda de {esc(z["name"])}</a></p>'
    loc = {'@type': 'Place', 'name': e['lugar'] or (z['name'] if z else ''), 'address': {'@type': 'PostalAddress', 'addressLocality': z['name'] if z else '', 'addressCountry': 'ES'}}
    if e.get('direccion'):
        loc['address']['streetAddress'] = e['direccion']
    if e.get('lat'):
        loc['geo'] = {'@type': 'GeoCoordinates', 'latitude': e['lat'], 'longitude': e['lng']}
    ld = {'@context': 'https://schema.org', '@type': 'Event', 'name': e['title'], 'startDate': e['starts_on'], 'endDate': e['ends_on'],
          'eventStatus': 'https://schema.org/EventScheduled', 'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode', 'location': loc,
          'url': BASE + e['url']}
    if txt:
        ld['description'] = txt[:500]
    if e['img']:
        ld['image'] = [e['img']]
    # entradas y organizador: solo lo que sabemos (no se inventa disponibilidad ni fecha de venta)
    web = e.get('organizer_url') or (srcs[0]['url'] if srcs else None)
    m = re.search(r'(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)', e.get('price_text') or '', re.I) or re.search(r'(?:€|euros?)\s*(\d+(?:[.,]\d{1,2})?)', e.get('price_text') or '', re.I)
    if e.get('is_free'):
        ld['isAccessibleForFree'] = True
        ld['offers'] = {'@type': 'Offer', 'price': 0, 'priceCurrency': 'EUR', 'url': web or BASE + e['url']}
    elif m:
        ld['offers'] = {'@type': 'Offer', 'price': float(m.group(1).replace(',', '.')), 'priceCurrency': 'EUR', 'url': web or BASE + e['url']}
    quien = e['lugar'] or ((srcs[0].get('sources') or {}).get('name') if srcs else None)
    if quien:
        ld['organizer'] = {'@type': 'Organization', 'name': quien}
        if web:
            ld['organizer']['url'] = web
    desc = f"{cuando(e)}{' en ' + sitio if sitio else ''}. " + (txt or f"{e['title']}: fecha, horario, lugar y precio.")
    cr = (crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")]) if z else [('Planes', '/planes/')]
    zt = top_de(e)
    page(e['url'], f"{e['title']} · {cuando(e)}{' · ' + z['name'] if z else ''}", desc, body, cr, ld=[ld], app=app_link(e), img=e['img'] or None,
         clave=json.dumps(ld, ensure_ascii=False, sort_keys=True), grupo='eventos-' + (zt['path'] if zt else 'otras'))

# ---------- eventos que ya pasaron: la página sigue (sin indexar ni en el mapa del sitio), con aviso y planes parecidos
zona_de_ciudad = {}
for z in zonas:
    if z['path'] in byc:
        zona_de_ciudad[z['path']] = z
for e in pasados:
    c = byc.get(e['city_id'])
    z = zona_de_ciudad.get(e['city_id']) or (zona_de_ciudad.get(c['parent']) if c and c.get('parent') else None)
    sitio = ', '.join(x for x in (e['lugar'], z['name'] if z and z['name'] not in (e['lugar'] or '') else None) if x)
    hasta = d(e['ends_on'])
    otros = []
    if e['vid'] in LUGARES:
        otros = [x for x in LUGARES[e['vid']]['evs'] if not x['largo']][:6]
    if len(otros) < 6 and z:
        mismos = [x for x in z['evs'] if x not in otros and not x['largo'] and set(x['grupos']) & set(e['grupos'])]
        otros += mismos[:6 - len(otros)]
    body = (f"<h1>{esc(e['title'])}</h1><div class='card'><p><b>Este plan ya pasó</b>: terminó el {esc(fecha(hasta))}.</p>"
            f"<p class='m'>{esc(sitio)}</p></div>" if sitio else
            f"<h1>{esc(e['title'])}</h1><div class='card'><p><b>Este plan ya pasó</b>: terminó el {esc(fecha(hasta))}.</p></div>")
    if otros:
        body += '<h2>Planes parecidos que vienen</h2><ul class="ev">' + ''.join(li(x, z) for x in otros) + '</ul>'
    if e['vid'] in LUGARES:
        body += f'<p><a href="{LUGARES[e["vid"]]["url"]}">Programación de {esc(LUGARES[e["vid"]]["name"])}</a></p>'
    if z:
        body += f'<p><a href="/planes/{z["path"]}/">Toda la agenda de {esc(z["name"])}</a> · <a class="cta" href="{esc(zone_app(z))}">Abrir Limón</a></p>'
    cr = (crumbs_of(z) + [(z['name'], f"/planes/{z['path']}/")]) if z else [('Planes', '/planes/')]
    page(e['url'], f"{e['title']} (ya pasó){' · ' + z['name'] if z else ''}", f"Este plan terminó el {fecha(hasta, False)}. Mira los próximos planes{' en ' + z['name'] if z else ''}.",
         body, cr, app=zone_app(z) if z else '/', noindex=True)
print(len(pasados), 'páginas de planes ya pasados (sin indexar)')

# ---------- Redes: carrusel semanal «Este finde en …» para Instagram (una cuenta por provincia, con el nombre de su capital)
# Se escribe cada diapositiva en HTML (1080×1350) y engine/src/redes.mjs las convierte en PNG; la página /redes/<cuenta>/ (sin indexar)
# muestra las imágenes para guardarlas en el móvil y el texto del post para copiarlo.
CUENTAS = [('madrid', 'madrid', 'Madrid', '#madrid #planesmadrid #quehacerenmadrid #agendamadrid #madridcultural #findesemana'),
           ('bilbao', 'bizkaia', 'Bilbao y Bizkaia', '#bilbao #bizkaia #planesbilbao #quehacerenbilbao #agendabilbao #bilbo #findesemana'),
           ('donostia', 'gipuzkoa', 'Donostia y Gipuzkoa', '#donostia #sansebastian #gipuzkoa #planesdonostia #agendadonostia #findesemana'),
           ('gasteiz', 'araba', 'Vitoria-Gasteiz y Araba', '#vitoria #gasteiz #vitoriagasteiz #araba #alava #planesvitoria #findesemana'),
           ('zaragoza', 'zaragoza', 'Zaragoza', '#zaragoza #planeszaragoza #quehacerenzaragoza #agendazaragoza #findesemana'),
           ('gijon', 'gijon', 'Gijón', '#gijon #xixon #asturias #planesgijon #agendagijon #findesemana'),
           ('barcelona', 'barcelona', 'Barcelona', '#barcelona #bcn #planesbarcelona #plansbarcelona #quefeubarcelona #agendabarcelona #capdesetmana')]
LEMON = open(os.path.join(WEB, 'limon.svg'), encoding='utf-8').read().replace('<title>Limón</title>', '')
SLIDE_CSS = """*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'IBM Plex Sans',sans-serif;color:#231D02;display:flex;flex-direction:column;align-items:center;text-align:center;padding:175px 140px}
.y{background:#FFD43B}.w{background:#FFF8DC}.brand{display:flex;align-items:center;gap:12px;font:italic 700 40px 'Space Grotesk'}
.brand svg{width:56px;height:56px}h1{font:700 92px/1.02 'Space Grotesk';letter-spacing:-2px;margin-top:auto}
.sub{font:500 42px/1.3 'IBM Plex Sans';margin-top:30px}.n{font:600 32px 'IBM Plex Sans';opacity:.65;margin-top:auto}
.dia{font:700 50px 'Space Grotesk';background:#231D02;color:#FFD43B;padding:12px 26px;border-radius:18px;margin-top:auto}
.t{font:700 74px/1.08 'Space Grotesk';letter-spacing:-1.5px;margin-top:40px;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.l{font:500 40px/1.3 'IBM Plex Sans';margin-top:34px;opacity:.85}.tags{display:flex;gap:16px;margin-top:32px;flex-wrap:wrap;justify-content:center}
.tag{font:600 34px 'IBM Plex Sans';background:#FFD43B;padding:10px 24px;border-radius:999px}.w .tag{background:#FFE88A}
.big{width:260px;height:260px;margin:auto auto 0}.url{font:700 52px 'Space Grotesk';margin-top:36px}"""


def slide(path, body, cls):
    out = os.path.join(WEB, path.strip('/'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(
        '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=IBM+Plex+Sans:wght@500;600&display=swap">'
        f'<style>{SLIDE_CSS}</style></head><body class="{cls}">{body}</body></html>')


REDES = []
byz = {z['path']: z for z in zonas}
for cuenta, zid, nombre, tags in CUENTAS:
    z = byz.get(zid)
    if not z:
        continue
    sel = picks([e for e in z['evs'] if not re.search(r'agotad|sold.?out|completo', e['title'], re.I)], vie, dom, n=7)
    if len(sel) < 3:
        continue
    rango = f"{vie.day}–{dom.day} {MESES[dom.month - 1][:3]}" if vie.month == dom.month else f"{vie.day} {MESES[vie.month - 1][:3]} – {dom.day} {MESES[dom.month - 1][:3]}"
    base = f'/redes/{cuenta}/'
    brand = f'<div class="brand">{LEMON}limón</div>'
    slide(base + 's0.html', f'{brand}<h1>Este finde en {esc(nombre)}</h1><div class="sub">{len(sel)} planes que no te puedes perder · <span style="white-space:nowrap">{rango}</span></div>'
                            '<div class="n">Desliza →</div>', 'y')
    for i, e in enumerate(sel, 1):
        g = (e['grupos'] or [''])[0]
        dia = 'Todo el finde' if e['largo'] or d(e['starts_on']) < vie else DIAS[d(e['starts_on']).weekday()].capitalize() + f" {d(e['starts_on']).day}"
        h = e.get('time_text') if e.get('time_text') and len(e['time_text']) <= 12 and not e['largo'] else ''
        zz = zpath.get(e['id'])
        sitio = ', '.join(x for x in (sitio_corto(e['lugar']) if e['lugar'] else None, zz['name'] if zz and zz is not z and zz['name'] not in (e['lugar'] or '') else None) if x)
        tg = ('<span class="tag">Gratis</span>' if e.get('is_free') else '') + (f'<span class="tag">{EMO.get(g, "")} {esc(groups.get(g, ""))}</span>' if g else '')
        slide(base + f's{i}.html', f'{brand}<div class="dia">{esc(dia)}{" · " + esc(h) if h else ""}</div><div class="t">{esc(e["title"])}</div>'
                                   f'<div class="l">📍 {esc(sitio or z["name"])}</div><div class="tags">{tg}</div><div class="n">{i}/{len(sel)}</div>', 'w')
    slide(base + f's{len(sel) + 1}.html', brand + LEMON.replace('<svg ', '<svg class="big" ', 1) +
                                         '<h1 style="margin-top:44px;font-size:78px">Y muchos más planes</h1><div class="sub">Con mapa, filtros y tu agenda, gratis.</div>'
                                         '<div class="url">limonplanes.com</div><div class="n">Enlace en la bio</div>', 'y')
    # textos por foto (Instagram deja poner un pie a cada imagen del carrusel)
    def pie(e):
        dia = 'Todo el finde' if e['largo'] or d(e['starts_on']) < vie else DIAS[d(e['starts_on']).weekday()].capitalize() + f" {d(e['starts_on']).day}"
        h = e.get('time_text') if e.get('time_text') and len(e['time_text']) <= 12 and not e['largo'] else ''
        precio = 'Gratis' if e.get('is_free') else (e.get('price_text') or '') if len(e.get('price_text') or '') <= 40 else ''
        txt = re.sub(r'\s+', ' ', e.get('description') or '').strip()
        if len(txt) > 220:
            txt = txt[:217].rsplit(' ', 1)[0] + '…'
        ls = [f"{ico(e)} {e['title']}", f"🗓️ {dia}{' · ' + h if h else ''}", f"📍 {e['lugar'].strip(' .') if e['lugar'] else z['name']}"]
        if precio:
            ls.append(f"🎟️ {precio}")
        if txt:
            ls += ['', txt]
        return '\n'.join(ls)
    pies = [f"🍋 {len(sel)} planes para este finde en {nombre} ({rango}). Desliza 👉"] + [pie(e) for e in sel] + \
           [f"✌️ Y muchos más: todos los planes de {nombre}, con mapa, filtros y tu agenda, gratis en limonplanes.com (enlace en la bio) 🍋"]
    texto = (f"🍋 Este finde en {nombre} ({rango}): {len(sel)} planes que no te puedes perder\n\n" +
             '\n'.join(f"{ico(e)} {e['title']} — {corto(e, vie)}" + (f", {sitio_corto(e['lugar'])}" if e['lugar'] else '') for e in sel) +
             f"\n\n✌️ Y esto es solo una parte: todos los planes de {nombre}, con mapa y filtros, en limonplanes.com (enlace en la bio) 👆"
             "\n\n🔒 Guárdate este carrusel para cuando toque decidir plan y compártelo con quien siempre te pregunta «¿qué hacemos este finde?»"
             f"\n\n{tags}")
    if cuenta == 'barcelona':  # en Barcelona, primero en catalán y después en castellano
        DIES = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte', 'diumenge']
        DC = ['dl.', 'dt.', 'dc.', 'dj.', 'dv.', 'ds.', 'dg.']
        def dia_ca(e, curt=False):
            if e['largo'] or d(e['starts_on']) < vie:
                return 'tot el cap de setmana'
            a = max(d(e['starts_on']), vie)
            return DC[a.weekday()] if curt else DIES[a.weekday()].capitalize() + f" {a.day}"
        def hora(e):
            return e.get('time_text') if e.get('time_text') and len(e['time_text']) <= 12 and not e['largo'] else ''
        def pie_bi(e, es):
            # título, lugar y descripción una sola vez (en el idioma de la fuente); fecha y precio, en catalán y en castellano
            cab, _, resto = es.partition('\n')
            info_es, _, desc = resto.partition('\n\n')
            lugar = next((l for l in info_es.split('\n') if l.startswith('📍')), '')
            es_ = '\n'.join(l for l in info_es.split('\n') if not l.startswith('📍'))
            h = hora(e)
            dca = dia_ca(e)
            precio = 'Gratuït' if e.get('is_free') else (e.get('price_text') or '') if len(e.get('price_text') or '') <= 40 else ''
            ca = '\n'.join([f"🗓️ {dca[0].upper() + dca[1:]}{' · ' + h if h else ''}"] + ([f"🎟️ {precio}"] if precio else []))
            return '\n'.join([cab, lugar, '', ca, '', es_] + (['', desc] if desc else []))
        pies = ([f"🍋 {len(sel)} plans per aquest cap de setmana a Barcelona ({rango}). Llisca 👉\n\n" + pies[0]] +
                [pie_bi(e, t) for e, t in zip(sel, pies[1:-1])] +
                ["✌️ I molts més: tots els plans de Barcelona, amb mapa, filtres i la teva agenda, gratis a limonplanes.com (enllaç a la bio) 🍋\n\n" + pies[-1]])
        texto_ca = (f"🍋 Aquest cap de setmana a Barcelona ({rango}): {len(sel)} plans que no et pots perdre\n\n" +
                    '\n'.join(f"{ico(e)} {e['title']} — {dia_ca(e, True)}{' ' + hora(e) if hora(e) else ''}" + (f", {sitio_corto(e['lugar'])}" if e['lugar'] else '') for e in sel) +
                    "\n\n✌️ I això només és una part: tots els plans de Barcelona, amb mapa i filtres, a limonplanes.com (enllaç a la bio) 👆"
                    "\n\n🔒 Desa't aquest carrusel per quan toqui decidir pla i comparteix-lo amb qui sempre et pregunta «què fem aquest cap de setmana?»")
        cuerpo_es = texto.rsplit('\n\n', 1)[0]
        texto = f"{texto_ca}\n\n—\n\n{cuerpo_es}\n\n{tags}"
    REDES.append({'cuenta': cuenta, 'nombre': nombre, 'rango': rango, 'slides': len(sel) + 2, 'texto': texto, 'pies': pies, 'tags': [None] + [e.get('ig') for e in sel] + [None], 'enlace': f"{BASE}/planes/{zid}/este-finde/"})
if REDES:
    json.dump(REDES, open(os.path.join(WEB, 'redes', 'redes.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(REDES), 'carruseles para redes')

# ---------- mapa del sitio: un índice (sitemap.xml) y un archivo por grupo (zonas, eventos y lugares de cada zona principal).
# La fecha de cambio de cada página solo avanza cuando cambia lo esencial (su «clave»); se guarda en lastmod.json, que se publica
# con la web y se lee al día siguiente (si no se puede leer, todas cuentan como cambiadas hoy).
hoy = HOY.isoformat()
try:
    with urllib.request.urlopen(BASE + '/lastmod.json', timeout=60) as r:
        antes = json.loads(r.read().decode())
except Exception as ex:
    print('sin lastmod.json anterior:', ex)
    antes = {}
ahora = {}
porgrupo = defaultdict(list)
for path, h, g in PAGES:
    prev = antes.get(path)
    fechac = prev[1] if prev and prev[0] == h else hoy
    ahora[path] = [h, fechac]
    porgrupo[g].append((path, fechac))
json.dump(ahora, open(os.path.join(WEB, 'lastmod.json'), 'w', encoding='utf-8'), separators=(',', ':'))
idx = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
for g in sorted(porgrupo):
    l = porgrupo[g]
    if g == 'zonas':
        l = [('/', hoy)] + l
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
         ''.join(f'<url><loc>{BASE}{p}</loc><lastmod>{f}</lastmod></url>\n' for p, f in l) + '</urlset>\n'
    open(os.path.join(WEB, f'sitemap-{g}.xml'), 'w', encoding='utf-8').write(sm)
    idx += f'<sitemap><loc>{BASE}/sitemap-{g}.xml</loc><lastmod>{max(f for _, f in l)}</lastmod></sitemap>\n'
open(os.path.join(WEB, 'sitemap.xml'), 'w', encoding='utf-8').write(idx + '</sitemapindex>\n')
print(len(PAGES), 'páginas en', len(porgrupo), 'mapas:', sum(p.startswith('/planes/') for p, _, _ in PAGES), 'de zonas,',
      sum(p.startswith('/evento/') for p, _, _ in PAGES), 'de eventos y', sum(p.startswith('/lugar/') for p, _, _ in PAGES), 'de lugares;',
      sum(1 for v in ahora.values() if v[1] == hoy), 'cambiadas hoy')
