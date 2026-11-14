-- Limón · pruebas de la segunda auditoría (2026-11-14). Se ejecutan de una vez en el editor SQL de Supabase (producción).
-- No dejan nada: el bloque termina con un error a propósito que muestra el resultado y deshace todo lo que ha hecho.
-- Resultado esperado: ningún «(MAL)»; «avisos ajenos visibles=0»; «8 errores nuevos -> avisos» entre 1 y 4 (3 al momento y
-- uno de resumen, menos los que ya se hubieran mandado hoy); «con dominio filtrado=8»; «rate_ok x3 (max 2)=true,true,false».
do $$
declare res text := ''; adm uuid; n int; c0 int; ev bigint;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform count(*) from public.notifications; res := res || ' | anon notifications LEE(MAL)'; exception when insufficient_privilege then res := res || ' | anon notifications denegado'; end;
  begin perform public.rate_ok('x', 1, 60); res := res || ' | anon rate_ok PASA(MAL)'; exception when insufficient_privilege then res := res || ' | anon rate_ok denegado'; end;
  reset role;
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into n from public.notifications; res := res || ' | con sesión lee sus avisos=' || n;
  select count(*) into n from public.notifications where user_id <> adm; res := res || ' | avisos ajenos visibles=' || n;
  begin insert into public.notifications (user_id, kind, ref, title) values (adm, 'x', 'x', 'x'); res := res || ' | insertar aviso PASA(MAL)'; exception when insufficient_privilege then res := res || ' | insertar aviso denegado'; end;
  reset role;
  select count(*) into c0 from public.mail_outbox where kind = 'admin_error' and user_id = adm;
  for i in 1..8 loop perform public.contar_error('prueba', 'fallo de auditoria numero ' || chr(96 + i) || ' visita www.malo.com/x ya'); end loop;
  select count(*) - c0 into n from public.mail_outbox where kind = 'admin_error' and user_id = adm; res := res || ' | 8 errores nuevos -> avisos=' || n;
  select count(*) into n from public.app_errors where kind = 'prueba' and msg like '%<web>%' and msg not like '%malo%'; res := res || ' | con dominio filtrado=' || n;
  res := res || ' | rate_ok x3 (max 2)=' || public.rate_ok('prueba', 2, 60) || ',' || public.rate_ok('prueba', 2, 60) || ',' || public.rate_ok('prueba', 2, 60);
  select id into ev from public.events where ends_on >= current_date + 30 and id not in (select event_id from public.saved_events where user_id = adm) limit 1;
  insert into public.saved_events (user_id, event_id) values (adm, ev); res := res || ' | guardar plan ok';
  perform public.limon_limpieza(); res := res || ' | limpieza ok';
  raise exception 'RESULTADO (todo deshecho): %', res;
end $$;
