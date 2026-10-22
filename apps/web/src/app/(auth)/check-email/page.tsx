import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { ResendButton } from "./resend-button";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="grid gap-5">
      <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <MailCheck aria-hidden className="size-6" />
      </div>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted">
          We sent a confirmation link to {email ? <strong className="text-foreground">{email}</strong> : "your email address"}. Open it on this device to finish
          setting up your account.
        </p>
      </div>
      {email ? <ResendButton email={email} /> : null}
    </div>
  );
}
