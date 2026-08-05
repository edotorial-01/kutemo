create table if not exists invitations (
  id          uuid        default gen_random_uuid() primary key,
  slug        text        unique not null,
  blob_url    text        not null,
  theme       text,
  pria        text,
  wanita      text,
  order_id    text,
  created_at  timestamptz default now()
);

create index if not exists invitations_slug_idx on invitations (slug);
