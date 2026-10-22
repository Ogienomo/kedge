import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const PATCH = toRoute(endpoints.updateContact);
