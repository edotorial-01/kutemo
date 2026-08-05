create table if not exists ucapan (
  id          bigserial primary key,
  slug        text not null,
  nama        text not null,
  pesan       text default '',
  kehadiran   text default 'hadir',
  created_at  timestamptz default now()
);

create index if not exists idx_ucapan_slug on ucapan(slug, created_at desc);
