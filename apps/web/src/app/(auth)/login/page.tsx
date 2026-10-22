import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, safeNext } from "@/components/auth-ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <AuthHeading title="Welcome back" description="Log in to your books." />
      <LoginForm next={safeNext(next)} linkError={error === "link"} />
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link className="font-medium text-primary hover:underline" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
          Create an account
        </Link>
      </p>
    </>
  );
}
