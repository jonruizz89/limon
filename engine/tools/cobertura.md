# Cobertura de las zonas publicadas (11-11-2026)

Qué tenemos frente a lo que hay en cada ciudad. Datos: consultas agregadas a la base, la auditoría de cobertura del motor
(`coverage_runs`, `source_candidates`) y un sondeo sin IA de 75 webs candidatas (robots.txt, estado y formato).

## Lo que tenemos

| Zona | Planes vigentes | Esta semana | Fuentes activas (a cero) | Lo más flojo |
|---|---|---|---|---|
| Barcelona | 5.859 | 3.707 | 29 (1) | gastro, cine; la mitad son talleres de centros cívicos |
| Madrid | 2.561 | 1.201 | 25 (4) | gastro (26), deporte, música en salas; 226 sin distrito |
| Bizkaia + Bilbao | 1.487 | 434 | 15 (3) | deporte (11), ferias, gastro, naturaleza; barrios de Bilbao fuera de Abando |
| Zaragoza | 1.483 | 1.002 | 22 (1) | cine (37); la auditoría de cobertura no corre aquí |
| Gipuzkoa + Donostia | 1.211 | 402 | 24 (1) | deporte (13), gastro, ferias; Donostia sin barrios |
| Araba + Vitoria | 538 | 177 | 13 (1) | deporte (7), gastro; Vitoria sin barrios; la auditoría no corre en Araba |
| Gijón | 168 | 77 | 13 (1) | escena (9), cine (7); 99 planes sin distrito |

Fuentes activas que no traen nada: RJB, Museo Thyssen y Estrenos de cine (Madrid), Filmoteca de Catalunya (Barcelona),
Hika Ateneo y BAD (Bilbao), Asturies Cultura en Rede (Gijón) y Ticketmaster en Bizkaia, Araba y Donostia.

## Huecos por impacto

| # | Zona | Qué falta | Fuente propuesta | Licencia o permiso | Lectura | Sondeo |
|---|---|---|---|---|---|---|
| 1 | Barcelona | Agenda cultural de la Generalitat: 414 actos vigentes en la ciudad; hoy leemos 2 | API de datos abiertos (analisi.transparenciacatalunya.cat, `rhpv-yr4f`) | Datos abiertos de la Generalitat, con atribución | Estable (API) | Comprobado |
| 2 | Madrid | Fuentes a cero o sin leer con formato estable: RJB (20 actos), Thyssen, Cineteca, Galileo Galilei | Sus propias webs | Enlace a la ficha y datos básicos | Estable (JSON-LD, iCal) | Comprobado |
| 3 | Madrid | Deporte municipal: 37 actividades que no están en las dos agendas que leemos | datos.madrid.es `212504` | CC BY 4.0 | Estable (datos abiertos) | Comprobado |
| 4 | Madrid | Agenda de la Comunidad de Madrid: el mayor candidato de la auditoría (46 huecos) | comunidad.madrid | Por confirmar en su aviso legal | Probablemente IA | La dirección que probé no existe; falta localizarla |
| 5 | Bizkaia, Gipuzkoa, Araba | Deporte popular, ferias, gastronomía y fiestas: la auditoría da entre el 85 % y el 100 % sin cubrir | Kirolprobak (carreras), agendas de bizkaia.eus y gipuzkoa.eus | Enlace a la ficha; Bertsozale limita peticiones (429): pedir permiso | IA | Responden; sin formato estable |
| 6 | Gijón | Teatro y escena (9 planes): Teatro Jovellanos y Laboral | Sus webs | Enlace a la ficha | IA; Jovellanos carga por JavaScript | Sin contenido legible en el sondeo |
| 7 | Bilbao | Programación propia de Arriaga, Azkuna Zentroa, Bellas Artes, Kafe Antzokia, Bilbao Gazte, Guggenheim (actividades) | Sus webs | Enlace a la ficha | IA | Responden; sin JSON-LD |
| 8 | Bilbao | Barrios (Uribarri 3, Basurto 2): centros municipales de distrito | Agenda del Ayuntamiento | Pedir permiso: bloquea el acceso (403) | — | Bloqueada |
| 9 | Donostia y Vitoria | Los planes no tienen barrio (todo «sin distrito») | No es una fuente: definir los barrios en la configuración de la ciudad | — | — | — |
| 10 | Madrid | Música en salas (40 % sin cubrir): El Sol, Clamores, Café Berlín, Casa de América, Teatro Español, Abadía, Auditorio Nacional, MAN | Sus webs | Enlace a la ficha | IA (El Sol y Casa de América enlazan un iCal) | Responden |
| 11 | Madrid, Barcelona, Zaragoza | CaixaForum (3 centros) y CosmoCaixa | caixaforum.org, cosmocaixa.org | Pedir permiso a Fundación "la Caixa": bloquean el acceso (403) | — | Bloqueadas |
| 12 | Barcelona | Grandes escenarios: Liceu, Palau de la Música, Mercat de les Flors, Razzmatazz, Fundació Miró; Filmoteca a cero | Sus webs | Enlace a la ficha | IA | Responden; sin JSON-LD |
| 13 | Vitoria | Artium y centros cívicos (la agenda municipal trae 5 planes y enlaza 40 fichas) | vitoria-gasteiz.org, artium.eus | Enlace a la ficha | IA | Responden |
| 14 | Zaragoza | Salas y cine: Teatro Arbolé, agenda de Cultura de Aragón; activar la auditoría | Sus webs | Enlace a la ficha | IA | Responden |
| 15 | Todas | Deporte profesional (fútbol, baloncesto): no hay fuente con licencia abierta | Calendario de cada club | Pedir permiso o leer la web del club | IA | Sin sondear |
| 16 | Madrid | Prado, Biblioteca Nacional, Planetario | Sus webs | Pedir permiso: bloquean el acceso (403) | — | Bloqueadas |

Sin sondear por dirección equivocada (404) o sin acceso desde aquí: La Casa Encendida, Teatro de la Zarzuela, CCCB, Teatre
Lliure, TNC, MNAC, BEC, Tabakalera, San Telmo, Las Armas, Sala Oasis, Laboral, Turismo Asturias y los eventos turísticos de
Open Data Euskadi. El paso de descubrimiento del motor (`discover.py`) localiza la dirección buena.
