-- =========================================================
-- GUILDCRAFT HALL — chat on requests/board posts, profile pictures
-- Run once, after supabase-board-profiles.sql.
-- =========================================================

-- ---------- Chat messages ----------
-- thread_type 'board' = a public Request Board post (any member reads and writes)
-- thread_type 'request' = a private craft/market request (only its two people)
create table public.messages (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  thread_type  text not null check (thread_type in ('board', 'request')),
  thread_id    bigint not null,
  author_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 500)
);
create index messages_thread_idx on public.messages (thread_type, thread_id, created_at);

create or replace function public.can_see_thread(t text, tid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when t = 'board' then exists (select 1 from board_posts where id = tid)
    when t = 'request' then exists (select 1 from requests where id = tid and auth.uid() in (from_id, to_id))
    else false end;
$$;

alter table public.messages enable row level security;
create policy "read my threads" on public.messages for select to authenticated using (public.can_see_thread(thread_type, thread_id));
create policy "write to my threads" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_thread(thread_type, thread_id));
create policy "delete own messages" on public.messages for delete to authenticated using (author_id = auth.uid() or public.is_admin());
grant select, insert, delete on public.messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter publication supabase_realtime add table public.messages;

-- ---------- Profile pictures ----------
alter table public.profiles add column if not exists avatar_url text not null default '' check (char_length(avatar_url) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Each member may only write inside their own folder: avatars/<their user id>/...
create policy "avatar upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
