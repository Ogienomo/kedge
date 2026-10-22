import type { Role } from "../permissions/roles";

export const DISPLAY_MODES = ["simple", "accountant"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

/**
 * Default display mode per role (SPEC §3.4): Simple for client roles,
 * Accountant for firm roles. Mode changes presentation only, never permissions.
 */
export function defaultDisplayMode(role: Role): DisplayMode {
  switch (role) {
    case "client_owner":
    case "client_staff":
    case "viewer":
      return "simple";
    case "org_owner":
    case "org_admin":
    case "accountant":
    case "bookkeeper":
      return "accountant";
    default: {
      const unreachable: never = role;
      return unreachable;
    }
  }
}
