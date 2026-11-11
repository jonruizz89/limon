# Cómo está organizado el código de la app (web/js)

Estado a 11-11-2026. Las dos mejoras de este plan (repartir `inicio.js` y que cada variable se cambie solo en su archivo)
**están hechas**. Este documento explica cómo queda, las reglas para seguir así y lo que se dejó sin hacer a propósito.

## Cómo queda

- `web/index.html` solo tiene el HTML; el estilo está en `web/css/app.css` y el código en `web/js/`.
- Son **scripts normales con nombres compartidos** (no módulos ES): lo que un archivo declara arriba del todo lo ven los demás.
- **Archivos por tema** (`base`, `calendario`, `filtros`, `temporadas`, `tarjetas`, `compartir`, `calle`, `social`, `cuenta`,
  `parati`, `vistas`): solo declaran funciones y variables; nada se ejecuta al cargarlos. Llevan `defer`. Cada uno tiene:
  - sus funciones de siempre;
  - `inicia…()`: lo que ese tema hace al arrancar, con las variables que fija declaradas justo encima;
  - `clic…(ev)`: una función por botón o enlace que atiende (el nombre sale de su `data-`: `[data-save]` → `clicSave`).
    Devuelve `true` si el clic era suyo y `false` si no;
  - `cambio…(ev)` y `envio…(ev)`: lo mismo para casillas/desplegables y formularios. Devuelven `false` si no era suyo.
- **`js/inicio.js` (64 líneas) solo dice el orden**: las llamadas a `inicia…()` y tres listas (`CLICS`, `CAMBIOS`, `ENVIOS`)
  que se recorren en orden; gana la primera función que reconoce el evento.
- `js/app.js` carga `inicio.js` cuando `data.js` tiene los planes y los archivos por tema ya se han ejecutado.

## Reglas

1. **El orden de `inicio.js` no se cambia** sin comprobar qué usa cada paso de los anteriores. En las listas de clics
   hay controles dentro de otros (un botón dentro de una tarjeta): por eso importa quién se prueba antes.
2. **Cada variable se asigna solo en el archivo que la declara.** Si otro archivo tiene que cambiarla, usa la función
   `pon…` del dueño (`ponSaved(x)`, `ponUserPos(p)`…) o se añade una: `function ponX(v) { return (x = v); }`.
3. **Lo marcado «se fija al arrancar» no se vuelve a asignar** (antes eran `const`).
4. Los archivos por tema no ejecutan nada al cargarse: lo que haya que ejecutar va dentro de una función `inicia…`.
5. No llamar a una variable de nivel superior igual que un `id` del HTML (quedan `taste` y `ventajas`, de antes).
6. En cada commit que toque `web/js` o `web/css`: subir el `?v=` de `index.html` (el mismo en todos, incluidas las tres
   precargas). Si se añade o quita un archivo: lista `SHELL` de `web/sw.js` y su `VERSION`.
7. No quitar el `defer`, ni mover `js/app.js`, ni quitar las precargas: con 4G la app tarda 1-2 s más en abrir.

Las reglas 2, 3, 5, 6 y 7 las vigila la batería (`engine/tests/app/estado.test.mjs` y `pagina.test.mjs`).

## Recetas

- **Un botón nuevo**: `function clicMiBoton(ev) { const b = ev.target.closest('[data-mi-boton]'); if (!b) return false; …; return true; }`
  en el archivo de su tema, y su nombre en la lista `CLICS` de `inicio.js` (al final, salvo que esté dentro de otro
  control que ya se atiende antes).
- **Un formulario nuevo**: `function envioMiForm(ev) { if (ev.target.id !== 'mi-form') return false; ev.preventDefault(); … return true; }`.
  Si necesita `await`, envolver lo asíncrono: `return (async () => { … })();` después del `preventDefault()`, que tiene
  que ejecutarse al momento.
- **Algo que calcular al arrancar**: dentro de la función `inicia…` de su tema; la variable, declarada encima.

## Cómo comprobar un cambio

```
python3 -m unittest discover -s engine/tests/motor          # motor
node --test engine/tests/app/*.test.mjs                     # funciones de la app, estructura de la página y estado
(cd web && python3 -m http.server 8080 &)                   # servir la web
node engine/tests/flujos.mjs http://localhost:8080          # flujos en móvil y escritorio (necesita Playwright en engine/tests)
node engine/tests/humo.mjs http://localhost:8080            # con web/datos descargado de producción (ver humo.yml)
```

Los flujos, tres veces seguidas. Después del push, mirar en GitHub «Batería de pruebas» y «Prueba de la app», y abrir
pruebas.limonplanes.com en el móvil (Safari no se puede probar en la batería).

## Lo que la batería no cubre

Los flujos son de visitante. No se prueban en navegador los clics y formularios que necesitan cuenta iniciada (perfil
público, seguir, listas, diario, quedadas, avisos, organizadores, revisión). Al tocar esas funciones, probarlas a mano en
pruebas con una cuenta.

## Lo que se dejó sin hacer (opcional)

- **Pasar a módulos ES (`import`/`export`)**: ya no lo impide el estado compartido. Obliga a llevar el `?v=` a cada
  `import` o a un mapa de importaciones, y a declarar qué usa cada archivo de los demás. Solo merece la pena si empiezan a
  chocar nombres o se añade compilación.
- **Agrupar funciones `clic…` de un mismo tema que van seguidas** en la lista: no cambia nada y haría los archivos algo
  más cortos, pero cada unión exige comprobar que ningún control intermedio se solapa.
- **Quitar las funciones `pon…`** moviendo cada variable al archivo que más la cambia (por ejemplo, `taste` a `parati.js`):
  hay que mover también su carga inicial sin alterar el orden del arranque.
