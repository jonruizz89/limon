-- Limón · contadores agregados (sin datos personales): veces que alguien sin cuenta choca con el límite de 2 planes guardados
-- (limite_guardar) y cuántas de esas personas acaban entrando o creando la cuenta y se les guarda el plan (cuenta_tras_limite).
create or replace function public.contar(p_city text, p_que text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_city is null or p_que is null or not exists (select 1 from cities where id = p_city) then return; end if;
  if p_que !~ '^(origen:(google|bing|instagram|x|facebook|whatsapp|telegram|compartido|directo|app|paginas|otra_web|otro)|ficha|guardar|compartir|calendario|registro|intereses|resumen_alta|limite_guardar|cuenta_tras_limite)$' then return; end if;
  insert into usage_counts(day, city_id, que, n) values ((now() at time zone 'Europe/Madrid')::date, p_city, p_que, 1)
  on conflict (day, city_id, que) do update set n = usage_counts.n + 1;
end $function$;
