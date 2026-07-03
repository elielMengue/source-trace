import { defineConfig } from "vitest/config";

// happy-dom gives extract.ts a real DOM (querySelector/childNodes/matches) to walk.
// All cross-package imports in the units under test are type-only, so no path aliases
// are needed — esbuild strips them at transform time.
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "entrypoints/**/*.test.ts"],
  },
});
