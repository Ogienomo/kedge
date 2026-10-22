import { resetTestDatabase } from "@kedge/db/testing";
import { webTestDatabaseUrl } from "./helpers";

export default async function setup(): Promise<void> {
  await resetTestDatabase(webTestDatabaseUrl());
}
