"""Instagram (API de Instagram con inicio de sesión de Instagram, cuentas profesionales).

Uso: python3 src/ig_post.py <cuenta> yo        → comprueba el token (no publica nada)
     python3 src/ig_post.py <cuenta> carrusel  → publica el carrusel «Este finde» de limonplanes.com/redes/<cuenta>/
        (con IG_DRY=1 solo enseña lo que publicaría)
El token de cada cuenta va en el secreto IG_<CUENTA>_TOKEN (p. ej. IG_MADRID_TOKEN). Nunca se imprime.
"""
import json, os, sys, urllib.error, urllib.parse, urllib.request

API = 'https://graph.instagram.com'
cuenta, modo = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'yo')
# identificador de cada cuenta de Instagram en Meta (no es secreto); el token «unified login» (EAA…) no deja buscarlo
IG_ID = {'madrid': '17841416628695228', 'bilbao': '17841410416056018', 'barcelona': '17841464371378986'}
tok = (os.environ.get(f'IG_{cuenta.upper()}_TOKEN') or '').strip()
if not tok:
    sys.exit(f'Falta el secreto IG_{cuenta.upper()}_TOKEN')


def get(path, **q):
    q['access_token'] = tok
    try:
        with urllib.request.urlopen(f'{API}/{path}?{urllib.parse.urlencode(q)}', timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode() or '{}').get('error', {})
        sys.exit(f"Instagram respondió {e.code}: {err.get('message', '')[:200]} (tipo {err.get('type')}, código {err.get('code')})")


def probar_facebook():
    # token de Facebook (empieza por EAA…, p. ej. de usuario del sistema): la cuenta de Instagram se alcanza por graph.facebook.com
    global API
    API = 'https://graph.facebook.com/v21.0'
    me = get('me')
    print('Token de Facebook de:', json.dumps(me, ensure_ascii=False)[:200])
    try:
        dbg = get('debug_token', input_token=tok).get('data', {})
    except SystemExit as e:
        print('debug_token:', str(e)[:160]); dbg = {}
    print('Tipo:', dbg.get('type'), '· válido:', dbg.get('is_valid'), '· caduca:', dbg.get('expires_at'), '· permisos:', dbg.get('scopes'))
    ids = sorted({i for g in dbg.get('granular_scopes') or [] for i in g.get('target_ids') or []})
    print('Cuentas asignadas:', ids)
    for i in ids:
        try:
            info = get(i, fields='id,username,followers_count,media_count')
            print('  →', json.dumps(info, ensure_ascii=False))
        except SystemExit as e:
            print('  →', i, str(e)[:150])
    for path, f in (('me/accounts', 'name,instagram_business_account{id,username,followers_count,media_count}'),
                    ('me/businesses', 'id,name,owned_instagram_accounts{id,username},instagram_accounts{id,username}'),
                    ('me/assigned_pages', 'id,name,instagram_business_account{id,username}'),
                    ('me/ig_accounts', 'id,username')):
        try:
            q = {'fields': f, 'access_token': tok}
            with urllib.request.urlopen(f'{API}/{path}?{urllib.parse.urlencode(q)}', timeout=60) as r:
                print(path, '→', json.dumps(json.loads(r.read().decode()).get('data'), ensure_ascii=False)[:500])
        except urllib.error.HTTPError as e:
            print(path, '→', e.code, json.loads(e.read().decode() or '{}').get('error', {}).get('message', '')[:150])


if modo == 'yo':  # solo forma, nunca el contenido
    print(f'Token: {len(tok)} caracteres, empieza por «{tok[:3]}», solo letras y números: {tok.isalnum()}')
if modo == 'yo' and IG_ID.get(cuenta) and not tok.startswith('IG'):
    for host in ('https://graph.facebook.com/v21.0', 'https://graph.instagram.com/v21.0'):
        API = host
        try:
            me = get(IG_ID[cuenta], fields='id,username,followers_count,media_count')
            print(f"Token correcto ({host.split('/')[2]}): @{me.get('username')} · {me.get('media_count')} publicaciones · {me.get('followers_count')} seguidores")
            lim = get(f"{IG_ID[cuenta]}/content_publishing_limit", fields='quota_usage,config')
            print('Límite de publicación (24 h):', json.dumps(lim.get('data', lim), ensure_ascii=False)[:200])
            sys.exit(0)
        except SystemExit as e:
            if e.code == 0:
                raise
            print(host.split('/')[2], '→', str(e)[:200])
if modo == 'yo' and not tok.startswith('IG'):
    print('El token no es de «Instagram Login» (no empieza por IG): pruebo como token de Facebook')
    probar_facebook()
    sys.exit(0)
if modo == 'yo':
    me = get('me', fields='user_id,username,account_type,media_count,followers_count')
    print(f"Token correcto: @{me.get('username')} · cuenta {me.get('account_type')} · {me.get('media_count')} publicaciones · {me.get('followers_count')} seguidores")
    lim = get(f"{me.get('user_id') or me.get('id')}/content_publishing_limit", fields='quota_usage,config')
    print('Límite de publicación (24 h):', json.dumps(lim.get('data', lim), ensure_ascii=False)[:200])


def post(path, **q):
    q['access_token'] = tok
    req = urllib.request.Request(f'{API}/{path}', data=urllib.parse.urlencode(q).encode(), method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode() or '{}').get('error', {})
        sys.exit(f"Instagram respondió {e.code} en {path.split('/')[-1]}: {err.get('message', '')[:200]} ({err.get('error_user_msg', '')[:200]})")


def esperar(cid, intentos=30):
    import time
    for _ in range(intentos):
        st = get(cid, fields='status_code,status').get('status_code')
        if st == 'FINISHED':
            return
        if st in ('ERROR', 'EXPIRED'):
            sys.exit(f'Instagram no pudo procesar {cid}: {st}')
        time.sleep(5)
    sys.exit(f'Instagram tarda demasiado en procesar {cid}')


if modo == 'carrusel':
    import datetime as dt
    API = 'https://graph.facebook.com/v21.0'
    uid = IG_ID[cuenta]
    base = f'https://limonplanes.com/redes/{cuenta}/'
    with urllib.request.urlopen(base + 'post.json?x=' + dt.datetime.now().strftime('%H%M%S'), timeout=60) as r:
        p = json.loads(r.read().decode())
    texto = p['texto'] if len(p['texto']) <= 2200 else p['texto'][:2190].rsplit('\n', 1)[0] + '\n…'
    imgs = [f"{base}s{i}.jpg?v={p.get('v', '')}" for i in range(min(p['slides'], 10))]
    print(f"Carrusel de @{cuenta} · {p['nombre']} · {p['rango']} · {len(imgs)} imágenes · texto de {len(texto)} caracteres")
    print(texto[:600] + ('…' if len(texto) > 600 else ''))
    if os.environ.get('IG_DRY') == '1':
        print('Etiquetas:', ', '.join(f'foto {i + 1}: @{t}' for i, t in enumerate(p.get('tags') or []) if t) or 'ninguna')
        for u in imgs:  # comprobar que las imágenes existen antes de un día de verdad
            with urllib.request.urlopen(u, timeout=60) as r:
                assert r.status == 200 and r.headers.get('Content-Type', '').startswith('image/jpeg'), u
        print('Prueba: no se publica nada (IG_DRY=1). Las imágenes están accesibles.')
        sys.exit(0)
    tags = (p.get('tags') or []) + [None] * len(imgs)
    print('Etiquetas:', ', '.join(f'foto {i + 1}: @{t}' for i, t in enumerate(tags[:len(imgs)]) if t) or 'ninguna')
    hijos = []
    for u, t in zip(imgs, tags):
        extra = {'user_tags': json.dumps([{'username': t, 'x': 0.5, 'y': 0.85}])} if t else {}
        hijos.append(post(f'{uid}/media', image_url=u, is_carousel_item='true', **extra)['id'])
    for h in hijos:
        esperar(h)
    car = post(f'{uid}/media', media_type='CAROUSEL', children=','.join(hijos), caption=texto)['id']
    esperar(car)
    pub = post(f'{uid}/media_publish', creation_id=car)
    link = get(pub['id'], fields='permalink').get('permalink')
    print('Publicado:', link)
