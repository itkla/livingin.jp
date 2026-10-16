-- Idempotency-Key records (docs/api/CONVENTIONS.md#idempotency). Scope is
-- "<actor> <METHOD> <path>"; rows expire after 24 hours and are swept by a scheduled job.

create table idempotency_keys (
  scope text not null,
  key text not null check (char_length(key) between 1 and 255),
  fingerprint text not null,
  response_status integer,
  response_headers jsonb,
  response_body text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, key),
  check ((response_status is null) = (response_headers is null))
);

create index idempotency_keys_expires on idempotency_keys (expires_at);
