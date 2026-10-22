import { resetTestDatabase, testDatabaseUrl } from "../testing";

export default async function setup(): Promise<void> {
  await resetTestDatabase(testDatabaseUrl());
}
