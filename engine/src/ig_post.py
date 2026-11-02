"""Instagram (API de Instagram con inicio de sesión de Instagram, cuentas profesionales).

Uso: python3 src/ig_post.py <cuenta> yo        → comprueba el token (no publica nada)
El token de cada cuenta va en el secreto IG_<CUENTA>_TOKEN (p. ej. IG_MADRID_TOKEN). Nunca se imprime.
"""
import json, os, sys, urllib.error, urllib.parse, urllib.request

API = 'https://graph.instagram.com'
cuenta, modo = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'yo')
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
if modo == 'yo' and not tok.startswith('IG'):
    print('El token no es de «Instagram Login» (no empieza por IG): pruebo como token de Facebook')
    probar_facebook()
    sys.exit(0)
if modo == 'yo':
    me = get('me', fields='user_id,username,account_type,media_count,followers_count')
    print(f"Token correcto: @{me.get('username')} · cuenta {me.get('account_type')} · {me.get('media_count')} publicaciones · {me.get('followers_count')} seguidores")
    lim = get(f"{me.get('user_id') or me.get('id')}/content_publishing_limit", fields='quota_usage,config')
    print('Límite de publicación (24 h):', json.dumps(lim.get('data', lim), ensure_ascii=False)[:200])
