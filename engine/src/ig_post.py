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


if modo == 'yo':
    me = get('me', fields='user_id,username,account_type,media_count,followers_count')
    print(f"Token correcto: @{me.get('username')} · cuenta {me.get('account_type')} · {me.get('media_count')} publicaciones · {me.get('followers_count')} seguidores")
    lim = get(f"{me.get('user_id') or me.get('id')}/content_publishing_limit", fields='quota_usage,config')
    print('Límite de publicación (24 h):', json.dumps(lim.get('data', lim), ensure_ascii=False)[:200])
