import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const GET = toRoute(endpoints.listInvitations);
export const POST = toRoute(endpoints.createInvitation);
