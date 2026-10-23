-- Mevcut Supabase projesinde SQL Editor ile uygulanmalıdır.
-- Sadece fonksiyonu günceller; çalıştırıldığı anda kullanıcı veya veri silmez.
-- Önkoşul: public.feedback tablosu mevcut olmalıdır (kurulum.sql).
begin;
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.feedback where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
commit;
