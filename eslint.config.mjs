import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/state/**", "@/state/**"], message: "engine/ must not import from state/" },
          { group: ["**/map/**", "@/map/**"], message: "engine/ must not import from map/" },
          { group: ["**/components/**", "@/components/**"], message: "engine/ must not import from components/" },
          { group: ["react", "react-dom"], message: "engine/ must not import React" },
        ],
      }],
    },
  },
  {
    files: ["src/worker/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/components/**", "@/components/**"], message: "worker/ must not import from components/" },
          { group: ["**/map/**", "@/map/**"], message: "worker/ must not import from map/" },
          { group: ["react", "react-dom"], message: "worker/ must not import React" },
        ],
      }],
    },
  },
  {
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/map/**", "@/map/**"], message: "components/ must not import from map/ directly; use state/ stores" },
        ],
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
