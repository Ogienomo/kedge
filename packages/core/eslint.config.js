import base from "@kedge/config/eslint";

export default [
  ...base,
  {
    // packages/core is pure domain logic: no framework, DB or network imports.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@kedge/*", "!@kedge/config"], message: "packages/core must not depend on other workspace packages." },
            { group: ["next", "next/*", "react", "react-*", "drizzle-orm", "drizzle-orm/*", "postgres", "@supabase/*", "@anthropic-ai/*"], message: "packages/core is pure: no framework, DB or network imports." },
          ],
        },
      ],
    },
  },
];
