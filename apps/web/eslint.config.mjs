import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Never use floating point for money. Use Money from @kedge/core." }],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='toFixed']", message: "Never format money with toFixed; use formatMoney from @kedge/core (rule 4)." },
      ],
    },
  },
  {
    // Route handlers and pages must not hand-roll role checks: use can() from @kedge/core.
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator=/^[!=]==$/] > Literal[value=/^(org_owner|org_admin|accountant|bookkeeper|client_owner|client_staff|viewer)$/]",
          message: "Do not compare roles directly. Check permissions with can() from @kedge/core.",
        },
        // Repeated here because this block replaces the rule's options for src/app.
        { selector: "CallExpression[callee.property.name='toFixed']", message: "Never format money with toFixed; use formatMoney from @kedge/core (rule 4)." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", ".dev-outbox/**"]),
]);
