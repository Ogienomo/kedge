import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const PUT = toRoute(endpoints.updateEntityPreferences);
