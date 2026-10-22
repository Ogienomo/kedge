import { Logo } from "@kedge/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadContext, loadCurrentOrgId, loadOrg, todayInLagos } from "@/server/loaders";
import { invitationOptions, listInvitations } from "@/server/services/invitations";
import { FirmWizard } from "./firm-wizard";

export const metadata: Metadata = { title: "Set up your firm" };

/** SPEC §6.2: firm set-up wizard (details and branding, first client, team). */
export default async function FirmOnboardingPage() {
  const ctx = await loadContext();
  const orgId = await loadCurrentOrgId();
  const org = await loadOrg(orgId);
  if (org.organisation.kind !== "firm" || !org.orgPermissions.includes("org.users.manage")) redirect("/");
  const [options, { invitations }] = await Promise.all([invitationOptions(ctx, orgId), listInvitations(ctx, orgId)]);
  return (
    <div className="min-h-dvh px-4 py-6 sm:px-6">
      <header className="mx-auto mb-8 flex w-full max-w-2xl items-center justify-between">
        <Link href="/" className="rounded-md">
          <Logo />
        </Link>
        <Link href="/practice" className="text-sm text-muted underline-offset-4 hover:underline">
          Skip set-up
        </Link>
      </header>
      <FirmWizard
        orgId={orgId}
        name={org.organisation.name}
        brandColour={org.organisation.brandColour}
        canCreate={org.orgPermissions.includes("entity.create")}
        today={todayInLagos()}
        options={options}
        invitations={invitations}
      />
    </div>
  );
}
