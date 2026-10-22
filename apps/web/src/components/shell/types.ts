import type { MeResponse, OrganisationContext } from "@kedge/api";

export interface ShellData {
  readonly me: MeResponse;
  readonly org: OrganisationContext;
  /** The entity the current page is about, if any. */
  readonly entityId: string | null;
}
