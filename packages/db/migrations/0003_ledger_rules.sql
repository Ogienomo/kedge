-- Ledger invariants enforced by the database (CLAUDE.md rules 1, 2, 3, 5),
-- in addition to the same checks in @kedge/core. Plus RLS for the ledger
-- tables (SPEC §5.9) and their grants.
--
-- Violations raise SQLSTATE 23514 (check_violation) with a plain message.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger accounts_updated_at before update on public.accounts for each row execute function app.set_updated_at();
create trigger fiscal_years_updated_at before update on public.fiscal_years for each row execute function app.set_updated_at();
create trigger periods_updated_at before update on public.periods for each row execute function app.set_updated_at();
create trigger contacts_updated_at before update on public.contacts for each row execute function app.set_updated_at();
create trigger tax_codes_updated_at before update on public.tax_codes for each row execute function app.set_updated_at();
create trigger journal_entries_updated_at before update on public.journal_entries for each row execute function app.set_updated_at();
create trigger journal_lines_updated_at before update on public.journal_lines for each row execute function app.set_updated_at();
create trigger number_sequences_updated_at before update on public.number_sequences for each row execute function app.set_updated_at();
create trigger bank_accounts_updated_at before update on public.bank_accounts for each row execute function app.set_updated_at();
create trigger transactions_updated_at before update on public.transactions for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Accounts: hierarchy (same type, ≤ 3 levels), system accounts, leaf flag
-- ---------------------------------------------------------------------------
create function app.accounts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent_type public.account_type;
  v_cursor uuid;
  v_depth int := 1;
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null then
      raise exception 'System accounts cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if (new.org_id, new.entity_id) is distinct from (old.org_id, old.entity_id) then
      raise exception 'Accounts cannot move between entities' using errcode = '23514';
    end if;
    if old.system_key is not null and (new.system_key is distinct from old.system_key or new.type <> old.type) then
      raise exception 'System accounts keep their key and type' using errcode = '23514';
    end if;
    if new.type <> old.type and exists (select 1 from public.journal_lines l where l.account_id = old.id) then
      raise exception 'The type of an account with postings cannot change' using errcode = '23514';
    end if;
  end if;

  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if new.parent_id = new.id then
      raise exception 'An account cannot be its own parent' using errcode = '23514';
    end if;
    select a.type into v_parent_type from public.accounts a where a.id = new.parent_id;
    if v_parent_type is distinct from new.type then
      raise exception 'A sub-account must have the same type as its parent' using errcode = '23514';
    end if;
    if exists (select 1 from public.journal_lines l where l.account_id = new.parent_id) then
      raise exception 'Sub-accounts cannot be added under an account that already has postings' using errcode = '23514';
    end if;
    v_cursor := new.parent_id;
    while v_cursor is not null loop
      v_depth := v_depth + 1;
      if v_cursor = new.id or v_depth > 3 then
        raise exception 'Account hierarchy is limited to 3 levels' using errcode = '23514';
      end if;
      select a.parent_id into v_cursor from public.accounts a where a.id = v_cursor;
    end loop;
  end if;
  return new;
end
$$;

create trigger accounts_guard before insert or update or delete on public.accounts
  for each row execute function app.accounts_guard();

-- Only leaf accounts take postings; keep is_leaf in step with the tree.
create function app.accounts_maintain_leaf() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.accounts a
     set is_leaf = not exists (select 1 from public.accounts c where c.parent_id = a.id)
   where a.id in (
     case when tg_op in ('UPDATE', 'DELETE') then old.parent_id end,
     case when tg_op in ('INSERT', 'UPDATE') then new.parent_id end
   );
  return null;
end
$$;

create trigger accounts_maintain_leaf after insert or delete or update of parent_id on public.accounts
  for each row execute function app.accounts_maintain_leaf();

-- ---------------------------------------------------------------------------
-- Journal entries: drafts → posted, immutability, period lock (rules 3, 5)
-- ---------------------------------------------------------------------------
create function app.journal_entries_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_period_id uuid;
  v_period_status public.period_status;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Posted entries cannot be deleted. Reverse the entry instead.' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Entries are created as drafts, then posted' using errcode = '23514';
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.id, new.org_id, new.entity_id) is distinct from (old.id, old.org_id, old.entity_id) then
    raise exception 'Entries cannot move between entities' using errcode = '23514';
  end if;

  if old.status = 'posted' then
    -- The only permitted change to a posted entry: setting reversed_by_entry_id once.
    if (new.number, new.entry_date, new.period_id, new.memo, new.status, new.source_type, new.source_id,
        new.reverses_entry_id, new.reversal_reason, new.posted_at, new.posted_by, new.created_by,
        new.idempotency_key, new.created_at)
       is distinct from
       (old.number, old.entry_date, old.period_id, old.memo, old.status, old.source_type, old.source_id,
        old.reverses_entry_id, old.reversal_reason, old.posted_at, old.posted_by, old.created_by,
        old.idempotency_key, old.created_at) then
      raise exception 'Posted entries are immutable. Reverse the entry instead.' using errcode = '23514';
    end if;
    if new.reversed_by_entry_id is distinct from old.reversed_by_entry_id then
      if old.reversed_by_entry_id is not null or new.reversed_by_entry_id is null then
        raise exception 'An entry can be marked reversed only once' using errcode = '23514';
      end if;
      if not exists (
        select 1 from public.journal_entries r
        where r.id = new.reversed_by_entry_id and r.reverses_entry_id = old.id
          and r.source_type = 'reversal' and r.status = 'posted'
      ) then
        raise exception 'reversed_by_entry_id must point at the posted reversal of this entry' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- Draft → posted: the period containing the date must exist and be open.
  if new.status = 'posted' then
    select p.id, p.status into v_period_id, v_period_status
      from public.periods p
     where p.entity_id = new.entity_id and new.entry_date between p.start_date and p.end_date;
    if v_period_id is null then
      raise exception 'No accounting period covers %', new.entry_date using errcode = '23514';
    end if;
    if v_period_status <> 'open' then
      raise exception 'The period containing % is %', new.entry_date, v_period_status using errcode = '23514';
    end if;
    new.period_id := v_period_id;

    if exists (
      select 1 from public.journal_lines l join public.accounts a on a.id = l.account_id
      where l.entry_id = new.id and (not a.is_active or not a.is_leaf)
    ) then
      raise exception 'Entries can only post to active, leaf accounts' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

create trigger journal_entries_guard before insert or update or delete on public.journal_entries
  for each row execute function app.journal_entries_guard();

-- Lines of a posted entry never change; new lines need an active leaf account.
create function app.journal_lines_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.entry_status;
  v_active boolean;
  v_leaf boolean;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select e.status into v_status from public.journal_entries e where e.id = old.entry_id;
    if v_status = 'posted' then
      raise exception 'Lines of a posted entry cannot change. Reverse the entry instead.' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select e.status into v_status from public.journal_entries e where e.id = new.entry_id;
    if v_status = 'posted' then
      raise exception 'Lines cannot be added to a posted entry' using errcode = '23514';
    end if;
    select a.is_active, a.is_leaf into v_active, v_leaf from public.accounts a where a.id = new.account_id;
    if not v_active then
      raise exception 'This account is deactivated' using errcode = '23514';
    end if;
    if not v_leaf then
      raise exception 'Post to a sub-account, not a parent account' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end
$$;

create trigger journal_lines_guard before insert or update or delete on public.journal_lines
  for each row execute function app.journal_lines_guard();

-- Rule 1 at commit: every posted entry has ≥ 2 lines and debits = credits.
create function app.check_entry_balanced() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entry uuid;
  v_status public.entry_status;
  v_debit numeric;
  v_credit numeric;
  v_lines int;
begin
  if tg_table_name = 'journal_entries' then
    v_entry := new.id;
  elsif tg_op = 'DELETE' then
    v_entry := old.entry_id;
  else
    v_entry := new.entry_id;
  end if;

  select e.status into v_status from public.journal_entries e where e.id = v_entry;
  if v_status is distinct from 'posted' then
    return null;
  end if;

  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0), count(*)
    into v_debit, v_credit, v_lines
    from public.journal_lines l where l.entry_id = v_entry;
  if v_lines < 2 or v_debit <> v_credit then
    raise exception 'Journal entry % does not balance (debits %, credits %, % lines)', v_entry, v_debit, v_credit, v_lines
      using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger journal_entries_balanced
  after insert or update on public.journal_entries
  deferrable initially deferred
  for each row execute function app.check_entry_balanced();

create constraint trigger journal_lines_balanced
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function app.check_entry_balanced();

-- ---------------------------------------------------------------------------
-- Periods: no edits to dates; unlocking needs a reason; closed is final here
-- ---------------------------------------------------------------------------
create function app.periods_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.start_date, new.end_date, new.fiscal_year_id, new.entity_id, new.org_id)
     is distinct from (old.start_date, old.end_date, old.fiscal_year_id, old.entity_id, old.org_id) then
    raise exception 'Period dates cannot change' using errcode = '23514';
  end if;
  if old.status = 'locked' and new.status = 'open' and coalesce(btrim(new.unlock_reason), '') = '' then
    raise exception 'Unlocking a period requires a reason' using errcode = '23514';
  end if;
  if old.status = 'closed' and new.status <> 'closed' and current_user = 'authenticated' then
    raise exception 'Closed periods are reopened by reopening the fiscal year' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger periods_guard before update on public.periods for each row execute function app.periods_guard();

-- ---------------------------------------------------------------------------
-- Tax codes: a rate change is a new version, never an edit (SPEC §4.7)
-- ---------------------------------------------------------------------------
create function app.tax_codes_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.code_key, new.kind, new.rate_bps, new.effective_from, new.entity_id, new.org_id)
     is distinct from (old.code_key, old.kind, old.rate_bps, old.effective_from, old.entity_id, old.org_id) then
    raise exception 'Tax rates are versioned: create a new version with a new effective date' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger tax_codes_guard before update on public.tax_codes for each row execute function app.tax_codes_guard();

-- ---------------------------------------------------------------------------
-- Transactions: posted ones only move to reversed; reversed ones are final
-- ---------------------------------------------------------------------------
create function app.transactions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Posted transactions cannot be deleted. Reverse them instead.' using errcode = '23514';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'posted' and new.status = 'reversed'
     and (new.kind, new.txn_date, new.amount, new.bank_account_id, new.counter_account_id, new.contact_id,
          new.tax_code_id, new.wht_code_id, new.amounts_include_tax, new.interest_amount, new.interest_account_id,
          new.journal_entry_id, new.entity_id, new.org_id)
         is not distinct from
         (old.kind, old.txn_date, old.amount, old.bank_account_id, old.counter_account_id, old.contact_id,
          old.tax_code_id, old.wht_code_id, old.amounts_include_tax, old.interest_amount, old.interest_account_id,
          old.journal_entry_id, old.entity_id, old.org_id) then
    return new;
  end if;
  raise exception 'Posted transactions are immutable. Reverse and record again instead.' using errcode = '23514';
end
$$;

create trigger transactions_guard before update or delete on public.transactions
  for each row execute function app.transactions_guard();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

-- Who may create/post entries of a given source type (SPEC §3.3).
create function app.can_write_entry(p_entity uuid, p_source text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_source
    when 'manual' then app.can('journal.manual.post', p_entity)
    when 'opening_balance' then app.can('journal.manual.post', p_entity)
    when 'transaction' then app.can('transaction.post', p_entity)
    when 'reversal' then app.can('journal.reverse', p_entity)
    when 'year_end_close' then app.can('year.close', p_entity)
    else false
  end
$$;

create function app.can_write_lines(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.can_write_entry(e.entity_id, e.source_type::text)
    from public.journal_entries e where e.id = p_entry
  ), false)
$$;

create function app.can_post_anything(p_entity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can('transaction.post', p_entity) or app.can('journal.manual.post', p_entity) or app.can('journal.reverse', p_entity)
$$;

revoke all on function app.can_write_entry(uuid, text), app.can_write_lines(uuid), app.can_post_anything(uuid) from public;
grant execute on function app.can_write_entry(uuid, text), app.can_write_lines(uuid), app.can_post_anything(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.accounts, public.fiscal_years, public.periods, public.contacts, public.tax_codes,
  public.journal_entries, public.journal_lines, public.number_sequences, public.bank_accounts, public.transactions
  from anon, authenticated;
grant select, insert, update, delete on public.accounts, public.fiscal_years, public.periods, public.contacts, public.tax_codes,
  public.journal_entries, public.journal_lines, public.number_sequences, public.bank_accounts, public.transactions
  to authenticated;
grant all on public.accounts, public.fiscal_years, public.periods, public.contacts, public.tax_codes,
  public.journal_entries, public.journal_lines, public.number_sequences, public.bank_accounts, public.transactions
  to service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- accounts: everyone with access reads (categories); coa.edit writes
create policy accounts_select on public.accounts for select to authenticated using (app.can_read_entity(entity_id));
create policy accounts_insert on public.accounts for insert to authenticated with check (app.can('coa.edit', entity_id));
create policy accounts_update on public.accounts for update to authenticated
  using (app.can('coa.edit', entity_id)) with check (app.can('coa.edit', entity_id));
create policy accounts_delete on public.accounts for delete to authenticated using (app.can('coa.edit', entity_id));

-- fiscal years and periods
create policy fiscal_years_select on public.fiscal_years for select to authenticated using (app.can_read_entity(entity_id));
create policy fiscal_years_insert on public.fiscal_years for insert to authenticated with check (app.can('entity.settings.edit', entity_id));
create policy fiscal_years_update on public.fiscal_years for update to authenticated
  using (app.can('year.close', entity_id)) with check (app.can('year.close', entity_id));

create policy periods_select on public.periods for select to authenticated using (app.can_read_entity(entity_id));
create policy periods_insert on public.periods for insert to authenticated with check (app.can('entity.settings.edit', entity_id));
create policy periods_update on public.periods for update to authenticated
  using (app.can('period.lock', entity_id) or app.can('period.unlock', entity_id))
  with check (
    case status
      when 'locked' then app.can('period.lock', entity_id)
      when 'open' then app.can('period.unlock', entity_id)
      else app.can('year.close', entity_id)
    end
  );

-- contacts
create policy contacts_select on public.contacts for select to authenticated using (app.can_read_entity(entity_id));
create policy contacts_insert on public.contacts for insert to authenticated with check (app.can('transaction.create', entity_id));
create policy contacts_update on public.contacts for update to authenticated
  using (app.can('transaction.create', entity_id)) with check (app.can('transaction.create', entity_id));

-- tax codes
create policy tax_codes_select on public.tax_codes for select to authenticated using (app.can_read_entity(entity_id));
create policy tax_codes_insert on public.tax_codes for insert to authenticated with check (app.can('entity.settings.edit', entity_id));
create policy tax_codes_update on public.tax_codes for update to authenticated
  using (app.can('entity.settings.edit', entity_id)) with check (app.can('entity.settings.edit', entity_id));

-- journal entries and lines: the ledger is visible with report.view
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (app.can('report.view', entity_id) or (created_by = (select auth.uid()) and app.can_read_entity(entity_id)));
create policy journal_entries_insert on public.journal_entries for insert to authenticated
  with check (created_by = (select auth.uid()) and app.can_write_entry(entity_id, source_type::text));
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (app.can_write_entry(entity_id, source_type::text) or (status = 'posted' and app.can('journal.reverse', entity_id)))
  with check (app.can_write_entry(entity_id, source_type::text) or (status = 'posted' and app.can('journal.reverse', entity_id)));
create policy journal_entries_delete on public.journal_entries for delete to authenticated
  using (status = 'draft' and app.can_write_entry(entity_id, source_type::text));

create policy journal_lines_select on public.journal_lines for select to authenticated using (app.can('report.view', entity_id));
create policy journal_lines_insert on public.journal_lines for insert to authenticated with check (app.can_write_lines(entry_id));
create policy journal_lines_update on public.journal_lines for update to authenticated
  using (app.can_write_lines(entry_id)) with check (app.can_write_lines(entry_id));
create policy journal_lines_delete on public.journal_lines for delete to authenticated using (app.can_write_lines(entry_id));

-- number sequences: read by members, advanced by anyone who can post
create policy number_sequences_select on public.number_sequences for select to authenticated using (app.can_read_entity(entity_id));
create policy number_sequences_insert on public.number_sequences for insert to authenticated with check (app.can('entity.settings.edit', entity_id));
create policy number_sequences_update on public.number_sequences for update to authenticated
  using (app.can_post_anything(entity_id)) with check (app.can_post_anything(entity_id));

-- bank accounts
create policy bank_accounts_select on public.bank_accounts for select to authenticated using (app.can_read_entity(entity_id));
create policy bank_accounts_insert on public.bank_accounts for insert to authenticated with check (app.can('coa.edit', entity_id));
create policy bank_accounts_update on public.bank_accounts for update to authenticated
  using (app.can('coa.edit', entity_id)) with check (app.can('coa.edit', entity_id));

-- transactions: staff record drafts; posting and reversing need their own permissions
create policy transactions_select on public.transactions for select to authenticated
  using (app.can('report.view', entity_id) or (created_by = (select auth.uid()) and app.can_read_entity(entity_id)));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'draft' and app.can('transaction.create', entity_id));
create policy transactions_update on public.transactions for update to authenticated
  using (app.can('transaction.create', entity_id))
  with check (
    case status
      when 'draft' then app.can('transaction.create', entity_id)
      when 'posted' then app.can('transaction.post', entity_id)
      else app.can('journal.reverse', entity_id)
    end
  );
create policy transactions_delete on public.transactions for delete to authenticated
  using (status = 'draft' and app.can('transaction.create', entity_id));
