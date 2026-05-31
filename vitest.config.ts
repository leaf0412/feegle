import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@core": new URL("./src/core", import.meta.url).pathname,
      "@infra": new URL("./src/infra", import.meta.url).pathname,
      "@platform": new URL("./src/platform", import.meta.url).pathname,
      "@plugins": new URL("./src/plugins", import.meta.url).pathname,
      "@integrations": new URL("./src/integrations", import.meta.url).pathname,
      "@features": new URL("./src/features", import.meta.url).pathname,
      "@resources": new URL("./src/resources", import.meta.url).pathname,
      "@domain": new URL("./src/domain", import.meta.url).pathname,
      "@tests": new URL("./tests", import.meta.url).pathname
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
