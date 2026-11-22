-- =========================================================
-- GUILDCRAFT HALL — profiles, public request board, notifications
-- Run once, after supabase-setup.sql.
-- =========================================================

-- ---------- Member profiles ----------
alter table public.profiles
  add column if not exists main_char     text not null default '' check (char_length(main_char) <= 24),
  add column if not exists main_realm    text not null default '' check (char_length(main_realm) <= 40),
  add column if not exists main_class    text not null default '' check (char_length(main_class) <= 20),
  add column if not exists main_level    integer not null default 0 check (main_level between 0 and 80),
  add column if not exists faction       text not null default '' check (faction in ('', 'Alliance', 'Horde')),
  add column if not exists bio           text not null default '' check (char_length(bio) <= 400),
  add column if not exists discord       text not null default '' check (char_length(discord) <= 40),
  add column if not exists play_times    text not null default '' check (char_length(play_times) <= 80),
  add column if not exists notif_seen_at timestamptz not null default now();

-- ---------- Public request board: anyone posts, anyone can take a job ----------
create table public.board_posts (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  author_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_char   text not null default '' check (char_length(author_char) <= 24),
  category      text not null default 'craft' check (category in ('craft', 'item', 'gather', 'help')),
  title         text not null check (char_length(title) between 1 and 80),
  recipe_id     integer,
  qty           integer not null default 1 check (qty between 1 and 9999),
  offer         numeric(12,2) not null default 0 check (offer >= 0),
  note          text not null default '' check (char_length(note) <= 300),
  status        text not null default 'open' check (status in ('open', 'claimed', 'done', 'cancelled')),
  claimer_id    uuid references public.profiles(id) on delete set null,
  claimer_char  text not null default '' check (char_length(claimer_char) <= 24),
  claimed_at    timestamptz
);
create index board_posts_status_idx on public.board_posts (status, created_at desc);

alter table public.board_posts enable row level security;
create policy "members read board" on public.board_posts for select to authenticated using (true);
create policy "post to board" on public.board_posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'open' and claimer_id is null);
create policy "update board posts" on public.board_posts for update to authenticated
  using (author_id = auth.uid() or claimer_id = auth.uid() or status = 'open' or public.is_admin())
  with check (true);
create policy "remove own board posts" on public.board_posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Who may change what: the poster edits or cancels their post; anyone else may only
-- take an open job for themselves, give it back, or mark the job they took as done.
create or replace function public.board_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if new.author_id <> old.author_id then raise exception 'A post''s author can''t change.'; end if;
  if me = old.author_id or public.is_admin() then
    if new.status = 'open' then new.claimer_id := null; new.claimer_char := ''; new.claimed_at := null; end if;
  else
    if new.title <> old.title or new.qty <> old.qty or new.offer <> old.offer or new.note <> old.note
       or new.category <> old.category or new.recipe_id is distinct from old.recipe_id or new.author_char <> old.author_char then
      raise exception 'Only the person who posted this can edit it.';
    end if;
    if old.status = 'open' and new.status = 'claimed' and new.claimer_id = me then
      new.claimed_at := now();
    elsif old.claimer_id = me and new.status = 'open' then
      new.claimer_id := null; new.claimer_char := ''; new.claimed_at := null;
    elsif old.claimer_id = me and old.status = 'claimed' and new.status = 'done' then
      null;
    else
      raise exception 'Someone else has already taken this job.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger board_guard before update on public.board_posts for each row execute function public.board_guard();

grant select, insert, update, delete on public.board_posts to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter publication supabase_realtime add table public.board_posts, public.profiles;
