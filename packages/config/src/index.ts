/**
 * Product-wide constants. The product name must only ever come from APP_NAME.
 */
export const APP_NAME = "Kedge";

/** Default timezone for entities (SPEC §5.1). */
export const DEFAULT_TIMEZONE = "Africa/Lagos";

/** Default functional currency (SPEC §4.6). */
export const DEFAULT_CURRENCY = "NGN";

/** Locale used for number, date and currency formatting (SPEC §12). */
export const DEFAULT_LOCALE = "en-NG";

/** Invitations expire after this many days (SPEC §3.5). */
export const INVITATION_TTL_DAYS = 7;

/** Maximum upload size in bytes (SPEC §7.1). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
