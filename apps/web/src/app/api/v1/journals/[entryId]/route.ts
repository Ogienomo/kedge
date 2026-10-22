import { endpoints } from "@/server/api/endpoints";
import { toRoute } from "@/server/api/next";

export const GET = toRoute(endpoints.getJournal);
export const PUT = toRoute(endpoints.updateJournalDraft);
export const DELETE = toRoute(endpoints.deleteJournalDraft);
