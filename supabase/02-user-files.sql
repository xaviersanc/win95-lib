-- Documents des utilisateurs (« Mes documents » + Corbeille) pour le fournisseur "supabase" (Win95Config.storage.provider).
-- À exécuter une fois dans Supabase > SQL Editor. Ré-exécutable sans risque (idempotent).
--
-- Modèle :
--  - public.user_files : arborescence (dossiers + fichiers), noms libres (accents, espaces…), Corbeille (trashed_at) et tailles ;
--  - bucket Storage "user-files" : contenu binaire des fichiers, sous la clé "<owner>/<uuid>" (ou, avec Google Drive,
--    storage_path = "drive:<id Google>" : voir 03-drive-storage.sql et vercel/).
--
-- Même modèle d'accès que 01-accounts.sql : pas de Supabase Auth, policies ouvertes à la clé anon (limite assumée). Le quota est
-- tout de même vérifié côté base (trigger).
--
-- Quota : 100 Mo par compte, Corbeille comprise. Pour le changer : QUOTA ci-dessous ET storage.supabase.quotaMb (Win95Config).
-- Taille maximale d'un fichier : 25 Mo (file_size_limit du bucket ET storage.supabase.maxFileMb).

create extension if not exists pgcrypto;

create table if not exists public.user_files (
    id uuid primary key default gen_random_uuid(),
    owner text not null check (owner ~ '^[a-z0-9_-]+$'),
    parent_id uuid references public.user_files (id) on delete cascade,
    name text not null check (length(trim(name)) between 1 and 200 and name !~ '[/\\]'),
    kind text not null check (kind in ('file', 'folder')),
    size bigint not null default 0 check (size >= 0),
    mime_type text,
    storage_path text unique,
    trashed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((kind = 'file') = (storage_path is not null))
);

create index if not exists user_files_owner_parent_idx on public.user_files (owner, parent_id);

-- Deux éléments visibles d'un même dossier ne peuvent pas porter le même nom.
create unique index if not exists user_files_unique_visible_name
    on public.user_files (owner, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
    where trashed_at is null;

-- Quota par utilisateur, vérifié à chaque ajout ou changement de taille.
create or replace function public.user_files_enforce_quota()
returns trigger
language plpgsql
as $$
declare
    QUOTA constant bigint := 100 * 1024 * 1024;
    used bigint;
begin
    select coalesce(sum(size), 0) into used
    from public.user_files
    where owner = new.owner and id <> new.id;

    if used + new.size > QUOTA then
        raise exception 'QUOTA_EXCEEDED' using detail = format('%s + %s > %s octets', used, new.size, QUOTA);
    end if;

    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists user_files_quota on public.user_files;
create trigger user_files_quota
    before insert or update of size, owner on public.user_files
    for each row execute function public.user_files_enforce_quota();

alter table public.user_files enable row level security;

drop policy if exists "user_files open access" on public.user_files;
create policy "user_files open access" on public.user_files
    for all to anon, authenticated
    using (true)
    with check (true);

-- Bucket privé : les fichiers sont lus via des URL signées temporaires.
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 25 * 1024 * 1024)
on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit;

drop policy if exists "user-files read" on storage.objects;
create policy "user-files read" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'user-files');

drop policy if exists "user-files insert" on storage.objects;
create policy "user-files insert" on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'user-files');

drop policy if exists "user-files delete" on storage.objects;
create policy "user-files delete" on storage.objects
    for delete to anon, authenticated
    using (bucket_id = 'user-files');
