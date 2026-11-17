-- Limón · «¿Qué día vas?»: el día que la persona eligió para un plan guardado con varias fechas (null = aún no lo sabe).
-- La Agenda, la lluvia, los cortes, «¿fuiste?» y el calendario sincronizado usan este día si está.
alter table public.saved_events add column if not exists day date;
