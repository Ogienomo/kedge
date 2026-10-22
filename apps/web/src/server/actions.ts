"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { CURRENT_ORG_COOKIE } from "./page";

/** Remembers which organisation the user is working in. UI state only: access is checked on every request. */
export async function selectOrganisation(orgId: string): Promise<void> {
  const id = z.uuid().parse(orgId);
  (await cookies()).set(CURRENT_ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
