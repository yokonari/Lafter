import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".open-next/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
      "update_artists.js",
    ],
  },
  {
    rules: {
      // 既存UIの状態同期は別改修で段階的にReact Compiler対応します。
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];
