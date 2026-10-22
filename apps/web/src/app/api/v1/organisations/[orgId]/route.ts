import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const GET = toRoute(endpoints.getOrganisation);
export const PATCH = toRoute(endpoints.updateOrganisation);
