import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  manifest: {
    name: "Source-Trace",
    description:
      "Coaches you to trace the claims in AI answers — shows which have visible sourcing, never declares truth.",
    // Minimal host_permissions: only the supported AI sites + the API origin (§8).
    host_permissions: [
      "https://www.perplexity.ai/*",
      "https://perplexity.ai/*",
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
    ],
    permissions: ["storage"],
    // Strict CSP; no remote code (ADR-4: remote *config*, not code). No eval.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
