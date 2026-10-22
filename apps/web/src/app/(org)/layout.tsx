import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell/app-frame";
import { loadCurrentOrgId } from "@/server/loaders";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame orgId={await loadCurrentOrgId()} entityId={null}>
      {children}
    </AppFrame>
  );
}
