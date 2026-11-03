"""Guarda en Supabase (tabla web_visits) los visitantes y páginas vistas diarios de Cloudflare Web Analytics.

Necesita CF_API_TOKEN (permiso «Account Analytics: Read») y CF_ACCOUNT_ID; si faltan, no hace nada.
El siteTag es el identificador público del recuento que ya lleva la web (no es secreto).
"""
import datetime as dt, json, os, sys, urllib.request

TOKEN, CUENTA = os.environ.get('CF_API_TOKEN', '').strip(), os.environ.get('CF_ACCOUNT_ID', '').strip()
SITE = '279d742c8af84146b16f4ef30d20adcc'
if not TOKEN or not CUENTA:
    print('Sin CF_API_TOKEN o CF_ACCOUNT_ID: no se cargan las visitas'); sys.exit(0)
hasta = dt.date.today()
desde = hasta - dt.timedelta(days=8)
q = """query($a:String!,$s:String!,$d:Date!,$h:Date!){viewer{accounts(filter:{accountTag:$a}){
  rumPageloadEventsAdaptiveGroups(limit:20,filter:{siteTag:$s,date_geq:$d,date_lt:$h},orderBy:[date_ASC]){
    count sum{visits} dimensions{date}}}}}"""
req = urllib.request.Request('https://api.cloudflare.com/client/v4/graphql', method='POST',
                             data=json.dumps({'query': q, 'variables': {'a': CUENTA, 's': SITE, 'd': desde.isoformat(), 'h': hasta.isoformat()}}).encode(),
                             headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=60) as r:
    res = json.loads(r.read().decode())
if res.get('errors'):
    sys.exit('Cloudflare: ' + '; '.join(e.get('message', '') for e in res['errors'])[:300])
filas = [{'day': g['dimensions']['date'], 'visitors': g['sum']['visits'], 'pageviews': g['count'], 'updated_at': dt.datetime.utcnow().isoformat() + 'Z'}
         for g in res['data']['viewer']['accounts'][0]['rumPageloadEventsAdaptiveGroups']]
url = os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/web_visits?on_conflict=day'
key = os.environ['SUPABASE_SECRET']
req = urllib.request.Request(url, method='POST', data=json.dumps(filas).encode(),
                             headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                      'Prefer': 'resolution=merge-duplicates,return=minimal'})
urllib.request.urlopen(req, timeout=60)
for f in filas:
    print(f"{f['day']}: {f['visitors']} visitas · {f['pageviews']} páginas vistas")
