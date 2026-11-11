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
- [ ] 2 · Unir planes con la misma URL de ficha y fecha
- [ ] 3 · Comparar títulos sin envoltorio y segunda pasada por cercanía
- [ ] 8 · Clave del plan estable
- [ ] 9 · Lugares y direcciones
- [ ] 10 · Limpieza de títulos sin cambiar la clave
- [ ] 7 · Publicar la web leyendo solo lo cambiado
- [ ] Repetir la medición tras una carga completa y anotar el resultado aquí

## Reglas

Nada de DELETE en la base: los sobrantes los retira el motor. No tocar `submitted_events` ni la fuente «Organizadores en Limón».
En `main` solo con aprobación.
