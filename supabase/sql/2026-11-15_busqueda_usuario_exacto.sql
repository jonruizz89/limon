-- Limón · Amigos: búsqueda cerrada, como Letterboxd o Goodreads (2026-11-15).
-- Solo encuentra un perfil si se escribe su @usuario exacto (con o sin @, sin distinguir mayúsculas) y el perfil es público.
-- Nada de buscar por nombre ni por trozos. Los privados solo se siguen desde su enlace (?u=usuario) o desde contactos si lo permiten.
create or replace function public.profile_search(p_q text)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public.social_card(p.id) from profiles p
  where auth.uid() is not null and p.id <> auth.uid() and p.is_public
    and p.username is not null and lower(p.username) = lower(btrim(p_q, ' @'))
    and char_length(btrim(p_q, ' @')) between 2 and 40
  limit 1;
$$;
revoke execute on function public.profile_search(text) from public, anon;
grant execute on function public.profile_search(text) to authenticated;
