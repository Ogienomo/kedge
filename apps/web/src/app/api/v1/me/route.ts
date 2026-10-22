import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const GET = toRoute(endpoints.getMe);
export const PATCH = toRoute(endpoints.updateMe);
