-- Kedge tenancy security model (SPEC §3.3, §5.9).
--
-- RLS is the backstop; the primary checks are can() in @kedge/core. Policies
-- call SECURITY DEFINER helpers in the private `app` schema so they can read
-- memberships and grants without recursing into RLS.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permission matrix mirror. A test asserts it equals PERMISSION_MATRIX in
-- @kedge/core; change both together, in a new migration.
-- ---------------------------------------------------------------------------
create table app.permission_matrix (
  permission text not null,
  role text not null,
  primary key (permission, role)
);

insert into app.permission_matrix (permission, role) values
  ('billing.manage', 'org_owner'),
  ('org.users.manage', 'org_owner'),
  ('org.users.manage', 'org_admin'),
  ('entity.create', 'org_owner'),
  ('entity.create', 'org_admin'),
  ('entity.settings.edit', 'org_owner'),
  ('entity.settings.edit', 'org_admin'),
  ('entity.settings.edit', 'accountant'),
  ('entity.settings.edit', 'client_owner'),
  ('entity.users.invite', 'org_owner'),
  ('entity.users.invite', 'org_admin'),
  ('entity.users.invite', 'accountant'),
  ('entity.users.invite', 'client_owner'),
  ('coa.edit', 'org_owner'),
  ('coa.edit', 'org_admin'),
  ('coa.edit', 'accountant'),
  ('transaction.create', 'org_owner'),
  ('transaction.create', 'org_admin'),
  ('transaction.create', 'accountant'),
  ('transaction.create', 'bookkeeper'),
  ('transaction.create', 'client_owner'),
  ('transaction.create', 'client_staff'),
  ('transaction.post', 'org_owner'),
  ('transaction.post', 'org_admin'),
  ('transaction.post', 'accountant'),
  ('transaction.post', 'bookkeeper'),
  ('transaction.post', 'client_owner'),
  ('journal.manual.post', 'org_owner'),
  ('journal.manual.post', 'org_admin'),
  ('journal.manual.post', 'accountant'),
  ('journal.reverse', 'org_owner'),
  ('journal.reverse', 'org_admin'),
  ('journal.reverse', 'accountant'),
  ('statement.import', 'org_owner'),
  ('statement.import', 'org_admin'),
  ('statement.import', 'accountant'),
  ('statement.import', 'bookkeeper'),
  ('statement.import', 'client_owner'),
  ('reconciliation.complete', 'org_owner'),
  ('reconciliation.complete', 'org_admin'),
  ('reconciliation.complete', 'accountant'),
  ('reconciliation.complete', 'bookkeeper'),
  ('period.lock', 'org_owner'),
  ('period.lock', 'org_admin'),
  ('period.lock', 'accountant'),
  ('period.unlock', 'org_owner'),
  ('period.unlock', 'org_admin'),
  ('period.unlock', 'accountant'),
  ('year.close', 'org_owner'),
  ('year.close', 'org_admin'),
  ('year.reopen', 'org_owner'),
  ('year.reopen', 'org_admin'),
  ('budget.edit', 'org_owner'),
  ('budget.edit', 'org_admin'),
  ('budget.edit', 'accountant'),
  ('budget.edit', 'client_owner'),
  ('fs_upload.import_history.post', 'org_owner'),
  ('fs_upload.import_history.post', 'org_admin'),
  ('fs_upload.import_history.post', 'accountant'),
  ('fs_upload.analysis', 'org_owner'),
  ('fs_upload.analysis', 'org_admin'),
  ('fs_upload.analysis', 'accountant'),
  ('fs_upload.analysis', 'bookkeeper'),
  ('fs_upload.analysis', 'client_owner'),
  ('report.view', 'org_owner'),
  ('report.view', 'org_admin'),
  ('report.view', 'accountant'),
  ('report.view', 'bookkeeper'),
  ('report.view', 'client_owner'),
  ('report.view', 'viewer'),
  ('audit_log.view', 'org_owner'),
  ('audit_log.view', 'org_admin'),
  ('audit_log.view', 'accountant'),
  ('audit_log.view', 'client_owner'),
  ('data.export', 'org_owner'),
  ('data.export', 'org_admin'),
  ('data.export', 'accountant'),
  ('data.export', 'client_owner')
;

create table app.org_permissions (permission text primary key);
insert into app.org_permissions (permission) values ('billing.manage'), ('org.users.manage'), ('entity.create');

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create function app.current_email() returns text
language sql stable set search_path = '' as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
$$;

-- The caller's role from an active membership in the org, or null.
create function app.org_role(p_org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

create function app.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.org_role(p_org) is not null
$$;

create function app.is_org_wide(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.org_role(p_org) in ('org_owner', 'org_admin'), false)
$$;

-- Mirrors effectiveEntityRole() in @kedge/core: org owners/admins hold their
-- role on every entity; firm staff need an active membership and an
-- unexpired grant; client users need an unexpired grant.
create function app.entity_role(p_entity uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when m.role in ('org_owner', 'org_admin') then m.role::text
    else (
      select ea.role::text from public.entity_access ea
      where ea.entity_id = e.id
        and ea.user_id = auth.uid()
        and (ea.expires_at is null or ea.expires_at > now())
        and (ea.role in ('client_owner', 'client_staff', 'viewer') or m.role is not null)
    )
  end
  from public.entities e
  left join public.memberships m
    on m.org_id = e.org_id and m.user_id = auth.uid() and m.status = 'active'
  where e.id = p_entity
$$;

create function app.can_read_entity(p_entity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.entity_role(p_entity) is not null
$$;

-- Entity-level permission check (mirrors can() for entity permissions).
create function app.can(p_permission text, p_entity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from app.org_permissions op where op.permission = p_permission)
    and exists (
      select 1 from app.permission_matrix pm
      where pm.permission = p_permission and pm.role = app.entity_role(p_entity)
    )
$$;

-- Org-level permission check (billing.manage, org.users.manage, entity.create).
create function app.can_org(p_permission text, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.org_permissions op
    join app.permission_matrix pm on pm.permission = op.permission
    where op.permission = p_permission and pm.role = app.org_role(p_org)::text
  )
$$;

create function app.has_any_access_in_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_org_member(p_org) or exists (
    select 1 from public.entity_access ea
    where ea.org_id = p_org and ea.user_id = auth.uid() and app.entity_role(ea.entity_id) is not null
  )
$$;

-- Mirrors invitableRoles() in @kedge/core (ADR 0002) for entity-scope grants.
create function app.can_grant(p_entity uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when app.can_org('org.users.manage', e.org_id) then true
      when not app.can('entity.users.invite', p_entity) then false
      when app.entity_role(p_entity) = 'accountant' then p_role in ('client_owner', 'client_staff', 'viewer')
      when app.entity_role(p_entity) = 'client_owner' then p_role in ('client_staff', 'viewer')
      else false
    end
    from public.entities e where e.id = p_entity
  ), false)
$$;

-- Who may create or revoke an invitation of this role and scope.
create function app.invitation_manager(p_org uuid, p_entity uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_entity is null then app.can_org('org.users.manage', p_org) and p_role in ('org_admin', 'accountant', 'bookkeeper')
    else p_role <> 'org_admin' and app.can_grant(p_entity, p_role)
  end
$$;

-- Whether the caller holds a pending invitation granting `p_role` in the org
-- (and, when given, on the entity). Used for self-service acceptance.
create function app.has_pending_invitation(p_org uuid, p_entity uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_email() is not null and exists (
    select 1 from public.invitations i
    where i.org_id = p_org
      and (p_entity is null or i.entity_id = p_entity)
      and i.role::text = p_role
      and i.email = app.current_email()
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  )
$$;

-- A new org may take its first (owner) membership only from its creator.
create function app.org_bootstrap_allowed(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisations o where o.id = p_org and o.created_by = auth.uid())
    and not exists (select 1 from public.memberships m where m.org_id = p_org)
$$;

create function app.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.status = 'active' and app.is_org_member(m.org_id)
  ) or exists (
    select 1 from public.entity_access ea
    where ea.user_id = p_user and app.entity_role(ea.entity_id) is not null
  )
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger organisations_updated_at before update on public.organisations for each row execute function app.set_updated_at();
create trigger users_updated_at before update on public.users for each row execute function app.set_updated_at();
create trigger memberships_updated_at before update on public.memberships for each row execute function app.set_updated_at();
create trigger entities_updated_at before update on public.entities for each row execute function app.set_updated_at();
create trigger entity_access_updated_at before update on public.entity_access for each row execute function app.set_updated_at();
create trigger user_entity_prefs_updated_at before update on public.user_entity_prefs for each row execute function app.set_updated_at();
create trigger invitations_updated_at before update on public.invitations for each row execute function app.set_updated_at();

-- Mirror auth.users into public.users.
create function app.sync_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    return new;
  end if;
  insert into public.users (id, email, full_name)
  values (new.id, lower(new.email), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email;
  return new;
end
$$;

create trigger on_auth_user_change
  after insert or update of email on auth.users
  for each row execute function app.sync_auth_user();

insert into public.users (id, email, full_name)
select u.id, lower(u.email), u.raw_user_meta_data ->> 'full_name' from auth.users u where u.email is not null
on conflict (id) do nothing;

-- Billing fields are written only by trusted server code (Paystack webhooks),
-- never by end users. New orgs always start on a trial.
create function app.organisations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.billing_status <> 'trialing' or new.plan_code is not null
       or new.trial_ends_at is null or new.trial_ends_at > now() + interval '14 days 1 minute' then
      raise exception 'new organisations must start on a trial' using errcode = '42501';
    end if;
  elsif (new.billing_status, new.plan_code, new.trial_ends_at, new.created_by)
        is distinct from (old.billing_status, old.plan_code, old.trial_ends_at, old.created_by) then
    raise exception 'billing fields cannot be changed directly' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger organisations_guard before insert or update on public.organisations
  for each row execute function app.organisations_guard();

-- Users may edit their profile but not their identity.
create function app.users_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and (new.id, new.email) is distinct from (old.id, old.email) then
    raise exception 'email is managed by the auth provider' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger users_guard before update on public.users for each row execute function app.users_guard();

-- Invitation managers may revoke; the invitee may only mark it accepted.
create function app.invitations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.id, new.org_id, new.entity_id, new.email, new.role, new.token_hash, new.expires_at, new.invited_by, new.created_at)
     is distinct from (old.id, old.org_id, old.entity_id, old.email, old.role, old.token_hash, old.expires_at, old.invited_by, old.created_at) then
    raise exception 'invitations cannot be edited, only revoked or accepted' using errcode = '42501';
  end if;
  if old.accepted_at is not null or old.revoked_at is not null then
    raise exception 'invitation is no longer pending' using errcode = '42501';
  end if;
  if app.invitation_manager(old.org_id, old.entity_id, old.role::text)
     and new.accepted_at is null and new.revoked_by = auth.uid() then
    return new;
  end if;
  if old.email = app.current_email() and new.revoked_at is null
     and new.accepted_at is not null and new.accepted_by = auth.uid() and old.expires_at > now() then
    return new;
  end if;
  raise exception 'not allowed to change this invitation' using errcode = '42501';
end
$$;

create trigger invitations_guard before update on public.invitations for each row execute function app.invitations_guard();

-- audit_log is append-only for every role (CLAUDE.md, AC-0.5).
create function app.reject_audit_log_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end
$$;

create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function app.reject_audit_log_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function app.reject_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- Table privileges. `anon` gets nothing; every public route that needs data
-- before sign-in runs on the server with the service role.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
revoke all on public.organisations, public.users, public.memberships, public.entities, public.entity_access,
  public.user_entity_prefs, public.invitations, public.audit_log from anon, authenticated;
grant select, insert, update, delete on public.organisations, public.memberships, public.entities,
  public.entity_access, public.user_entity_prefs, public.invitations to authenticated;
grant select, update on public.users to authenticated;
grant select, insert on public.audit_log to authenticated;
grant all on public.organisations, public.users, public.memberships, public.entities, public.entity_access,
  public.user_entity_prefs, public.invitations to service_role;
grant select, insert on public.audit_log to service_role;
revoke update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- organisations
create policy organisations_select on public.organisations for select to authenticated
  using (app.has_any_access_in_org(id) or (created_by = (select auth.uid()) and app.org_bootstrap_allowed(id)));
create policy organisations_insert on public.organisations for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy organisations_update on public.organisations for update to authenticated
  using (app.can_org('org.users.manage', id)) with check (app.can_org('org.users.manage', id));
create policy organisations_delete on public.organisations for delete to authenticated
  using (app.can_org('billing.manage', id));

-- users
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or app.shares_org_with(id));
create policy users_update on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.is_org_member(org_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (
    (role <> 'org_owner' and app.can_org('org.users.manage', org_id))
    or (role = 'org_owner' and user_id = (select auth.uid()) and status = 'active' and app.org_bootstrap_allowed(org_id))
    or (role <> 'org_owner' and user_id = (select auth.uid()) and status = 'active'
        and app.has_pending_invitation(org_id, null, role::text))
  );
create policy memberships_update on public.memberships for update to authenticated
  using (role <> 'org_owner' and app.can_org('org.users.manage', org_id))
  with check (role <> 'org_owner' and app.can_org('org.users.manage', org_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (role <> 'org_owner' and (app.can_org('org.users.manage', org_id) or user_id = (select auth.uid())));

-- entities
create policy entities_select on public.entities for select to authenticated
  using (app.is_org_wide(org_id) or app.can_read_entity(id));
create policy entities_insert on public.entities for insert to authenticated
  with check (app.can_org('entity.create', org_id));
create policy entities_update on public.entities for update to authenticated
  using (app.can('entity.settings.edit', id)) with check (app.can('entity.settings.edit', id));

-- entity_access
create policy entity_access_select on public.entity_access for select to authenticated
  using (user_id = (select auth.uid()) or app.is_org_wide(org_id) or app.can('entity.users.invite', entity_id));
create policy entity_access_insert on public.entity_access for insert to authenticated
  with check (
    app.can_grant(entity_id, role::text)
    or (user_id = (select auth.uid()) and app.has_pending_invitation(org_id, entity_id, role::text))
  );
create policy entity_access_update on public.entity_access for update to authenticated
  using (app.can_grant(entity_id, role::text)) with check (app.can_grant(entity_id, role::text));
create policy entity_access_delete on public.entity_access for delete to authenticated
  using (app.can_grant(entity_id, role::text) or user_id = (select auth.uid()));

-- user_entity_prefs
create policy user_entity_prefs_all on public.user_entity_prefs for all to authenticated
  using (user_id = (select auth.uid()) and app.can_read_entity(entity_id))
  with check (user_id = (select auth.uid()) and app.can_read_entity(entity_id));

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using (app.invitation_manager(org_id, entity_id, role::text) or email = app.current_email());
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    invited_by = (select auth.uid()) and accepted_at is null and revoked_at is null
    and app.invitation_manager(org_id, entity_id, role::text)
  );
create policy invitations_update on public.invitations for update to authenticated
  using (app.invitation_manager(org_id, entity_id, role::text) or email = app.current_email())
  with check (app.invitation_manager(org_id, entity_id, role::text) or email = app.current_email());

-- audit_log: append-only; readable with audit_log.view
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    (entity_id is null and app.is_org_wide(org_id))
    or (entity_id is not null and app.can('audit_log.view', entity_id))
  );
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and app.has_any_access_in_org(org_id)
    and (entity_id is null or app.can_read_entity(entity_id))
  );
