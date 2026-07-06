import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  manifest: {
    name: "Source-Trace",
    description:
      "Coaches you to trace the claims in AI answers — shows which have visible sourcing, never declares truth.",
    icons: {
      16: "/icons/icon-16.png",
      32: "/icons/icon-32.png",
      48: "/icons/icon-48.png",
      128: "/icons/icon-128.png",
    },
    action: {
      default_icon: { 16: "/icons/icon-16.png", 32: "/icons/icon-32.png" },
      default_title: "Source-Trace",
    },
    // Minimal host_permissions: only the supported AI sites + the API origin (§8).
    host_permissions: [
      "https://www.perplexity.ai/*",
      "https://perplexity.ai/*",
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
    ],
    permissions: ["storage"],
    // Self-hosted brand fonts, exposed to the content-script overlay on the AI sites
    // (loaded via the FontFace API — no external CDN, consistent with the privacy path).
    web_accessible_resources: [
      {
        resources: ["fonts/*.woff2"],
        matches: [
          "*://*.perplexity.ai/*",
          "*://perplexity.ai/*",
          "*://chatgpt.com/*",
          "*://chat.openai.com/*",
        ],
      },
    ],
    // Strict CSP; no remote code (ADR-4: remote *config*, not code). No eval.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
