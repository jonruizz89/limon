-- Limón · segunda auditoría de seguridad y privacidad (14 de noviembre de 2026): lo añadido desde el día 11.
-- Aplicado en «Limon» (producción) y en «Limon pruebas» como la migración seguridad_2026_11_14.
-- En pruebas se aplicó además el bloque final (PERMISOS), que deja los mismos permisos que en producción.
-- No borra ni cambia datos de usuarios. Las referencias (A1, M4…) son las del informe.

-- M1 · la campana: quien tiene sesión puede leer sus avisos (la política ya los limita a los suyos)
grant select on table public.notifications to authenticated;
create index if not exists notifications_kind_fecha on public.notifications (kind, created_at);

-- M4 · «alguien a quien sigues guarda un plan»: sin planes de categorías sensibles, con el texto de lo que pasó
-- (guardar no es apuntarse) y como mucho 20 planes por persona y día
create or replace function public.notif_amigo_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare ev record; quien text;
begin
  select id, title, starts_on, ends_on into ev from events where id = new.event_id;
  if ev.id is null or coalesce(ev.ends_on, ev.starts_on) < current_date then return new; end if;
  if exists (select 1 from event_categories c join sensitive_categories s on s.category_id = c.category_id where c.event_id = new.event_id) then return new; end if;
  if (select count(distinct ref) from notifications where kind = 'amigo_plan' and created_at > now() - interval '24 hours'
        and ref like new.user_id || ':%') >= 20 then return new; end if;
  select coalesce(nullif(display_name, ''), username) into quien from profiles where id = new.user_id;
  if quien is null then return new; end if;
  insert into notifications (user_id, kind, ref, title, body, url)
  select f.follower, 'amigo_plan', new.user_id || ':' || new.event_id,
         quien || ' ha guardado un plan', ev.title, '?ev=e' || ev.id
  from follows f where f.followee = new.user_id and f.status = 'accepted' and f.follower <> new.user_id
  on conflict (user_id, kind, ref) do nothing;
  return new;
end $$;
revoke execute on function public.notif_amigo_plan() from public, anon, authenticated;

-- B1 · errores de la app: el texto llega del navegador de cualquiera, así que se le quitan también las direcciones web sin
-- «http», y los administradores reciben como mucho 3 avisos al momento y uno más de «hay más» al día
create or replace function public.contar_error(p_kind text, p_msg text)
returns boolean language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/Madrid')::date;
        k text := left(coalesce(nullif(btrim(p_kind), ''), 'error'), 20);
        -- sin direcciones, correos ni números largos: solo el tipo de fallo
        m text := left(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_msg, ''), 'https?://\S+', '<url>', 'g'), '\S+@\S+', '<correo>', 'g'),
                   '(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|es|net|org|io|info|xyz|ru|cn|app|dev|co|me|link|top|site|online|shop|eu|cat)(/\S*)?(?![a-z0-9])', '<web>', 'gi'), '\d{3,}', '<n>', 'g'), 160);
        n int; nuevo boolean; motivo text;
begin
  if (select count(*) from app_errors where day = d) >= 200 and not exists (select 1 from app_errors where day = d and kind = k and msg = m) then return false; end if;
  insert into app_errors(day, kind, msg, n) values (d, k, m, 1)
  on conflict (day, kind, msg) do update set n = app_errors.n + 1
  returning app_errors.n into n;
  -- aviso a los administradores: un error que no se veía en los últimos 14 días, o uno que llega a 10 hoy (como mucho uno de cada al día)
  nuevo := n = 1 and not exists (select 1 from app_errors where kind = k and msg = m and day between d - 14 and d - 1);
  motivo := case when nuevo then 'nuevo' when n = 10 then '10' end;
  if motivo is null then return false; end if;
  -- los 3 primeros del día, tal cual
  insert into mail_outbox (user_id, kind, ref, payload)
  select p.id, 'admin_error', d || ':' || md5(k || m) || ':' || motivo, jsonb_build_object('kind', k, 'msg', m, 'n', n, 'motivo', motivo)
  from profiles p where p.role = 'admin'
    and not exists (select 1 from mail_outbox o where o.user_id = p.id and o.kind = 'admin_error' and o.ref = d || ':' || md5(k || m) || ':' || motivo)
    and (select count(*) from mail_outbox o where o.user_id = p.id and o.kind = 'admin_error' and o.created_at > now() - interval '24 hours') < 3;
  if found then return true; end if;
  -- a partir de ahí, un único aviso de que hay más (el detalle está en el parte diario)
  insert into mail_outbox (user_id, kind, ref, payload)
  select p.id, 'admin_error', d || ':resumen', jsonb_build_object('kind', k, 'msg', 'Hay más errores nuevos hoy; el detalle, en el parte diario', 'n', n, 'motivo', 'resumen')
  from profiles p where p.role = 'admin'
    and not exists (select 1 from mail_outbox o where o.user_id = p.id and o.kind = 'admin_error' and o.ref = d || ':resumen');
  return found;
end $$;
grant execute on function public.contar_error(text, text) to anon, authenticated;

-- B4 · frenos de uso que sí aguantan (los de memoria no valen: cada petición puede caer en un servidor distinto)
create table if not exists public.rate_hits (key text not null, bucket timestamptz not null, n integer not null default 0, primary key (key, bucket));
alter table public.rate_hits enable row level security;
create or replace function public.rate_ok(p_key text, p_max integer, p_window_s integer default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare b timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_s, 1)) * greatest(p_window_s, 1)); c int;
begin
  insert into rate_hits (key, bucket, n) values (left(p_key, 80), b, 1)
  on conflict (key, bucket) do update set n = rate_hits.n + 1 returning n into c;
  return c <= p_max;
end $$;
revoke execute on function public.rate_ok(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_ok(text, integer, integer) to service_role;

-- B2 · plazos de lo que se guarda de las altas sin cuenta (lo que dice privacidad.html)
alter table public.newsletter_subs add column if not exists baja_at timestamptz;
create or replace function public.limon_limpieza()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from mail_outbox where created_at < now() - interval '12 months';
  delete from plan_rsvps r using plan_invites i
  where i.id = r.invite_id and coalesce(i.on_date, i.created_at::date) < current_date - 365;
  -- altas sin cuenta: la huella del origen, un día; un correo que no se confirma, 7 días; una baja, 30 días
  delete from newsletter_attempts where created_at < now() - interval '1 day';
  delete from newsletter_subs where status = 'pendiente' and coalesce(confirm_sent_at, created_at) < now() - interval '7 days';
  delete from newsletter_subs where status = 'baja' and coalesce(baja_at, last_sent_at, confirmed_at, created_at) < now() - interval '30 days';
  delete from rate_hits where bucket < now() - interval '1 day';
end $$;
revoke execute on function public.limon_limpieza() from public, anon, authenticated;

-- =====================================================================================================
-- PERMISOS (A1) · solo hizo falta en «Limon pruebas»: un proyecto nuevo de Supabase da todos los permisos a la web en cada
-- tabla y función que se crea. Se cierran y se dejan como en producción. El flujo pruebas_db.yml lo repite y lo comprueba.
-- =====================================================================================================
-- alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
-- alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
-- alter default privileges for role postgres revoke execute on functions from public;
-- revoke all on all tables in schema public from anon, authenticated;
-- revoke execute on all functions in schema public from public, anon, authenticated;
-- … y después los GRANT de producción (los saca pg_dump; ver pruebas_db.yml)

-- Huella de permisos: tiene que dar lo mismo en las dos bases de datos
-- select md5(string_agg(x, '|' order by x)) from (
--   select 't:'||table_name||':'||grantee||':'||privilege_type x from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')
--   union all select 'f:'||p.oid::regprocedure::text||':'||v.r from pg_proc p cross join (values ('anon'),('authenticated')) v(r) where p.pronamespace='public'::regnamespace and has_function_privilege(v.r, p.oid, 'execute')) z;
