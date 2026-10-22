import { Logo } from "@kedge/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { pageContext } from "@/server/page";
import { getMe } from "@/server/services/me";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

/** Sign-up step 2: the first visit after email confirmation creates the organisation. */
export default async function WelcomePage() {
  const ctx = await pageContext();
  const me = await getMe(ctx);
  if (me.organisations.length > 0) redirect("/");

  const { data } = await (await supabaseServer()).auth.getUser();
  const meta = data.user?.user_metadata ?? {};
  const kind = meta.signup_kind === "firm" ? "firm" : "business";
  const name = typeof meta.org_name === "string" ? meta.org_name : "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
      <Logo />
      <div className="flex flex-1 flex-col justify-center py-10">
        <WelcomeForm defaultKind={kind} defaultName={name} firstName={me.user.fullName?.split(" ")[0] ?? null} />
      </div>
    </main>
  );
}
