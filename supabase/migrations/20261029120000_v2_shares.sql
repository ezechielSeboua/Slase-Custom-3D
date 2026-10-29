-- V2, étape 5 : partage d'une création par lien, en lecture seule.
-- Un lien = un jeton secret aléatoire (18 octets, 24 caractères). Une création a au plus un lien ;
-- le désactiver supprime la ligne. La lecture publique ne passe pas par cette table : elle passe par
-- la fonction `shared-design`, qui vérifie le jeton avec la clé d'administration.

create table public.shares (
  token text primary key
    default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  design_id uuid not null unique references public.designs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;

-- Le propriétaire voit, crée et supprime ses liens ; personne d'autre n'accède à la table.
create policy "shares : lecture de ses liens" on public.shares
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "shares : création de ses liens" on public.shares
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.designs d
      where d.id = design_id and d.user_id = (select auth.uid()) and d.deleted_at is null
    )
  );

create policy "shares : suppression de ses liens" on public.shares
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create index shares_user_idx on public.shares (user_id);
