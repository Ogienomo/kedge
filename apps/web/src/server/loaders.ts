import { DEFAULT_TIMEZONE } from "@kedge/config";
import { dateInTimezone, NotFoundError } from "@kedge/core";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { pageContext, currentOrgId } from "./page";
import { orgOfVisibleEntity } from "./services/entities";
import { getEntityDetail } from "./services/ledger/setup";
import { getMe } from "./services/me";
import { getOrganisationContext } from "./services/organisations";

/** Per-request memoised loaders for server components (layout and page share one query). */
export const loadContext = cache(pageContext);

export const loadMe = cache(async () => getMe(await loadContext()));

export const loadOrg = cache(async (orgId: string) => {
  try {
    return await getOrganisationContext(await loadContext(), orgId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});

/** The org the user is working in: the remembered one if still accessible, else their first. */
export const loadCurrentOrgId = cache(async (): Promise<string> => {
  const me = await loadMe();
  const remembered = await currentOrgId();
  const chosen = me.organisations.find((o) => o.id === remembered) ?? me.organisations[0];
  if (!chosen) redirect("/welcome");
  return chosen.id;
});

export const loadEntityOrgId = cache(async (entityId: string): Promise<string> => {
  const orgId = await orgOfVisibleEntity(await loadContext(), entityId);
  if (!orgId) notFound();
  return orgId;
});

export const loadEntityDetail = cache(async (entityId: string) => {
  try {
    return await getEntityDetail(await loadContext(), entityId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});

/** Today's date in Africa/Lagos, for defaults in forms (rule 11). */
export function todayInLagos(): string {
  return dateInTimezone(new Date(), DEFAULT_TIMEZONE);
}
