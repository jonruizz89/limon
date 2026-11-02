"""Busca la cuenta de Instagram oficial de los lugares con planes próximos, para etiquetarlos en los carruseles.

Para cada lugar sin Instagram guardado se miran las webs relacionadas (la web del lugar, la del organizador de sus
planes y las de las fuentes que lo traen), se buscan enlaces a instagram.com y se propone el más repetido.
Las propuestas quedan como instagram_estado = 'propuesta': solo se etiqueta cuando Jon las da por buenas ('ok').
Uso: python3 ig_salas.py [máximo de lugares]
"""
import collections, datetime as dt, re, sys, urllib.parse
from lib import sb, fetch

MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 60
# guías y agregadores: enlazan a su propio Instagram, no al del lugar
AJENOS = re.compile(r'(^|\.)(madrid\.es|esmadrid\.com|euskadi\.eus|kulturklik|zaragoza\.es|gijon\.es|barcelona\.cat|bcn\.cat|bilbao\.eus|'
                    r'bilbaokultura|donostia|vitoria-gasteiz|malaga\.eu|juntadeandalucia|gob\.es|taquilla\.com|entradas\.com|ticketmaster|'
                    r'eventbrite|fever|dice\.fm|google\.|facebook\.com|instagram\.com|youtube|wikipedia|x\.com|twitter\.com|ra\.co|'
                    r'bandsintown|songkick|wegow|giglon|todotix|atrapalo|elcorteingles|viralagenda|timeout)', re.I)
NO_USER = {'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'legal', 'developer', 'direct', 'sharer', 'share',
           'instagram', 'www', 'web', 'tags'}
IG = re.compile(r'instagram\.com/(?!p/|reel/|explore/)([A-Za-z0-9_.]{2,30})/?(?=["\'?#<\s])', re.I)

GENERICAS = {'centro', 'civico', 'cultural', 'teatro', 'teatre', 'museo', 'museu', 'sala', 'nacional', 'municipal', 'publica', 'biblioteca',
             'madrid', 'barcelona', 'bilbao', 'bizkaia', 'donostia', 'zaragoza', 'gijon', 'vitoria', 'gasteiz', 'catalunya', 'espacio', 'espai',
             'auditorio', 'auditori', 'palacio', 'casa', 'calle', 'carrer', 'plaza', 'placa', 'parque', 'lugar', 'determinar', 'fundacion',
             'arte', 'artes', 'contemporaneo', 'kultur', 'kulturgunea', 'etxea', 'aretoa'}
hoy = dt.date.today()
hasta = (hoy + dt.timedelta(days=12)).isoformat()
ciudades = [c['id'] for c in sb('GET', 'cities?select=id&status=eq.publicada') or []]
evs, off = [], 0
while True:
    part = sb('GET', f"events?select=venue_id,organizer_url,event_sources(url)&city_id=in.({','.join(ciudades)})"
                     f"&venue_id=not.is.null&ends_on=gte.{hoy.isoformat()}&starts_on=lte.{hasta}&order=id&offset={off}&limit=1000") or []
    evs += part
    if len(part) < 1000:
        break
    off += 1000
por_lugar = collections.defaultdict(list)
for e in evs:
    por_lugar[e['venue_id']].append(e)
ids = sorted(por_lugar, key=lambda v: -len(por_lugar[v]))
venues = {}
for k in range(0, len(ids), 200):
    for v in sb('GET', f"venues?select=id,name,website,instagram,instagram_estado&id=in.({','.join(map(str, ids[k:k + 200]))})") or []:
        venues[v['id']] = v
pend = [v for v in ids if v in venues and not venues[v].get('instagram') and venues[v].get('instagram_estado') is None][:MAX]
print(len(pend), 'lugares por mirar')
cache = {}
encontrados = 0
for vid in pend:
    v = venues[vid]
    urls = [v.get('website')] + [e.get('organizer_url') for e in por_lugar[vid]] + [s.get('url') for e in por_lugar[vid] for s in e.get('event_sources') or []]
    dominios = []
    for u in urls:
        if not u:
            continue
        dom = urllib.parse.urlparse(u).netloc.lower().removeprefix('www.')
        if dom and not AJENOS.search(dom) and dom not in dominios:
            dominios.append(dom)
    votos, origen = collections.Counter(), {}
    for dom in dominios[:3]:
        if dom not in cache:
            st, _, html, _ = fetch(f'https://{dom}/')
            cache[dom] = [h for h in IG.findall(html or '') if h.lower() not in NO_USER] if st == 200 else []
        for h in set(x.lower() for x in cache[dom]):
            votos[h] += 1
            origen.setdefault(h, dom)
    if not votos:
        continue
    # solo si la cuenta o la web se parecen al nombre del lugar: si no, suele ser la del organizador o la del festival
    import unicodedata
    fold = lambda t: ''.join(c for c in unicodedata.normalize('NFD', (t or '').lower()) if unicodedata.category(c) != 'Mn')
    claves = [w for w in re.findall(r'[a-z0-9]{4,}', fold(v['name'])) if w not in GENERICAS]
    votos = collections.Counter({h: n for h, n in votos.items() if any(w in h or w in origen[h].replace('.', '') for w in claves)})
    if not votos:
        continue
    h, n = votos.most_common(1)[0]
    sb('PATCH', f'venues?id=eq.{vid}', {'instagram': h, 'instagram_estado': 'propuesta', 'instagram_fuente': origen[h]}, 'return=minimal')
    encontrados += 1
    print(f"  {v['name'][:60]} → @{h} (en {origen[h]})")
print(encontrados, 'propuestas nuevas')
