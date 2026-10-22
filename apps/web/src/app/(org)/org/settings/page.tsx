import { PermissionDeniedError, roleLabel, type OrgRole } from "@kedge/core";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@kedge/ui";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { loadContext, loadCurrentOrgId, loadOrg } from "@/server/loaders";
import { invitationOptions, listInvitations } from "@/server/services/invitations";
import { listMembers } from "@/server/services/organisations";
import { InvitationsPanel } from "./invitations-panel";

export const metadata: Metadata = { title: "Team and organisation" };

const roleTone: Record<OrgRole, "primary" | "neutral"> = { org_owner: "primary", org_admin: "neutral", accountant: "neutral", bookkeeper: "neutral" };

export default async function OrgSettingsPage() {
  const ctx = await loadContext();
  const orgId = await loadCurrentOrgId();
  const org = await loadOrg(orgId);
  const [members, invitations, options] = await Promise.all([
    listMembers(ctx, orgId).catch((e: unknown) => {
      if (e instanceof PermissionDeniedError) return null;
      throw e;
    }),
    listInvitations(ctx, orgId),
    invitationOptions(ctx, orgId),
  ]);
  const canInvite = options.organisation.length > 0 || options.entities.length > 0;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title="Team and organisation" description={org.organisation.name} />

      {members ? (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>People in {org.organisation.name}. Client users invited to a single business are listed with that business.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {members.members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">{m.fullName ?? m.email}</span>
                    {m.fullName ? <span className="truncate text-xs text-muted">{m.email}</span> : null}
                  </div>
                  {m.status === "suspended" ? <Badge tone="warning">Suspended</Badge> : null}
                  <Badge tone={roleTone[m.role]}>{roleLabel(m.role)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canInvite || invitations.invitations.length > 0 ? (
        <InvitationsPanel orgId={orgId} options={options} invitations={invitations.invitations} />
      ) : !members ? (
        <EmptyState icon={<Users />} title="Nothing to manage here" description="Your access is managed by the people who invited you." />
      ) : null}
    </div>
  );
}
