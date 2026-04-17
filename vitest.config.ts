import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    env: {
      // Pattern: patterns/testing.md:26 — Test-Env nach Config-Perf-Bump
      // sofort nachziehen, sonst CI-Timeouts. cost 12 hash taken ~400ms
      // und verliert gegen 150ms-Timer in `auth.test.ts:151`.
      // Wir nehmen 5 (nicht 4 = BCRYPT_ROUNDS_MIN): die rehash-tests
      // benötigen einen Legacy-Hash mit cost < target, und die Legacy-
      // Hashes in den Tests sind auf cost 4 fix kodiert — mit target=4
      // würde `shouldRehash(4, 4)` false und der Rehash-Branch schiefe
      // nie feuern. cost 5 gibt ein Delta und bleibt <10ms pro hash.
      BCRYPT_ROUNDS: "5",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts"],
      reporter: ["text", "html"],
    },
  },
});
