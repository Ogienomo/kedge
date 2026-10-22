import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { loadMe } from "@/server/loaders";
import { MfaSection } from "./mfa-section";
import { PasswordForm, ProfileForm, SessionsSection } from "./account-forms";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await loadMe();
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="My account" description={me.user.email} />
      <ProfileForm fullName={me.user.fullName} />
      <MfaSection enabled={me.user.mfaEnabled} />
      <PasswordForm />
      <SessionsSection />
    </div>
  );
}
