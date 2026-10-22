import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth-ui";
import { previewInvitation } from "@/server/services/invitations";
import { publicContext } from "@/server/page";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const preview = invite ? await previewInvitation(publicContext(), invite).catch(() => null) : null;
  const invitation = invite && preview?.status === "pending" ? { token: invite, email: preview.email, joining: preview.entityName ?? preview.organisationName } : null;

  return (
    <>
      <AuthHeading
        title={invitation ? `Join ${invitation.joining}` : "Create your account"}
        description={invitation ? "Create an account to accept your invitation." : "Start a 14-day free trial. No card needed."}
      />
      <SignupForm invitation={invitation} />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href={invitation ? `/login?next=${encodeURIComponent(`/invite/${invitation.token}`)}` : "/login"}>
          Log in
        </Link>
      </p>
    </>
  );
}
