-- ═══════════════════════════════════════════════════════════════════════════
-- 009 — Make a call's identity include WHICH backend produced it
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT GOES WRONG WITHOUT THIS
--
-- `call_logs.dograh_run_id` identifies a call by the calling backend's own run
-- id, and 006 made that column UNIQUE so a redelivered webhook cannot score a
-- lead twice. That was correct while there was exactly one backend.
--
-- On 2026-09-03 the dashboard was repointed from voice.bswealthfinance.com to
-- vaani-api.bswealthfinance.com. Vaani numbers its runs from 1 and is currently
-- at about 400. The old backend reached 2097, and 1000 of those ids are already
-- sitting in call_logs.
--
-- So from Vaani run 464 onwards — about sixty calls away — every Vaani call
-- whose id collides with an old voice row is seen as ALREADY PROCESSED:
--
--   * the webhook insert fails 23505 and returns "Already processed", 200 OK
--   * the reconcile sweep's existence check finds the old row and returns
--     'duplicate'
--
-- The call then has no call log, no lead update, no score and no bill, and
-- nothing anywhere reports an error. It is indistinguishable from the call
-- never happening.
--
-- THE FIX
--
-- Identity becomes (provider, dograh_run_id). Every existing row is voice's,
-- because every existing row predates the cutover.
--
-- Idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── Step 1: the column ─────────────────────────────────────────────────────
-- Defaulted to 'voice' so the backfill is implicit and no row is ever NULL,
-- which matters because a NULL in a unique index does not collide with another
-- NULL and would silently switch idempotency back off.
alter table public.call_logs
  add column if not exists provider text not null default 'voice';

-- Existing rows all came from the old backend. Explicit, not relying on the
-- default having been applied at the right moment.
update public.call_logs
   set provider = 'voice'
 where provider is null;

-- ─── Step 2: swap the uniqueness ────────────────────────────────────────────
-- Drop the single-column index FIRST. Leaving it in place would keep rejecting
-- a Vaani run whose id an old voice row already holds, which is the entire bug.
drop index if exists call_logs_dograh_run_id_key;
drop index if exists call_logs_dograh_run_id_idx;
drop index if exists call_logs_dograh_run_id_unique;

-- 001 may have declared it as a table CONSTRAINT rather than a bare index.
alter table public.call_logs
  drop constraint if exists call_logs_dograh_run_id_key;

create unique index if not exists call_logs_provider_run_unique
  on public.call_logs (provider, dograh_run_id);

-- Reads filter by provider now, and the sweep looks a run up on every tick.
create index if not exists call_logs_provider_idx
  on public.call_logs (provider);

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY  (run these after; both should come back as described)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   -- every existing row attributed to the old backend, none NULL:
--   select provider, count(*) from public.call_logs group by provider;
--
--   -- exactly one unique index, on the PAIR:
--   select indexname, indexdef from pg_indexes
--    where tablename = 'call_logs' and indexdef ilike '%unique%';
--
--   -- and the pair really is unique:
--   select provider, dograh_run_id, count(*)
--     from public.call_logs
--    group by 1, 2 having count(*) > 1;
-- ═══════════════════════════════════════════════════════════════════════════
