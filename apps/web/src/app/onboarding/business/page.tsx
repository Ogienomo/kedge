import { Logo } from "@kedge/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { loadCurrentOrgId, loadOrg, todayInLagos } from "@/server/loaders";

export const metadata: Metadata = { title: "Set up your business" };

/** SPEC §6.2: business set-up wizard. */
export default async function BusinessOnboardingPage() {
  const orgId = await loadCurrentOrgId();
  const org = await loadOrg(orgId);
  if (!org.orgPermissions.includes("entity.create")) redirect("/");
  return (
    <div className="min-h-dvh px-4 py-6 sm:px-6">
      <header className="mx-auto mb-8 flex w-full max-w-2xl items-center justify-between">
        <Link href="/" className="rounded-md">
          <Logo />
        </Link>
        <span className="truncate text-sm text-muted">{org.organisation.name}</span>
      </header>
      <SetupWizard orgId={orgId} today={todayInLagos()} defaults={{ legalName: org.entities.length === 0 && org.organisation.kind === "business" ? org.organisation.name : "" }} />
    </div>
  );
}
