"use client";

import { Button } from "@kedge/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OpeningBalancesForm } from "@/components/onboarding/opening-balances-form";

export function OpeningBalancesSection({ entityId, goLiveDate, simple, alreadyPosted }: { entityId: string; goLiveDate: string; simple: boolean; alreadyPosted: boolean }) {
  const router = useRouter();
  if (alreadyPosted) {
    return (
      <Button asChild variant="secondary">
        <Link href={`/e/${entityId}/journals/new`}>New journal</Link>
      </Button>
    );
  }
  return <OpeningBalancesForm entityId={entityId} goLiveDate={goLiveDate} simple={simple} onDone={() => router.refresh()} />;
}
