-- Contenu des documents dans Google Drive (fournisseur "supabase+drive"), à exécuter après 02-user-files.sql. Idempotent.
--  - Le contenu des nouveaux fichiers va dans le Google Drive du propriétaire du site (vercel/api/drive.js) :
--    storage_path = "drive:<id Google>". La table user_files garde l'arborescence, les noms, la Corbeille et les tailles.
--    Les fichiers déjà dans le bucket Supabase restent lisibles (storage_path "<owner>/<uuid>").
--  - Quota par compte : 1 Go (au lieu de 100 Mo). À garder identique à storage.drive.quotaMb (Win95Config).
--    Sans Google Drive (site ouvert en local ou variables Vercel absentes), le client revient aux 100 Mo du bucket.

create or replace function public.user_files_enforce_quota()
returns trigger
language plpgsql
as $$
declare
    QUOTA constant bigint := 1024 * 1024 * 1024;
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
