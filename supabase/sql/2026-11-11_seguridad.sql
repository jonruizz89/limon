-- Limón · auditoría de seguridad y privacidad del 11 de noviembre de 2026.
-- Aplicado en el proyecto «Limon» como tres migraciones (seguridad_1_funciones, seguridad_2_limites, seguridad_3_permisos).
-- No borra ni cambia datos de usuarios: solo políticas, límites, funciones y permisos.
-- Las referencias (A1, M2…) son las del informe; el resumen está en supabase/sql/README.md.

-- =====================================================================================================
-- 1 · FUNCIONES Y POLÍTICAS
-- =====================================================================================================

-- ---------- A1 · afinidad entre categorías: nada con menos de 10 personas detrás
drop policy if exists affinity_read on public.category_affinity;
create policy affinity_read on public.category_affinity for select to anon, authenticated
  using (users_ab >= 10 and users_a >= 10 and users_b >= 10);

create or replace function public.refresh_affinity(p_min integer default 10)
returns integer language plpgsql security definer set search_path = public as $$
declare n int; total int;
begin
  p_min := greatest(coalesce(p_min, 10), 10);  -- nunca menos de 10 personas por dato
  create temp table _likes on commit drop as
  with sig as (
    select user_id, category_id, 3 w from user_interests where value = 1
    union all select s.user_id, c.category_id, 2 from saved_events s join event_categories c using (event_id)
    union all select a.user_id, c.category_id, 3 from attendance a join event_categories c using (event_id) where a.went
    union all select a.user_id, c.category_id, 1 from activity a join event_categories c using (event_id)
      where a.user_id is not null and a.kind in ('abrir','web','calendario','compartir')
  )
  select user_id, category_id from sig
  where category_id not like 'g:%' and category_id <> 'sin_categoria'
    and category_id not in (select category_id from sensitive_categories)
  group by 1, 2 having sum(w) >= 2;
  select count(distinct user_id) into total from _likes;
  if total = 0 then return 0; end if;
  insert into category_affinity (a, b, users_a, users_b, users_ab, lift, updated_at)
  with cnt as (select category_id, count(*) n from _likes group by 1),
       pairs as (select x.category_id a, y.category_id b, count(*) nab from _likes x join _likes y on x.user_id = y.user_id and x.category_id <> y.category_id group by 1, 2)
  select p.a, p.b, ca.n, cb.n, p.nab, (total::real * p.nab) / (ca.n * cb.n), now()
  from pairs p join cnt ca on ca.category_id = p.a join cnt cb on cb.category_id = p.b
  where p.nab >= p_min and ca.n >= p_min and cb.n >= p_min and (total::real * p.nab) / (ca.n * cb.n) > 1.2
  on conflict (a, b) do update set users_a = excluded.users_a, users_b = excluded.users_b, users_ab = excluded.users_ab,
    lift = excluded.lift, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- M5 · estadísticas del panel: cada dato con al menos 10 personas distintas
create or replace function public.admin_stats(p_city text default 'madrid', p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days); k int := 10; r jsonb;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'solo administradores'; end if;
  select jsonb_build_object(
    'dias', p_days, 'umbral', k,
    'usuarios', jsonb_build_object(
      'total', (select count(*) from profiles),
      'nuevos', (select count(*) from profiles where created_at >= since),
      'con_estadisticas', (select count(*) from profiles where analytics is true),
      'sin_estadisticas', (select count(*) from profiles where analytics is false),
      'activos_cuenta', (select count(distinct user_id) from activity where created_at >= since and user_id is not null),
      'activos_anonimos', (select count(distinct device) from activity where created_at >= since and device is not null)),
    'acciones', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from activity where created_at >= since and (city_id = p_city or city_id is null) group by 1) x),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d, 'personas', n) order by d), '[]') from
      (select created_at::date d, count(distinct coalesce(user_id::text, device)) n from activity where created_at >= since and (city_id = p_city or city_id is null) group by 1) x),
    'top_eventos', (select coalesce(jsonb_agg(x order by x.interes desc), '[]') from (
      select e.id, e.title, e.starts_on,
        count(*) filter (where a.kind = 'abrir') abiertos, count(*) filter (where a.kind = 'guardar') guardados,
        count(*) filter (where a.kind = 'voy') voy, count(*) filter (where a.kind in ('web','calendario','compartir')) salidas,
        count(*) filter (where a.kind = 'abrir') + 3 * count(*) filter (where a.kind in ('guardar','voy')) interes
      from activity a join events e on e.id = a.event_id
      where a.created_at >= since and e.city_id = p_city group by 1, 2, 3
      having count(distinct coalesce(a.user_id::text, a.device)) >= k order by interes desc limit 15) x),
    'categorias', (select coalesce(jsonb_agg(x order by x.personas desc), '[]') from (
      select c.category_id cat, count(distinct coalesce(a.user_id::text, a.device)) personas, count(*) acciones
      from activity a join event_categories c using (event_id) join events e on e.id = a.event_id
      where a.created_at >= since and e.city_id = p_city and a.kind in ('abrir','guardar','voy') and c.category_id not like 'g:%'
      group by 1 having count(distinct coalesce(a.user_id::text, a.device)) >= k order by 2 desc limit 15) x),
    'busquedas', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (
      select lower(ctx->>'q') q, count(*) n from activity where kind = 'buscar' and created_at >= since and (city_id = p_city or city_id is null) and length(ctx->>'q') >= 3
      group by 1 having count(distinct coalesce(user_id::text, device)) >= k order by 2 desc limit 15) x),
    'afinidad', (select coalesce(jsonb_agg(x order by x.lift desc), '[]') from (select a, b, users_ab, round(lift::numeric, 2) lift from category_affinity where a < b and users_ab >= k and users_a >= k and users_b >= k and updated_at > now() - interval '3 days' order by lift desc limit 15) x),
    'guardados_total', (select count(*) from saved_events), 'voy_total', (select count(*) from attendance where went)
  ) into r;
  return r;
end $$;

create or replace function public.admin_demographics(p_city text default 'madrid', p_days integer default 90)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days); k int := 10; r jsonb;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'solo administradores'; end if;
  with people as (
    select p.id,
      case when p.birth_year is null then null
           when extract(year from now()) - p.birth_year < 25 then '14-24'
           when extract(year from now()) - p.birth_year < 35 then '25-34'
           when extract(year from now()) - p.birth_year < 45 then '35-44'
           when extract(year from now()) - p.birth_year < 55 then '45-54'
           when extract(year from now()) - p.birth_year < 65 then '55-64' else '65+' end tramo,
      nullif(p.gender, 'prefiero_no') sexo
    from profiles p),
  acts as (  -- planes que cada persona ha guardado, ha dicho «voy» o confirma que fue
    select s.user_id, s.event_id from saved_events s where s.created_at >= since
    union select a.user_id, a.event_id from attendance a where a.went and a.created_at >= since
    union select a.user_id, a.event_id from activity a where a.user_id is not null and a.kind in ('guardar','voy') and a.created_at >= since),
  ev as (select a.user_id, a.event_id, c.category_id from acts a join events e on e.id = a.event_id and e.city_id = p_city
         join event_categories c on c.event_id = a.event_id
         where c.category_id not like 'g:%' and c.category_id not in (select category_id from sensitive_categories))
  select jsonb_build_object(
    'umbral', k,
    'con_edad', (select count(*) from people where tramo is not null),
    'con_sexo', (select count(*) from people where sexo is not null),
    -- personas = cuentas distintas del tramo (antes contaba filas del cruce con sus planes); activas, solo si también son 10 o más
    'tramos', (select coalesce(jsonb_agg(x order by x.tramo), '[]') from (
        select tramo, count(distinct pe.id) personas,
               case when count(distinct a.user_id) >= k then count(distinct a.user_id) end activas
        from people pe left join acts a on a.user_id = pe.id
        where tramo is not null group by 1 having count(distinct pe.id) >= k) x),
    'sexo', (select coalesce(jsonb_agg(x order by x.personas desc), '[]') from (
        select sexo, count(*) personas from people where sexo is not null group by 1 having count(*) >= k) x),
    'categorias_por_tramo', (select coalesce(jsonb_agg(x order by x.tramo, x.personas desc), '[]') from (
        select tramo, cat, personas from (
          select pe.tramo, e.category_id cat, count(distinct e.user_id) personas,
                 row_number() over (partition by pe.tramo order by count(distinct e.user_id) desc) rn
          from ev e join people pe on pe.id = e.user_id where pe.tramo is not null group by 1, 2) z
        where personas >= k and rn <= 5) x),
    'asistencia', (select jsonb_build_object(
        'fui', count(*) filter (where went), 'no_fui', count(*) filter (where not went))
        from attendance where created_at >= since)
  ) into r;
  return r;
end $$;

-- ---------- M1 · buscar personas: solo con sesión y sin comodines; el nombre ya no sale del correo
create or replace function public.profile_search(p_q text)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public.social_card(p.id) from profiles p
  where auth.uid() is not null and p.username is not null and p.id <> auth.uid()
    and char_length(btrim(p_q)) between 2 and 60
    and (p.username like regexp_replace(lower(btrim(p_q, ' @')), '([\\%_])', '\\\1', 'g') || '%'
      or p.display_name ilike '%' || regexp_replace(btrim(p_q), '([\\%_])', '\\\1', 'g') || '%')
  order by (p.username = lower(btrim(p_q, ' @'))) desc, p.username limit 20;
$$;
revoke execute on function public.profile_search(text) from public, anon;
grant execute on function public.profile_search(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- el nombre visible sale solo del nombre de la cuenta (Google); nunca del correo. Sin nombre, se elige al crear el perfil social
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 80), ''));
  return new;
end;
$$;

-- ---------- M6 · el admin solo lee los perfiles que han pedido ser organizador y solo decide los pendientes (no todos)
drop policy if exists "admin: leer perfiles" on public.profiles;
drop policy if exists "admin: actualizar perfiles" on public.profiles;
-- (la lectura incluye a los ya decididos: al aprobar o rechazar, la fila resultante también tiene que poder leerse)
create policy "admin: leer solicitudes" on public.profiles for select to authenticated
  using (public.is_admin() and editor_status <> 'ninguno');
create policy "admin: decidir solicitudes" on public.profiles for update to authenticated
  using (public.is_admin() and editor_status = 'solicitado') with check (public.is_admin());

-- ---------- A2 · correos: topes por destinatario, por remitente y por quedada (lo que pasa del tope no se encola)
create index if not exists mail_outbox_user_created on public.mail_outbox (user_id, created_at);
create index if not exists mail_outbox_kind_created on public.mail_outbox (kind, created_at);

create or replace function public.mail_outbox_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare d timestamptz := now() - interval '24 hours';
begin
  if new.kind = 'semanal' then return new; end if;  -- lo dosifica la función de correo (uno por semana; pruebas, cada 10 minutos)
  -- por persona: como mucho 40 avisos al día, y 15 de un mismo tipo (los de admin solo tienen el tope general)
  if (select count(*) from mail_outbox where user_id = new.user_id and created_at > d and kind <> 'semanal') >= 40 then return null; end if;
  if new.kind not like 'admin%' and (select count(*) from mail_outbox where user_id = new.user_id and kind = new.kind and created_at > d) >= 15 then return null; end if;
  if new.kind in ('follow', 'follow_ok') then
    -- seguir, dejar de seguir y volver a seguir no repite el aviso; y nadie avisa a más de 30 personas al día
    if exists (select 1 from mail_outbox where user_id = new.user_id and kind = new.kind and payload->>'from' = new.payload->>'from' and created_at > d) then return null; end if;
    if (select count(*) from mail_outbox where kind = new.kind and payload->>'from' = new.payload->>'from' and created_at > d) >= 30 then return null; end if;
  elsif new.kind = 'rsvp' then
    -- una misma quedada no manda más de 8 avisos al día
    if (select count(*) from mail_outbox where user_id = new.user_id and kind = 'rsvp' and payload->>'invite' = new.payload->>'invite' and created_at > d) >= 8 then return null; end if;
  end if;
  return new;
end $$;
revoke execute on function public.mail_outbox_guard() from public, anon, authenticated;
drop trigger if exists mail_outbox_guard on public.mail_outbox;
create trigger mail_outbox_guard before insert on public.mail_outbox for each row execute function public.mail_outbox_guard();

-- ---------- B3 · quedadas: el nombre de quien responde no puede llevar enlaces (sale en el asunto del correo)
create or replace function public.invite_reply(p_token uuid, p_device uuid, p_name text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i plan_invites; n int; prev text;
begin
  select * into i from plan_invites where token = p_token;
  if not found then raise exception 'Esa invitación no existe.'; end if;
  if p_status not in ('voy', 'quizas', 'no') then raise exception 'Respuesta no válida.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 1 or char_length(p_name) > 60 then raise exception 'Escribe tu nombre (máximo 60 caracteres).'; end if;
  if p_name ~* '(://|https?:|www\.)' then raise exception 'Escribe solo tu nombre, sin enlaces.'; end if;
  select status into prev from plan_rsvps where invite_id = i.id and device_key = p_device;
  if prev is null then
    select count(*) into n from plan_rsvps where invite_id = i.id;
    if n >= 50 then raise exception 'Esta quedada ya tiene demasiadas respuestas.'; end if;
  end if;
  insert into plan_rsvps (invite_id, device_key, user_id, name, status)
  values (i.id, p_device, auth.uid(), p_name, p_status)
  on conflict (invite_id, device_key) do update set name = excluded.name, status = excluded.status,
    user_id = coalesce(excluded.user_id, plan_rsvps.user_id), updated_at = now();
  if prev is distinct from p_status and auth.uid() is distinct from i.owner then
    insert into mail_outbox (user_id, kind, payload)
    values (i.owner, 'rsvp', jsonb_build_object('invite', i.id, 'event_id', i.event_id, 'name', p_name, 'status', p_status));
  end if;
  return public.invite_get(p_token);
end $$;

-- ---------- A3 · IA: la llamada se reserva antes de hacerla (tope por persona y gasto del día, sin carreras)
create or replace function public.ai_usage_reserve(p_user uuid, p_max_calls integer, p_max_usd numeric, p_reserve numeric default 0.02)
returns text language plpgsql security definer set search_path = public as $$
declare c int; t numeric;
begin
  perform pg_advisory_xact_lock(hashtext('limon.ai_usage'));  -- de una en una: dos peticiones a la vez no ven el mismo saldo
  select calls into c from ai_usage where day = current_date and user_id = p_user;
  if coalesce(c, 0) >= p_max_calls then return 'persona'; end if;
  select coalesce(sum(usd), 0) into t from ai_usage where day = current_date;
  if t >= p_max_usd then return 'total'; end if;
  insert into ai_usage (day, user_id, calls, usd) values (current_date, p_user, 1, p_reserve)
  on conflict (day, user_id) do update set calls = ai_usage.calls + 1, usd = ai_usage.usd + excluded.usd;
  return 'ok';
end $$;
-- al terminar la llamada se cambia lo reservado por lo que costó de verdad (0 si falló)
create or replace function public.ai_usage_settle(p_user uuid, p_usd numeric, p_reserve numeric default 0.02)
returns void language sql security definer set search_path = public as $$
  update ai_usage set usd = greatest(usd + coalesce(p_usd, 0) - p_reserve, 0) where day = current_date and user_id = p_user;
$$;
revoke execute on function public.ai_usage_reserve(uuid, integer, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.ai_usage_settle(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(uuid, integer, numeric, numeric) to service_role;
grant execute on function public.ai_usage_settle(uuid, numeric, numeric) to service_role;

-- ---------- B6 · limpieza diaria: correos enviados de hace más de 12 meses y respuestas a quedadas de hace más de un año
create or replace function public.limon_limpieza()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from mail_outbox where created_at < now() - interval '12 months';
  delete from plan_rsvps r using plan_invites i
  where i.id = r.invite_id and coalesce(i.on_date, i.created_at::date) < current_date - 365;
end $$;
revoke execute on function public.limon_limpieza() from public, anon, authenticated;
select cron.schedule('limon-limpieza', '41 3 * * *', 'select public.limon_limpieza()');

-- =====================================================================================================
-- 2 · LÍMITES
-- =====================================================================================================

-- ---------- M2 · enlaces de organizadores: solo http(s). «www.sala.es» se completa con https://; lo demás se queda vacío
create or replace function public.http_url(t text)
returns text language sql immutable set search_path = '' as $$
  select case
    when t is null or btrim(t) = '' then null
    when btrim(t) ~* '^https?://[^\s<>"'']+$' then btrim(t)
    when btrim(t) ~* '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(/[^\s<>"'']*)?$' then 'https://' || btrim(t)
    else null end;
$$;
revoke execute on function public.http_url(text) from public, anon, authenticated;

create or replace function public.submitted_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.url := public.http_url(new.url);
  new.image_url := public.http_url(new.image_url);
  if coalesce(auth.role(), 'service_role') = 'service_role' or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.status := 'revision'; new.ai_review := null; new.admin_note := null; new.event_id := null; return new; end if;
  new.owner := old.owner; new.event_id := old.event_id; new.admin_note := old.admin_note; new.ai_review := old.ai_review;
  new.lat := old.lat; new.lng := old.lng; new.district := old.district; new.categories := old.categories;
  if new.status not in ('borrador','revision') then new.status := 'revision'; end if;
  return new;
end $$;

alter table public.submitted_events
  add constraint submitted_events_url_http check (url is null or url ~* '^https?://'),
  add constraint submitted_events_image_url_http check (image_url is null or image_url ~* '^https?://');

-- ---------- M4 · tamaños máximos en el perfil (lo que hay hoy cabe de sobra)
alter table public.profiles
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 80),
  add constraint profiles_city_len check (city_id is null or char_length(city_id) <= 40),
  add constraint profiles_taste_text_len check (taste_text is null or char_length(taste_text) <= 2000),
  add constraint profiles_taste_size check (taste is null or length(taste::text) <= 12000),
  add constraint profiles_learned_size check (length(learned::text) <= 60000),
  add constraint profiles_filters_size check (length(filters::text) <= 8000),
  add constraint profiles_notify_size check (length(notify::text) <= 3000),
  add constraint profiles_organizer_size check (organizer is null or length(organizer::text) <= 3000),
  add constraint profiles_streets_size check (coalesce(array_length(my_streets, 1), 0) <= 60 and length(array_to_string(my_streets, '')) <= 4000),
  add constraint profiles_ventajas_size check (coalesce(array_length(ventajas, 1), 0) <= 30 and length(array_to_string(ventajas, '')) <= 1500);

-- ---------- M4 · estadísticas de uso: tope diario por navegador, por cuenta y en total para los anónimos
-- (lo que pasa del tope no se guarda; evita que alguien llene la base de datos a base de filas)
create index if not exists activity_device_created on public.activity (device, created_at) where device is not null;
create index if not exists activity_user_created on public.activity (user_id, created_at) where user_id is not null;

create or replace function public.activity_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare d timestamptz := date_trunc('day', now());
begin
  if new.user_id is null then
    if (select count(*) from activity where device = new.device and created_at >= d) >= 1500 then return null; end if;
    if (select count(*) from activity where user_id is null and created_at >= d) >= 10000 then return null; end if;
  elsif (select count(*) from activity where user_id = new.user_id and created_at >= d) >= 3000 then return null;
  end if;
  return new;
end $$;
revoke execute on function public.activity_guard() from public, anon, authenticated;
drop trigger if exists activity_guard on public.activity;
create trigger activity_guard before insert on public.activity for each row execute function public.activity_guard();

-- ---------- B4 · avisos push: solo se aceptan direcciones de los servicios de Apple, Google, Mozilla y Microsoft
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host check (
    endpoint ~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/');

-- ---------- B2 · las listas nuevas son privadas salvo que se diga lo contrario
alter table public.user_lists alter column is_public set default false;

-- =====================================================================================================
-- 3 · PERMISOS
-- =====================================================================================================

-- ---------- B1 · cada tabla, solo con los permisos que usan sus políticas
-- Sin políticas (tablas del servidor): nada para anon ni authenticated. Con políticas: lectura para ambos (RLS filtra) y
-- escritura solo para authenticated donde alguna política escribe. Nadie conserva TRUNCATE, TRIGGER ni REFERENCES.
do $$
declare r record;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('revoke all on table public.%I from anon, authenticated', r.relname);
    if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.relname) then
      execute format('grant select on table public.%I to anon, authenticated', r.relname);
      if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.relname and p.cmd <> 'SELECT') then
        execute format('grant insert, update, delete on table public.%I to authenticated', r.relname);
      end if;
    end if;
  end loop;
end $$;
grant insert on table public.activity to anon;  -- estadísticas de uso sin cuenta (con permiso), según su política

-- Lo que se cree a partir de ahora nace cerrado: hay que dar el permiso a propósito (ver README.md)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;
