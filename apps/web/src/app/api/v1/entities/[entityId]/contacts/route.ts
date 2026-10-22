import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const GET = toRoute(endpoints.listContacts);
export const POST = toRoute(endpoints.createContact);
