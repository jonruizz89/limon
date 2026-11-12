"""Guarda en Supabase cómo le va a limonplanes.com en Google (Search Console), para el parte diario.

- search_daily: clics, impresiones y posición media por día y por tipo de página (total, portada, zona, intención,
  navidad, colección, lugar, evento, otras). Search Console tarda 2-3 días en cerrar un día: se reescriben los
  últimos 10 cada vez.
- search_queries: las 30 búsquedas con más impresiones de los últimos 7 días cerrados.

Necesita GSC_SERVICE_ACCOUNT: la clave JSON de una cuenta de servicio con permiso «Restringido» (solo lectura) en la
propiedad sc-domain:limonplanes.com. Si falta, no hace nada. La clave nunca se imprime.
"""
import base64, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict

SA = os.environ.get('GSC_SERVICE_ACCOUNT', '').strip()
SITIO = 'sc-domain:limonplanes.com'
if not SA:
    print('Sin GSC_SERVICE_ACCOUNT: no se lee Search Console'); sys.exit(0)

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

cuenta = json.loads(SA)


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def token():
    ahora = int(time.time())
    cab = _b64(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode())
    cuerpo = _b64(json.dumps({'iss': cuenta['client_email'], 'scope': 'https://www.googleapis.com/auth/webmasters.readonly',
                              'aud': 'https://oauth2.googleapis.com/token', 'iat': ahora, 'exp': ahora + 3600}).encode())
    clave = serialization.load_pem_private_key(cuenta['private_key'].encode(), password=None)
    firma = _b64(clave.sign(f'{cab}.{cuerpo}'.encode(), padding.PKCS1v15(), hashes.SHA256()))
    datos = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': f'{cab}.{cuerpo}.{firma}'}).encode()
    with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=datos), timeout=30) as r:
        return json.loads(r.read().decode())['access_token']


TOK = token()


def consulta(cuerpo):
    url = f'https://searchconsole.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(SITIO, safe="")}/searchAnalytics/query'
    req = urllib.request.Request(url, method='POST', data=json.dumps(cuerpo).encode(),
                                 headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode()).get('rows', [])
    except urllib.error.HTTPError as e:
        sys.exit(f'Search Console: {e.code} {e.read().decode()[:300]}')


INTENCION = re.compile(r'^/planes/[^/]+(/[^/]+)?/(hoy|manana|gratis|con-ninos|este-finde(/gratis)?)/$')
NAVIDAD = re.compile(r'/(navidad|mercadillos-navidenos|belenes|luces-de-navidad|cabalgata-de-reyes|nochevieja|puente-de-diciembre)/$')


def grupo(url):
    p = urllib.parse.urlparse(url).path or '/'
    if p == '/':
        return 'portada'
    if p.startswith('/evento/'):
        return 'evento'
    if p.startswith('/lugar/'):
        return 'lugar'
    if p.startswith('/planes/'):
        if NAVIDAD.search(p):
            return 'navidad'
        if INTENCION.match(p):
            return 'intencion'
        partes = [x for x in p.split('/') if x][1:]
        return 'zona' if len(partes) <= 2 else 'coleccion'
    return 'otras'


hasta = dt.date.today() - dt.timedelta(days=2)
desde = hasta - dt.timedelta(days=9)
filas = consulta({'startDate': desde.isoformat(), 'endDate': hasta.isoformat(), 'dimensions': ['date', 'page'], 'rowLimit': 25000, 'dataState': 'all'})
suma = defaultdict(lambda: [0, 0, 0.0])  # clics, impresiones, posición×impresiones
for f in filas:
    dia, url = f['keys']
    for g in ('total', grupo(url)):
        s = suma[(dia, g)]
        s[0] += f['clicks']; s[1] += f['impressions']; s[2] += f['position'] * f['impressions']
ahora = dt.datetime.now(dt.timezone.utc).isoformat()
diarias = [{'day': d, 'grupo': g, 'clicks': int(c), 'impressions': int(i), 'position': round(p / i, 2) if i else None, 'updated_at': ahora}
           for (d, g), (c, i, p) in sorted(suma.items())]

fin = hasta
semana = consulta({'startDate': (fin - dt.timedelta(days=6)).isoformat(), 'endDate': fin.isoformat(), 'dimensions': ['query'], 'rowLimit': 200})
semana.sort(key=lambda f: -f['impressions'])
busquedas = [{'week_end': fin.isoformat(), 'query': f['keys'][0][:200], 'clicks': int(f['clicks']), 'impressions': int(f['impressions']),
              'position': round(f['position'], 2)} for f in semana[:30]]


def guardar(tabla, conflicto, datos):
    if not datos:
        return
    url = os.environ['SUPABASE_URL'].rstrip('/') + f'/rest/v1/{tabla}?on_conflict={conflicto}'
    key = os.environ['SUPABASE_SECRET']
    req = urllib.request.Request(url, method='POST', data=json.dumps(datos).encode(),
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                          'Prefer': 'resolution=merge-duplicates,return=minimal'})
    urllib.request.urlopen(req, timeout=60)


guardar('search_daily', 'day,grupo', diarias)
guardar('search_queries', 'week_end,query', busquedas)
for r in diarias:
    if r['grupo'] == 'total':
        print(f"{r['day']}: {r['clicks']} clics · {r['impressions']} impresiones · posición {r['position']}")
por_grupo = defaultdict(lambda: [0, 0])
for r in diarias:
    if r['grupo'] != 'total':
        por_grupo[r['grupo']][0] += r['clicks']; por_grupo[r['grupo']][1] += r['impressions']
print('Por tipo de página (10 días):', ', '.join(f'{g} {c}/{i}' for g, (c, i) in sorted(por_grupo.items(), key=lambda x: -x[1][1])))
print('Búsquedas de la semana:', '; '.join(f"{b['query']} ({b['impressions']})" for b in busquedas[:10]))
