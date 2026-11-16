-- Downora — initial schema (Phase 3 draft).
-- STATUS: written, not yet applied or tested against a database. The web app
-- does not read from it; it stores history locally until the API ships.
-- Targets PostgreSQL 15+ / Supabase. User identity comes from auth.users when
-- running on Supabase; `users` below mirrors it for plain Postgres.

create extension if not exists "pgcrypto";

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists user_settings (
  user_id              uuid primary key references users(id) on delete cascade,
  concurrency          smallint not null default 2 check (concurrency between 1 and 4),
  auto_start           boolean  not null default true,
  file_name_pattern    text     not null default 'original' check (file_name_pattern in ('original','with-quality','with-date')),
  notify_on_complete   boolean  not null default false,
  history_limit        integer  not null default 200 check (history_limit between 10 and 5000),
  updated_at           timestamptz not null default now()
);

-- One analysed source. Cached so repeat requests skip the network.
create table if not exists media_items (
  id            uuid primary key default gen_random_uuid(),
  source_url    text not null,
  source_host   text not null,
  adapter_id    text not null,
  kind          text not null check (kind in ('video','audio')),
  title         text not null,
  duration_sec  numeric(10,3),
  width         integer,
  height        integer,
  mime_type     text,
  size_bytes    bigint,
  analyzed_at   timestamptz not null default now()
);
create index if not exists media_items_source_url_idx on media_items (source_url);

create table if not exists media_formats (
  id            text not null,
  media_id      uuid not null references media_items(id) on delete cascade,
  kind          text not null check (kind in ('video','audio')),
  container     text not null check (container in ('mp4','webm','mkv','mp3','wav','m4a')),
  delivery      text not null check (delivery in ('original','transcode')),
  quality_label text,
  width         integer,
  height        integer,
  size_bytes    bigint,
  primary key (media_id, id)
);

create type download_status as enum ('queued','downloading','paused','completed','failed','canceled');

create table if not exists download_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  media_id        uuid not null references media_items(id),
  format_id       text not null,
  file_name       text not null,
  status          download_status not null default 'queued',
  bytes_received  bigint not null default 0,
  bytes_total     bigint,
  error_code      text,
  error_message   text,
  storage_key     text,           -- object storage key of the produced file
  expires_at      timestamptz,    -- produced files are deleted after this (job cleanup)
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  foreign key (media_id, format_id) references media_formats(media_id, id)
);
create index if not exists download_jobs_user_created_idx on download_jobs (user_id, created_at desc);
create index if not exists download_jobs_status_idx on download_jobs (status) where status in ('queued','downloading');
create index if not exists download_jobs_expiry_idx on download_jobs (expires_at) where expires_at is not null;

-- Row-level security for Supabase: users only ever see their own rows.
alter table user_settings enable row level security;
alter table download_jobs enable row level security;
-- create policy "own settings" on user_settings using (user_id = auth.uid());
-- create policy "own jobs"     on download_jobs  using (user_id = auth.uid());
