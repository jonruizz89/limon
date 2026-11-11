-- Limón · pruebas de la auditoría de seguridad (2026-11-11). Se ejecutan de una vez en el editor SQL de Supabase.
-- No dejan nada: el bloque termina con un error a propósito que muestra el resultado y deshace todo lo que ha hecho.
-- Resultado esperado: ningún «(MAL)» ni «FALLA», y
--   anon afinidad=0 (mientras no haya 10 personas por dato) · 3 follow iguales -> 1 · 12 rsvp -> 8
--   reserve x3 + tope total=ok,ok,persona,total · 1510 filas de un navegador -> 1500
do $$
declare res text := ''; adm uuid; n int; t text; j jsonb; c0 int;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  -- ===== sin cuenta
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.category_affinity where users_ab < 10; res := res || ' | anon afinidad con menos de 10=' || n;
  select count(*) into n from public.events; res := res || ' | anon events>0=' || (n > 0);
  select count(*) into n from public.profiles; res := res || ' | anon profiles=' || n;
  begin perform count(*) from public.ai_usage; res := res || ' | anon ai_usage LEE(MAL)'; exception when insufficient_privilege then res := res || ' | anon ai_usage denegado'; end;
  begin perform count(*) from public.mail_outbox; res := res || ' | anon outbox LEE(MAL)'; exception when insufficient_privilege then res := res || ' | anon outbox denegado'; end;
  begin perform public.profile_search('%%'); res := res || ' | anon search PASA(MAL)'; exception when insufficient_privilege then res := res || ' | anon search denegado'; end;
  begin perform public.ai_usage_reserve(adm, 30, 1); res := res || ' | anon reserve PASA(MAL)'; exception when insufficient_privilege then res := res || ' | anon reserve denegado'; end;
  begin truncate public.events; res := res || ' | anon truncate PASA(MAL)'; exception when insufficient_privilege then res := res || ' | anon truncate denegado'; end;
  begin insert into public.activity (kind, device, city_id) values ('abrir', 'prueba-auditoria', 'madrid'); res := res || ' | anon activity insert ok'; exception when others then res := res || ' | anon activity FALLA: ' || sqlerrm; end;
  begin insert into public.profiles (id) values (gen_random_uuid()); res := res || ' | anon insert profiles PASA(MAL)'; exception when others then res := res || ' | anon insert profiles denegado'; end;
  select count(*) into n from public.ideas_board(); res := res || ' | anon ideas_board ok';
  reset role;
  -- ===== con sesión (la cuenta admin; todo se deshace al final)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into n from public.profile_search('%%'); res := res || ' | auth search %%=' || n;
  select count(*) into n from public.profile_search('__'); res := res || ' | auth search __=' || n;
  select count(*) into n from public.profiles where id = adm; res := res || ' | auth perfil propio=' || n;
  select count(*) into n from public.profiles where editor_status = 'ninguno' and id <> adm; res := res || ' | admin ve perfiles ajenos sin solicitud=' || n;
  begin update public.profiles set with_dog = with_dog where id = adm; res := res || ' | auth update propio ok'; exception when others then res := res || ' | auth update propio FALLA: ' || sqlerrm; end;
  begin update public.profiles set display_name = repeat('x', 200) where id = adm; res := res || ' | nombre 200 PASA(MAL)'; exception when check_violation then res := res || ' | nombre 200 rechazado'; end;
  begin update public.profiles set learned = jsonb_build_object('cat:x', repeat('y', 70000)) where id = adm; res := res || ' | learned 70k PASA(MAL)'; exception when check_violation then res := res || ' | learned 70k rechazado'; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (adm, 'https://evil.example.com/x', 'a', 'b'); res := res || ' | push evil PASA(MAL)'; exception when check_violation then res := res || ' | push evil rechazado'; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (adm, 'https://fcm.googleapis.com/fcm/send/prueba-auditoria', 'a', 'b'); res := res || ' | push fcm ok'; exception when others then res := res || ' | push fcm FALLA: ' || sqlerrm; end;
  begin perform count(*) from public.app_keys; res := res || ' | auth app_keys LEE(MAL)'; exception when insufficient_privilege then res := res || ' | auth app_keys denegado'; end;
  j := public.admin_stats('madrid', 30); res := res || ' | admin_stats umbral=' || (j->>'umbral');
  j := public.admin_demographics('madrid', 90); res := res || ' | demo umbral=' || (j->>'umbral');
  reset role;
  -- ===== correos: topes
  select count(*) into c0 from public.mail_outbox where user_id = adm;
  for i in 1..3 loop insert into public.mail_outbox (user_id, kind, payload) values (adm, 'follow', '{"from":"prueba_auditoria","status":"accepted"}'); end loop;
  select count(*) - c0 into n from public.mail_outbox where user_id = adm; res := res || ' | 3 follow iguales -> ' || n;
  for i in 1..12 loop insert into public.mail_outbox (user_id, kind, payload) values (adm, 'rsvp', jsonb_build_object('invite', -1, 'name', 'p' || i, 'status', 'voy')); end loop;
  select count(*) into n from public.mail_outbox where user_id = adm and payload->>'invite' = '-1'; res := res || ' | 12 rsvp -> ' || n;
  -- ===== IA: reserva
  select coalesce((select calls from public.ai_usage where day = current_date and user_id = adm), 0) into c0;
  t := public.ai_usage_reserve(adm, c0 + 2, 1000) || ',' || public.ai_usage_reserve(adm, c0 + 2, 1000) || ',' || public.ai_usage_reserve(adm, c0 + 2, 1000) || ',' || public.ai_usage_reserve(adm, 1000, 0);
  res := res || ' | reserve x3 + tope total=' || t;
  -- ===== enlaces
  res := res || ' | http_url=' || concat_ws(',', coalesce(public.http_url('javascript:alert(1)'), 'NULL'), public.http_url('www.sala.es/agenda'), public.http_url(' https://a.b/c '), coalesce(public.http_url('data:text/html,x'), 'NULL'));
  -- ===== estadísticas: tope por navegador
  insert into public.activity (kind, device, city_id) select 'abrir', 'prueba-tope', 'madrid' from generate_series(1, 1510);
  select count(*) into n from public.activity where device = 'prueba-tope'; res := res || ' | 1510 filas de un navegador -> ' || n;
  raise exception 'RESULTADO (todo deshecho): %', res;
end $$;
