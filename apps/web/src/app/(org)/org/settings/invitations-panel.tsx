"use client";

import { ApiRequestError, type Invitation, type InvitationOptions } from "@kedge/api";
import { roleLabel, type InvitableRole } from "@kedge/core";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Field,
  Input,
  Select,
} from "@kedge/ui";
import { MailPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";

const ORG_SCOPE = "org";

const statusTone = { pending: "primary", accepted: "success", revoked: "neutral", expired: "warning" } as const;

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

export function InvitationsPanel({ orgId, options, invitations }: { orgId: string; options: InvitationOptions; invitations: Invitation[] }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const scopes = useMemo(
    () => [
      ...(options.organisation.length > 0 ? [{ value: ORG_SCOPE, label: "Whole organisation", roles: options.organisation }] : []),
      ...options.entities.map((e) => ({ value: e.id, label: e.name, roles: e.roles })),
    ],
    [options],
  );
  const [scope, setScope] = useState(scopes[0]?.value ?? ORG_SCOPE);
  const roles: readonly InvitableRole[] = scopes.find((s) => s.value === scope)?.roles ?? [];

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const created = await api.createInvitation(orgId, {
        email: String(form.get("email") ?? ""),
        role: String(form.get("role")) as InvitableRole,
        entityId: scope === ORG_SCOPE ? null : scope,
      });
      setNotice(created.emailSent === false ? `The invitation was saved, but we couldn't email ${created.email}. Revoke it and try again in a few minutes.` : null);
      setInviteOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? (err.issues[0]?.path === "email" ? "Enter a valid email address." : err.message) : "We couldn't send the invitation. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function onRevoke() {
    if (!toRevoke) return;
    setPending(true);
    try {
      await api.revokeInvitation(toRevoke.id);
      setToRevoke(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Invitations</CardTitle>
          <CardDescription>Invitations expire after 7 days.</CardDescription>
        </div>
        {scopes.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setInviteOpen(true);
            }}
          >
            <MailPlus aria-hidden />
            Invite someone
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {notice ? <Alert tone="warning" title={notice} /> : null}
        {invitations.length === 0 ? (
          <p className="text-sm text-muted">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{inv.email}</span>
                  <span className="truncate text-xs text-muted">
                    {roleLabel(inv.role)} · {inv.entityName ?? "Whole organisation"} · {inv.status === "pending" ? `expires ${dateFmt.format(new Date(inv.expiresAt))}` : `sent ${dateFmt.format(new Date(inv.createdAt))}`}
                  </span>
                </div>
                <Badge tone={statusTone[inv.status]}>{inv.status[0]?.toUpperCase() + inv.status.slice(1)}</Badge>
                {inv.status === "pending" ? (
                  <Button variant="ghost" size="sm" onClick={() => setToRevoke(inv)}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link that works for 7 days.</DialogDescription>
          <form onSubmit={onInvite} className="grid gap-4" noValidate>
            {error ? <Alert tone="danger" title={error} /> : null}
            <Field id="invite-email" label="Email">
              <Input id="invite-email" name="email" type="email" autoComplete="off" required autoFocus />
            </Field>
            <Field id="invite-scope" label="Access to">
              <Select id="invite-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                {scopes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="invite-role" label="Role">
              <Select id="invite-role" name="role" key={scope}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </Select>
            </Field>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={toRevoke !== null} onOpenChange={(open) => (open ? null : setToRevoke(null))}>
        <DialogContent>
          <DialogTitle>Revoke this invitation?</DialogTitle>
          <DialogDescription>
            The link sent to <strong className="text-foreground">{toRevoke?.email}</strong> will stop working immediately. They won&apos;t be told. You can invite them
            again later.
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setToRevoke(null)}>
              Keep invitation
            </Button>
            <Button variant="danger" onClick={onRevoke} disabled={pending}>
              {pending ? "Revoking…" : "Revoke invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
