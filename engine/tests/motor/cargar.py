"""Carga funciones sueltas de los scripts del motor sin ejecutar el resto del archivo.

Los scripts de engine/src leen la base de datos o descargan fuentes nada más arrancar, así que no se pueden importar en una
prueba. Aquí se toman del código solo las funciones y constantes pedidas (por nombre) y se ejecutan aparte.
"""
import ast, collections, datetime, difflib, html, json, os, re, unicodedata

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src')


def cargar(archivo, nombres, **entorno):
    """cargar('load_supabase.py', ['http_only']) → espacio de nombres con esas funciones (y lo que se pase en `entorno`)."""
    ruta = os.path.join(SRC, archivo)
    arbol = ast.parse(open(ruta, encoding='utf-8').read())
    faltan, cuerpo = set(nombres), []
    for nodo in arbol.body:
        if isinstance(nodo, (ast.FunctionDef, ast.ClassDef)):
            suyos = {nodo.name}
        elif isinstance(nodo, ast.Assign):
            suyos = {t.id for t in nodo.targets if isinstance(t, ast.Name)}
        else:
            continue
        if suyos & faltan:
            cuerpo.append(nodo)
            faltan -= suyos
    if faltan:
        raise AssertionError(f'{archivo} ya no define {sorted(faltan)}: revisa la prueba')
    ns = {'re': re, 'json': json, 'difflib': difflib, '_dl': difflib, 'unicodedata': unicodedata, 'html': html, 'dt': datetime,
          'collections': collections, 'os': os}
    ns.update(entorno)
    exec(compile(ast.Module(body=cuerpo, type_ignores=[]), ruta, 'exec'), ns)
    return ns
