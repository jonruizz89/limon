# Calidad de los planes: plan de mejora y seguimiento

Medición repetible: `engine/tools/calidad.sql` (solo lectura, agregada). Rama de trabajo: `pruebas`.

## Línea base (10-11-2026, 13.375 planes vigentes en 10 zonas publicadas)

| Medida | Total | Notas |
|---|---|---|
| Duplicados por título (parejas) | 146 | Donostia 67, Madrid 34, Barcelona 28 |
| Comparten URL de origen (planes) | 1.290 | ~930 son de Kulturklik (web general del organizador) |
| Misma URL y misma fecha (parejas, aprox.) | 175 | duplicados reales |
| Horario raro | 209 | 153 texto sin hora, 24 cortados, 20 «00:00/01:00», 11 formato, 1 guiones |
| Hora vacía con hora en la descripción | 165 | |
| Solo categoría genérica | 158 | sin categoría: 0 |
| Etiqueta «latina» | 252 | la categoría es «Latina y española»: la mayoría son correctas |
| Dirección sin tipo de vía | 1.692 | aproximada |
| Recinto sin dirección | 4.703 | |
| Lugar que es una dirección | 627 | Barcelona 621 |
| Títulos con «*NOU*» / «Entradas …» / todo mayúsculas | 369 / 101 / 384 | |
| Enlaces no http(s) | 0 | |
| A más de 120 días fuera de grandes recintos | 0 | |

Lecturas de Supabase (estimación sin comprimir): publicar la web ~200 MB/día, clasificar ~130 MB/día.

## Mejoras (marcar al subir cada una a `pruebas`)

- [x] 1 · `classify.py` lee solo su ciudad
- [x] 4 · Normalizar la hora
- [x] 5 · Rellenar la hora vacía desde la descripción
- [x] 6 · Afinar la clasificación y reclasificar los afectados
- [x] 2 · Unir planes con la misma URL de ficha y fecha
- [x] 3 · Comparar títulos sin envoltorio y segunda pasada por cercanía
- [x] 8 · Clave del plan estable
- [x] 9 · Lugares y direcciones
- [x] 10 · Limpieza de títulos sin cambiar la clave
- [x] 7 · Publicar la web leyendo solo lo cambiado
- [x] Medición repetida en Donostia (carga de prueba con el motor de `pruebas`)
- [ ] Pasar a `main` (pendiente de aprobación) y repetir la medición en todas las zonas tras la primera carga nocturna

## Notas de lo aplicado

- Toda la limpieza está en `engine/src/calidad.py` (funciones puras) y se prueba con `python3 engine/tests/test_calidad.py`.
- Duplicados: `unir_duplicados` une dentro de cada carga (misma ficha de origen, o mismo título sin envoltorio en el mismo
  sitio y sin horas distintas); el sobrante que hubiera en la base lo retira `retire_stale_events` (no retira planes guardados).
  Si un plan cambia de clave (título o lugar retocados por la fuente), la fila de siempre toma la clave nueva: conserva id y guardados.
- Madrid, fuentes leídas con el motor genérico (salas, clubes): ahora también se retiran sus planes sobrantes, con tope del 10 %.
- Ensayo con los `events.json` reales contra una base simulada: Donostia 685 → 577 planes, Bilbao 683 → 675, Barcelona −29;
  la tercera carga no cambia nada (estable).
- Pendiente fuera de este plan: duplicados entre una ciudad y su provincia (cargas distintas); Barcelona sigue usando la
  calle como lugar cuando el equipamiento no está en el listado municipal (los datos no traen nombre); la dirección de los
  recintos ya situados (4.703 planes) necesita una pasada aparte por OpenStreetMap: hoy solo se guarda en los recintos nuevos.
- Los títulos limpios cambian la URL de la ficha (`/evento/id-titulo/`) de unos 470 planes.

## Resultado en Donostia (11-11-2026, carga de prueba desde `pruebas`)

| Medida | Antes | Después |
|---|---|---|
| Planes vigentes | 680 | 566 |
| Duplicados por título (parejas) | 65 | 11 (las que quedan tienen horas distintas o son plan y programa) |
| Horario raro | 18 | 2 |
| Títulos «Entradas …» | 19 | 0 |
| Títulos en mayúsculas | 19 | 2 |
| Sin categoría | 0 | 0 |

Mientras no esté en `main`, la carga nocturna (que corre desde `main`) vuelve a dejar Donostia como antes.

## Lecturas de Supabase (medido, comprimido)

- Publicar la web: antes leía los vigentes dos veces (export_events.py y site.py) y los terminados de 60 días, unas 33.000
  filas por publicación; ahora una sola lectura compartida (`engine/src/lectura.py`) y los terminados salen de la copia de
  la víspera: 13.500 filas, 14 peticiones, 4,6 MB comprimidos por publicación (antes unos 10 MB).
  Comprobado: con los mismos datos, la web generada por el código de main y por el nuevo es idéntica (21.904 ficheros).
- Clasificar: cada carga lee solo su ciudad (antes, todas las zonas en cada una de las 13 ejecuciones diarias).
- Ideas pendientes: que la publicación de las 04:37 reutilice la copia si ya se leyó ese día; `updated_at` con disparador
  para leer solo lo cambiado (pide un cambio en la base de datos).

## Reglas

Nada de DELETE en la base: los sobrantes los retira el motor. No tocar `submitted_events` ni la fuente «Organizadores en Limón».
En `main` solo con aprobación.
