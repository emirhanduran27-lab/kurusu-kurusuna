-- Kuruşu Kuruşuna: uygulama içinden gönderilen öneri ve sorun bildirimleri
-- Supabase panelinde SQL Editor'e yapıştırıp Run'a bas. Bir kez çalıştırmak yeterli.

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('oneri', 'sorun', 'diger')),
  message text not null check (char_length(message) between 3 and 4000),
  contact text check (contact is null or char_length(contact) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  platform text check (platform is null or char_length(platform) <= 60),
  user_id uuid default auth.uid()
);

alter table public.feedback enable row level security;

-- Herkes (giriş yapmamış olsa da) bildirim gönderebilir ama kimse okuyamaz.
-- Mesajları sadece sen Supabase panelinden (Table Editor > feedback) görürsün.
drop policy if exists "geri bildirim gonder" on public.feedback;
create policy "geri bildirim gonder" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

grant insert on public.feedback to anon, authenticated;
