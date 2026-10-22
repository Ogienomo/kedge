import type { ReactNode } from "react";
import { loadMe, loadOrg } from "@/server/loaders";
import { AppShell } from "./app-shell";

/** Loads what the shell needs for one org and renders it around the page. */
export async function AppFrame({ orgId, entityId, children }: { orgId: string; entityId: string | null; children: ReactNode }) {
  const [me, org] = await Promise.all([loadMe(), loadOrg(orgId)]);
  return <AppShell data={{ me, org, entityId }}>{children}</AppShell>;
}
