-- Medición de la calidad de los planes vigentes de las zonas publicadas (solo lectura, todo agregado).
-- Se lanza en el editor SQL de Supabase (proyecto Limon). Cada bloque es una consulta independiente.

-- A) Horarios, direcciones, lugares y títulos, por zona
with ev as (
 select e.id, e.city_id, e.title, e.time_text tt, e.description d, e.venue_id, v.address addr, v.name vname
 from events e join cities c on c.id=e.city_id left join venues v on v.id=e.venue_id
 where c.status='publicada' and e.ends_on>=current_date)
select coalesce(city_id,'TOTAL') zona, count(*) vigentes,
 count(*) filter (where tt ~ '--|—\s*$' or tt ~ '^\W+$') h_guiones,
 count(*) filter (where tt ~ '[:,\-–/(+]\s*$' or tt ~* '\s(a|y|de|del|las|los|el|la)$' or tt ~ '\d{1,2}:\d?$' or length(tt)>=198
   or (length(tt)-length(replace(tt,'(','')))<>(length(tt)-length(replace(tt,')','')))) h_cortado,
 count(*) filter (where tt ~ '^0?[01]:00$') h_00_01,
 count(*) filter (where tt ~ '\d{1,2}:\d{2}:\d{2}' or tt ~ '^\d{1,2}\.\d{2}$' or tt ~ '^\d{1,2};') h_formato,
 count(*) filter (where tt is not null and tt !~ '\d') h_sin_cifras,
 count(*) filter (where tt is null and d ~* '(\m([01]?\d|2[0-3])[:.][0-5]\d\s*(h|horas)?\M|\m([01]?\d|2[0-3])\s*(h|horas)\M|a las? ([01]?\d|2[0-3])\M)') h_vacio_con_hora,
 count(*) filter (where venue_id is not null and (addr is null or btrim(addr)='')) recinto_sin_direccion,
 count(*) filter (where addr is not null and btrim(addr)<>'' and addr !~* '(\m(calle|c/|cl\.?|avda\.?|av\.?|avenida|plaza|pza\.?|pl\.?|paseo|ps\.?|camino|carretera|ctra\.?|ronda|glorieta|gta\.?|traves[ií]a|costanilla|cuesta|callejón|pasaje|pje\.?|parque|bulevar|rambla|v[ií]a|urbanizaci[oó]n|pol[ií]gono|muelle|puente|alameda|carrer|c\.|passeig|pg\.?|plaça|avinguda|passatge|ptge\.?|travessera|cam[ií]|moll|kalea|etorbidea|enparantza|pasealekua|bidea|ibilbidea|zumarkalea|plazatxoa|kaia|hiribidea|barrio|auzoa|r[úu]a|campo|jardines|jard[ií]n|recinto|explanada|lugar|praza)(\M|\s|$))') dir_sin_via,
 count(*) filter (where vname ~* '^(c|cl|carrer|calle|av|avda|avinguda|avenida|pg|passeig|paseo|pl|plaça|plaza|ptge|passatge|rbla|rambla|ronda|via|moll|travessera|camí|cami|ctra)\.?\s+.*\d') lugar_es_direccion,
 count(*) filter (where vname ~ ',.*\d') lugar_con_direccion_pegada,
 count(*) filter (where title ~* '^entradas\s') t_entradas,
 count(*) filter (where title ~ '\*\s*N(OU|EW|UEVO)?\s*\*') t_nou,
 count(*) filter (where title = upper(title) and title ~ '[A-ZÁÉÍÓÚÑ]{6,}') t_mayusculas
from ev group by rollup(city_id) order by (city_id is null) desc, 2 desc;

-- B) Categorías, enlaces, horizonte y URL compartida, por zona
with ev as materialized (
 select e.id, e.city_id, coalesce(c.parent,c.id) grp, e.starts_on, e.ai_hash
 from events e join cities c on c.id=e.city_id where c.status='publicada' and e.ends_on>=current_date
), es as materialized (
 select ev.id, ev.grp, ev.starts_on, x.url, s.layer, (s.config ? 'horizonte_dias') hz
 from ev join event_sources x on x.event_id=ev.id join sources s on s.id=x.source_id
), urlc as materialized (select grp, url, count(distinct id) n from es where url is not null group by 1,2),
urld as materialized (select grp, url, starts_on, count(distinct id) n from es where url is not null group by 1,2,3),
sa as (select es.id, count(*) nsrc, count(*) filter (where es.url is not null and es.url !~* '^https?://') url_mal,
   bool_or(es.hz or es.layer='recinto') gran, max(u.n) max_comp, max(d.n) filter (where u.n<=3) misma_fecha
  from es left join urlc u on u.grp=es.grp and u.url=es.url left join urld d on d.grp=es.grp and d.url=es.url and d.starts_on=es.starts_on group by es.id),
ca as (select ec.event_id id, count(*) ncat, count(*) filter (where not k.is_generic and k.group_id<>'otros') buenas,
   bool_or(ec.category_id='latina') latina
  from event_categories ec join categories k on k.id=ec.category_id where ec.event_id in (select id from ev) group by 1)
select coalesce(ev.city_id,'TOTAL') zona, count(*) vig,
 count(*) filter (where ca.id is null) sin_cat, count(*) filter (where ca.ncat>0 and ca.buenas=0) solo_generica, count(*) filter (where ca.latina) cat_latina,
 count(*) filter (where sa.url_mal>0) enlace_no_http,
 count(*) filter (where ev.starts_on>current_date+120 and not coalesce(sa.gran,false)) mas120_no_gran,
 count(*) filter (where sa.max_comp>=2) comparten_url, count(*) filter (where sa.misma_fecha>=2) misma_url_y_fecha
from ev left join sa on sa.id=ev.id left join ca on ca.id=ev.id
group by rollup(ev.city_id) order by (ev.city_id is null) desc, 2 desc;

-- C) Duplicados por título: mismo día y mismo sitio (recinto o a menos de ~300 m), título igual o uno dentro del otro
with ev as (
  select e.id, e.city_id, coalesce(c.parent, c.id) grp, e.starts_on, e.venue_id, e.lat, e.lng,
    trim(regexp_replace(regexp_replace(translate(lower(e.title),'áàäâéèëêíìïîóòöôúùüûñç','aaaaeeeeiiiioooouuuunc'),'[^a-z0-9 ]+',' ','g'),'\s+',' ','g')) t
  from events e join cities c on c.id=e.city_id where c.status='publicada' and e.ends_on >= current_date)
select coalesce(a.city_id,'TOTAL') zona, count(*) filter (where a.t=b.t) titulo_igual,
  count(*) filter (where a.t<>b.t) uno_contiene_otro, count(*) parejas
from ev a join ev b on a.grp=b.grp and a.starts_on=b.starts_on and a.id<b.id
where (a.venue_id=b.venue_id or (a.lat is not null and b.lat is not null and abs(a.lat-b.lat)<0.003 and abs(a.lng-b.lng)<0.004))
  and (a.t=b.t or (length(a.t)>=10 and length(b.t)>=10 and (position(a.t in b.t)>0 or position(b.t in a.t)>0)))
group by rollup(a.city_id) order by (a.city_id is null) desc, 4 desc;
