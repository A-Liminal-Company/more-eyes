import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The MCP subpackage's compiled output and vendored deps. Its source
    // (mcp-server/src) stays linted.
    "mcp-server/dist/**",
    "mcp-server/node_modules/**",
    // Same for the GitHub Action subpackage: ncc's bundled dist is committed
    // per Actions convention, but its source (action/src) stays linted.
    "action/dist/**",
    "action/node_modules/**",
  ]),
]);

export default eslintConfig;
