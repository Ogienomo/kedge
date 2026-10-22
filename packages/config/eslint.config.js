// Shared flat ESLint config for every package in the monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "**/*.config.*"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Money must never be floating point (CLAUDE.md rule 4).
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Never use floating point for money. Use Money from @kedge/core." }],
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Never use floating point for money. Use Money from @kedge/core." },
      ],
    },
  },
);
