-- Identity foundation (#13). A private account and its public profile are separate records:
-- nothing in public_profiles may be derived from private account data without the member's action.

create table accounts (
  id text primary key check (id ~ '^acct_[0-9A-HJKMNP-TV-Z]{26}$'),
  email text not null check (char_length(email) between 3 and 320),
  status text not null default 'active' check (status in ('active', 'restricted', 'deactivated')),
  preferred_lang text not null default 'en' check (preferred_lang in ('en', 'ja')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index accounts_email_unique on accounts (lower(email));

create table public_profiles (
  id text primary key check (id ~ '^prof_[0-9A-HJKMNP-TV-Z]{26}$'),
  account_id text not null unique references accounts (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text check (bio is null or char_length(bio) <= 1000),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id text primary key check (id ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
  kind text not null check (kind in ('municipality', 'public_agency', 'nonprofit', 'business', 'community_group', 'other')),
  name_ja text,
  name_en text,
  verification text not null default 'unverified' check (verification in ('unverified', 'verified')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name_ja is not null or name_en is not null)
);

-- An account acting for an organization is a role grant, not a different kind of account.
create table organization_roles (
  organization_id text not null references organizations (id) on delete cascade,
  account_id text not null references accounts (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (organization_id, account_id)
);

create index organization_roles_account on organization_roles (account_id);
