import { roleLabel } from "@kedge/core";
import { APP_NAME } from "@kedge/config";
import { Alert, Button, Card, CardContent, Logo } from "@kedge/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer, verifiedClaims } from "@/lib/supabase/server";
import { publicContext } from "@/server/page";
import { previewInvitation } from "@/server/services/invitations";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvitation(publicContext(), token).catch(() => null);
  const claims = await verifiedClaims(await supabaseServer());
  const here = `/invite/${token}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
      <Logo />
      <div className="flex flex-1 flex-col justify-center py-10">
        {!preview ? (
          <Alert tone="danger" title="This invitation link isn't valid">
            Check that you copied the whole link, or ask the person who invited you to send a new one.
          </Alert>
        ) : preview.status !== "pending" ? (
          <Alert tone="warning" title={preview.status === "accepted" ? "This invitation has already been used" : preview.status === "revoked" ? "This invitation was withdrawn" : "This invitation has expired"}>
            {preview.status === "accepted" ? <Link href="/login">Log in to continue.</Link> : "Ask the person who invited you to send a new one."}
          </Alert>
        ) : (
          <Card>
            <CardContent className="grid gap-5">
              <div className="grid gap-1.5">
                <p className="text-sm text-muted">You&apos;re invited to join</p>
                <h1 className="text-2xl font-semibold tracking-tight">{preview.entityName ?? preview.organisationName}</h1>
                {preview.entityName ? <p className="text-sm text-muted">Managed by {preview.organisationName}</p> : null}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Role</dt>
                <dd className="font-medium">{roleLabel(preview.role)}</dd>
                <dt className="text-muted">For</dt>
                <dd className="font-medium break-all">{preview.email}</dd>
              </dl>
              {claims && claims.email === preview.email ? (
                <AcceptButton token={token} />
              ) : claims ? (
                <Alert tone="warning" title={`You're logged in as ${claims.email}`}>
                  This invitation is for {preview.email}.{" "}
                  <form action="/auth/signout" method="post" className="inline">
                    <button type="submit" className="font-medium text-primary hover:underline">
                      Log out
                    </button>
                  </form>{" "}
                  and sign in with that address.
                </Alert>
              ) : (
                <div className="grid gap-2">
                  <Button asChild size="lg">
                    <Link href={`/signup?invite=${encodeURIComponent(token)}`}>Create an account</Link>
                  </Button>
                  <Button asChild variant="secondary" size="lg">
                    <Link href={`/login?next=${encodeURIComponent(here)}`}>I already use {APP_NAME}</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
