# Plan: ordenar el código de la app (web/js) — mejoras 1 y 2

Documento de traspaso. Lo puede seguir cualquier conversación sin más contexto que este archivo y el repositorio.

## Punto de partida (11-11-2026)

- `web/index.html` solo tiene el HTML. El estilo está en `web/css/app.css` y el código en `web/js/`.
- Son **scripts normales con nombres compartidos** (no módulos ES): lo que un archivo declara arriba del todo lo ven los demás.
- Los archivos por tema (`base`, `calendario`, `filtros`, `temporadas`, `tarjetas`, `compartir`, `calle`, `social`, `cuenta`,
  `parati`, `vistas`) **solo declaran** funciones y valores fijos. Llevan `defer`.
- Todo lo que **se ejecuta al arrancar** está en `js/inicio.js` (589 líneas), en su orden original. Lo carga `js/app.js`
  cuando `data.js` tiene los planes y los archivos por tema ya se han ejecutado.
- Hay batería de pruebas (ver README, «Batería de pruebas») y corre en cada push.

## Qué se quiere conseguir

1. **Que cada variable se cambie solo desde el archivo que la declara.** Es lo único que impide pasar algún día a módulos
   ES (`import`/`export`): un módulo puede leer una variable de otro, pero no asignarla.
2. **Repartir `inicio.js`**: que cada tema arranque lo suyo y atienda sus propios clics, y `inicio.js` quede como la lista
   ordenada de arranques.

Hacer **primero la 2 y luego la 1**: casi todas las asignaciones «desde otro archivo» están hoy en `inicio.js`, dentro de
manejadores que con la mejora 2 se van a su tema. Después de la 2 quedan muy pocas.

## Reglas (no negociables)

- **Nada cambia para el usuario.** Son movimientos de código, no cambios de comportamiento. Si aparece un fallo, se arregla
  en un commit aparte con su prueba.
- **Pasos pequeños: un tema por commit**, con la batería en verde antes de cada commit.
- Publicar solo en `pruebas`. Antes de cada push: `git pull --rebase origin pruebas`.
- En cada commit que toque `web/js` o `web/css`: subir el `?v=` de `index.html` (el mismo en todos, incluidas las tres
  precargas del principio). Si se añade o quita un archivo de `web/js`: actualizar la lista `SHELL` de `web/sw.js` y subir
  su `VERSION`. La prueba `engine/tests/app/pagina.test.mjs` falla si se olvida.
- No tocar la Content-Security-Policy ni añadir scripts en línea, dependencias o compilación.
- No cambiar `web/data.js` salvo lo imprescindible.
- **No llamar a una variable de nivel superior igual que un `id` del HTML** (hoy coinciden `taste` y `ventajas`; no añadir más).
- Los archivos por tema no pueden ejecutar nada al cargarse: solo `function`, y `const`/`let` con valores fijos
  (números, textos, listas y objetos literales, expresiones regulares, funciones flecha, `new Set`/`new Map` de literales).

## Cómo comprobar cada paso

```
python3 -m unittest discover -s engine/tests/motor          # motor
node --test engine/tests/app/*.test.mjs                     # funciones de la app y estructura de la página
(cd web && python3 -m http.server 8080 &)                   # servir la web
node engine/tests/flujos.mjs http://localhost:8080          # flujos en móvil y escritorio (necesita Playwright en engine/tests)
node engine/tests/humo.mjs http://localhost:8080            # con web/datos descargado de producción (ver humo.yml)
```

Los flujos deben pasar **tres veces seguidas** (así salió un fallo de carrera al cambiar el orden de carga). Después del
push, mirar en GitHub que «Batería de pruebas» y «Prueba de la app» pasan, y abrir pruebas.limonplanes.com en el móvil
(Safari no se puede probar en la batería).

Comprobación extra recomendada para cada movimiento: que el código movido es **el mismo, token a token**. Sirve un
script con `acorn` (no se sube al repositorio) que compare las sentencias de nivel superior de `web/js` antes y después
del commit: tienen que ser las mismas, solo cambiadas de archivo o envueltas en la función de arranque.

## Mejora 2 — repartir `inicio.js`

Qué hay hoy en `inicio.js`: 33 `const` y 17 `let` calculados al arrancar, 58 llamadas sueltas, 38 `addEventListener`
(uno de ellos, el de `click` sobre `document`, ocupa 182 líneas: de la 344 a la 526) y el primer pintado.

### 2a. El manejador de clics (lo más rentable y lo menos arriesgado)

Es una cadena de `if (ev.target.closest('…')) { …; return; }`. **El orden de las comprobaciones importa** (hay selectores
que se solapan), así que:

1. En cada archivo por tema, crear `function clicCalle(ev) { … return true; }` (devuelve `true` si lo ha atendido) con
   los bloques de ese tema **en el mismo orden relativo** en que están hoy.
2. En `inicio.js`, el manejador queda como una lista: `if (clicFiltros(ev) || clicCalle(ev) || …) return;`.
3. Si los bloques de un tema no están seguidos (hay otro tema en medio), **no reordenar**: partir en dos funciones
   (`clicCalle1`, `clicCalle2`) y llamarlas en el orden original. Unirlas más adelante, una a una, comprobando antes que
   ningún selector intermedio puede coincidir con el mismo elemento.
4. Un commit por tema. Empezar por los bloques del final de la cadena (son los que menos solapes tienen).

### 2b. Los demás `addEventListener` y las llamadas sueltas

1. Por cada tema, crear `function iniciaCalle() { … }` en su archivo con sus `addEventListener` y llamadas, en el mismo
   orden relativo.
2. `inicio.js` las llama en el punto donde estaba el primero de esos bloques. Si un tema tiene bloques separados por
   código de otro tema, partir en fases (`iniciaCalle1`, `iniciaCalle2`) en vez de reordenar.

### 2c. Las variables que `inicio.js` calcula al arrancar

Hoy son `const`/`let` de nivel superior en `inicio.js` porque su valor sale de los datos o del dispositivo
(`EV`, `BYID`, `CITY`, `today`, `HOY0`, `TEMPORADA`, `ZONE`, `prefs`, `saved`, `F`…). Dentro de una función dejarían de
verse desde otros archivos, así que:

1. Declararlas en su archivo por tema como `let nombre;` (sin valor: eso sí se puede declarar ahí).
2. Asignarlas dentro de `iniciaTema()`, en el mismo orden que hoy.
3. Cuidado con las que eran `const`: al pasar a `let` nada impide reasignarlas por error. Dejar un comentario
   «se fija al arrancar» y comprobar con una búsqueda que solo se asignan en su `inicia…()`.
4. `engine/tests/app/cargar.mjs` toma de `inicio.js` las líneas que calculan `today`, `HOY0` y `TEMPORADA`. Al moverlas,
   actualizar ahí de dónde se leen (la prueba falla diciendo qué línea falta).

Dejar para el final `DATA`, `TAX`, `sync`, `EV`, `BYID`, `CITY` y `today` (los usa todo) y moverlos juntos a `base.js`.

### Cuándo está terminada

`inicio.js` tiene menos de 80 líneas: recibe los datos, llama a los `inicia…()` en orden, hace el primer pintado y
devuelve la app a `data.js`.

## Mejora 1 — cada variable se cambia solo en su archivo

Medido hoy: 66 variables `let` de nivel superior; **24 se asignan desde otro archivo, en 31 sitios** (no hace falta
tocar las lecturas, solo esas asignaciones):

| Variable (declarada en) | Asignada además en |
|---|---|
| `logged`, `toastUndo` (base) | inicio |
| `RAIN`, `AVISOS` (calle) | inicio |
| `fichaHist`, `QD`, `FINDE` (compartir) | inicio |
| `orgEdit`, `myVersion`, `hiddenAt`, `statsDays` (cuenta) | inicio |
| `userPos` (filtros) | calle, inicio |
| `nearPos` (parati) | inicio |
| `IDEAS_TAB`, `IDEAS_SIM`, `qTimer`, `tabSes`, `FOLDS` (vistas) | inicio |
| `went`, `nofui`, `taste`, `fuiFocus` (inicio) | parati |
| `TOPICS`, `ventajas` (inicio) | social |

Pasos:

1. Repetir la medición después de la mejora 2: la mayoría de las filas «inicio» habrán desaparecido solas, porque el
   código que asignaba se habrá ido al archivo dueño.
2. Para cada asignación que quede desde otro archivo, elegir una de dos:
   - **Mover la variable** al archivo que más la cambia (si otro solo la lee).
   - **Añadir una función en el archivo dueño** que haga el cambio (`function ponUserPos(p) { userPos = p; }`) y llamarla
     desde fuera. Es el patrón que luego funciona igual con módulos ES.
3. No agrupar todo en un objeto gigante: `state` (en `base.js`) ya guarda el estado de la interfaz y no hace falta otro.
4. Al terminar, añadir a `engine/tests/app/pagina.test.mjs` una comprobación que lo vigile: leer `web/js/*.js`, sacar las
   variables `let` de nivel superior de cada archivo y fallar si alguna se asigna (`nombre =`, `nombre +=`, `nombre++`) en
   un archivo distinto del que la declara. Se puede hacer con expresiones regulares sobre el texto, sin dependencias.

## Lo que NO hay que hacer en estas dos mejoras

- Pasar a `import`/`export`: es un paso posterior y opcional (obliga a llevar el `?v=` a cada `import` o a un mapa de
  importaciones).
- Renombrar funciones o variables, «aprovechar para limpiar» o cambiar firmas.
- Cambiar el orden en que se ejecuta nada al arrancar.
- Quitar el `defer` de los archivos por tema, mover `js/app.js` de sitio o quitar las precargas: con 4G la app tarda
  1-2 s más en abrir (medido; lo vigila `pagina.test.mjs`).
