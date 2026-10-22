import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell/app-frame";
import { loadEntityOrgId } from "@/server/loaders";

export default async function EntityLayout({ children, params }: { children: ReactNode; params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  return (
    <AppFrame orgId={await loadEntityOrgId(entityId)} entityId={entityId}>
      {children}
    </AppFrame>
  );
}
