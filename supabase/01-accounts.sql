-- Comptes de la bibliothèque Win95 (fournisseur "supabase" : Win95Config.accounts.provider = "supabase").
-- À exécuter une fois dans Supabase > SQL Editor. Ré-exécutable sans risque (idempotent).
--
-- Un compte : nom affiché (unique sans tenir compte de la casse), rôle admin / user, applications autorisées
-- (allowed_apps : tableau JSON de clés d'applications, null = toutes), sel et empreinte SHA-256 du mot de passe.
-- Aucun compte n'est créé ici : le premier démarrage du site demande de créer l'administrateur.
--
-- LIMITE ASSUMÉE : la connexion est vérifiée dans le navigateur (pas de Supabase Auth). Les policies ci-dessous sont donc
-- ouvertes à la clé « anon » (publique) : quiconque a accès au site peut lire les empreintes et modifier les comptes via la
-- console. C'est adapté à un site entre amis ou à une démo, pas à des données sensibles. Pour durcir : passer à Supabase Auth
-- (comptes email, policies par auth.uid()) et fournir un fournisseur de comptes personnalisé (Win95Accounts.useProvider).

create table if not exists public.win95_accounts (
    id text primary key check (id ~ '^[a-z0-9_-]+$'),
    name text not null check (length(trim(name)) between 1 and 32),
    role text not null default 'user' check (role in ('admin', 'user')),
    allowed_apps jsonb,
    salt text not null,
    hash text not null check (hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Deux comptes ne peuvent pas porter le même nom (casse ignorée).
create unique index if not exists win95_accounts_unique_name on public.win95_accounts (lower(name));

alter table public.win95_accounts enable row level security;

drop policy if exists "win95_accounts open access" on public.win95_accounts;
create policy "win95_accounts open access" on public.win95_accounts
    for all to anon, authenticated
    using (true)
    with check (true);
