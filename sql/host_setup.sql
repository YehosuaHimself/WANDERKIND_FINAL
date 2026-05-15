-- ════════════════════════════════════════════════════════════
-- Wanderkind · host_setup · the full host loop
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists host_bio       text;
alter table profiles add column if not exists house_rules    jsonb default '[]'::jsonb;
alter table profiles add column if not exists host_languages jsonb default '[]'::jsonb;
alter table profiles add column if not exists host_paused    boolean default false;
alter table profiles add column if not exists quiet_hours    jsonb default '{"start":"22:00","end":"07:00"}'::jsonb;
alter table profiles add column if not exists host_capacity  smallint default 1;
alter table profiles add column if not exists host_specialty text;
