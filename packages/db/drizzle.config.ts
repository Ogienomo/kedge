import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  // auth.* belongs to Supabase; RLS policies, functions and triggers live in custom migrations.
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
