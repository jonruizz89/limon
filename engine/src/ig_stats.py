"""Guarda en Supabase (tabla ig_stats) las métricas diarias de las cuentas de Instagram de Limón.

Cada madrugada: la foto de seguidores de hoy y las métricas de los dos últimos días completos
(alcance, visualizaciones, me gusta, comentarios, guardados, compartidos, interacciones, cuentas que interactuaron, visitas al perfil).
Los seguidores nuevos de una semana salen de restar las fotos de seguidores (la API no da altas y bajas a cuentas de menos de 100).
Tokens: IG_<CUENTA>_TOKEN (nunca se imprimen). En el registro (repositorio público) solo sale qué se guardó, no las cifras privadas.
"""
import datetime as dt, json, os, sys, urllib.error, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

API = 'https://graph.facebook.com/v21.0'
IG_ID = {'madrid': '17841416628695228', 'bilbao': '17841410416056018', 'barcelona': '17841464371378986'}
METRICAS = {'reach': 'reach', 'views': 'views', 'likes': 'likes', 'comments': 'comments', 'saves': 'saves', 'shares': 'shares',
            'total_interactions': 'interactions', 'accounts_engaged': 'accounts_engaged', 'profile_views': 'profile_views'}
MAD = ZoneInfo('Europe/Madrid')
hoy = dt.datetime.now(MAD).date()


def get(tok, path, **q):
    q['access_token'] = tok
    with urllib.request.urlopen(f'{API}/{path}?{urllib.parse.urlencode(q)}', timeout=60) as r:
        return json.loads(r.read().decode())


def error(e):
    if isinstance(e, urllib.error.HTTPError):
        err = json.loads(e.read().decode() or '{}').get('error', {})
        return f"{e.code} {err.get('message', '')[:150]}"
    return str(e)[:150]


def upsert(filas):
    url = os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/ig_stats?on_conflict=day,cuenta'
    key = os.environ['SUPABASE_SECRET']
    req = urllib.request.Request(url, method='POST', data=json.dumps(filas).encode(),
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                          'Prefer': 'resolution=merge-duplicates,return=minimal'})
    urllib.request.urlopen(req, timeout=60)


fallos = 0
for cuenta, uid in IG_ID.items():
    tok = (os.environ.get(f'IG_{cuenta.upper()}_TOKEN') or '').strip()
    if not tok:
        print(f'{cuenta}: falta el secreto, se salta'); fallos += 1; continue
    ahora = dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        me = get(tok, uid, fields='followers_count,media_count')
        # me gusta y comentarios acumulados de todas las publicaciones (no necesitan el permiso de estadísticas)
        lk = cm = 0; url = None
        d = get(tok, f'{uid}/media', fields='like_count,comments_count', limit=100)
        while True:
            for x in d.get('data') or []:
                lk += x.get('like_count') or 0; cm += x.get('comments_count') or 0
            url = (d.get('paging') or {}).get('next')
            if not url:
                break
            with urllib.request.urlopen(url, timeout=60) as r:
                d = json.loads(r.read().decode())
        upsert([{'day': hoy.isoformat(), 'cuenta': cuenta, 'followers': me.get('followers_count'), 'posts': me.get('media_count'),
                 'likes_total': lk, 'comments_total': cm, 'updated_at': ahora}])
        print(f'{cuenta}: foto de hoy guardada (seguidores, publicaciones, me gusta y comentarios acumulados)')
    except Exception as e:
        print(f'{cuenta}: seguidores → {error(e)}'); fallos += 1; continue
    for atras in (1, 2):
        dia = hoy - dt.timedelta(days=atras)
        ini = dt.datetime.combine(dia, dt.time(), MAD)
        fila, sin = {'day': dia.isoformat(), 'cuenta': cuenta, 'updated_at': ahora}, []
        for m, col in METRICAS.items():
            try:
                d = get(tok, f'{uid}/insights', metric=m, period='day', metric_type='total_value',
                        since=int(ini.timestamp()), until=int((ini + dt.timedelta(days=1)).timestamp()))
                fila[col] = ((d.get('data') or [{}])[0].get('total_value') or {}).get('value', 0)
            except Exception as e:
                fila[col] = None; sin.append(f'{m} ({error(e)})')
        upsert([fila])
        if sin and all('(#10)' in x for x in sin) and len(sin) == len(METRICAS):
            print(f'{cuenta} {dia}: el token no tiene permiso de estadísticas (instagram_manage_insights); solo foto diaria')
        else:
            print(f'{cuenta} {dia}: {len(METRICAS) - len(sin)}/{len(METRICAS)} métricas guardadas' + (' · sin: ' + '; '.join(sin) if sin else ''))
        if len(sin) == len(METRICAS) and not all('(#10)' in x for x in sin):
            fallos += 1  # sin el permiso instagram_manage_insights (#10) no es un fallo: se queda con la foto diaria
sys.exit(1 if fallos else 0)
