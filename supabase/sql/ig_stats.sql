-- Métricas diarias de Instagram (las llena engine/src/ig_stats.py desde el flujo «Estadísticas»)
create table if not exists public.ig_stats (
  day date not null,
  cuenta text not null,
  followers int,           -- seguidores al empezar el día (foto de cada madrugada)
  reach int, views int, likes int, comments int, saves int, shares int,
  interactions int, accounts_engaged int, profile_views int,
  posts int, likes_total int, comments_total int,  -- foto acumulada de cada madrugada (sin permiso de estadísticas)
  updated_at timestamptz not null default now(),
  primary key (day, cuenta)
);
alter table public.ig_stats enable row level security;  -- sin políticas: solo la clave de servicio lee y escribe
