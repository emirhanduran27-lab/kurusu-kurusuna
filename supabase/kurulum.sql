-- Kuruşu Kuruşuna: eşitleme tabloları
-- Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştır → Run

-- Her kullanıcının şifreleme anahtarı (sadece kilitli hali saklanır, sunucu açamaz)
create table if not exists public.vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  iter integer not null,
  wrapped_pass text not null,
  rec_salt text not null,
  wrapped_recovery text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Şifreli kayıtlar: her işlem, hesap, hedef vb. ayrı bir satır
create table if not exists public.records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  kind text not null,
  data text,
  deleted boolean not null default false,
  modified bigint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);

-- Sunucu zamanı: eşitleme hangi kayıtların yeni olduğunu buna göre anlar
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.touch_updated_at();

drop trigger if exists vault_touch on public.vault;
create trigger vault_touch before update on public.vault
for each row execute function public.touch_updated_at();

-- Herkes sadece kendi satırlarını görebilir ve değiştirebilir
alter table public.vault enable row level security;
alter table public.records enable row level security;

drop policy if exists "vault sahibi" on public.vault;
create policy "vault sahibi" on public.vault for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "kayit sahibi" on public.records;
create policy "kayit sahibi" on public.records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Hesabını silmek isteyen kullanıcı için (uygulamadaki "Hesabımı sil")
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
