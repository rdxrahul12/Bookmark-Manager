import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// Vite config: code-splits vendor chunks, drops console/debugger in prod,
// supports both new-tab Chrome extension (relative base) and static deploy.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const analyze = env.ANALYZE === "true";

  return {
    base: "./",
    server: {
      host: "::",
      port: 8080,
      strictPort: false,
      hmr: { overlay: false },
    },
    plugins: [
      react(),
      analyze &&
        visualizer({
          filename: "dist/stats.html",
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
    },
    esbuild: {
      // Drop console.log + debugger from production bundles. Vitest sets mode=test.
      drop: mode === "production" ? ["console", "debugger"] : [],
      legalComments: "none",
    },
    build: {
      target: "es2022",
      cssTarget: "chrome108",
      sourcemap: mode !== "production",
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Manual chunks keep heavy, infrequently-changing vendor code
          // out of the main bundle so the new-tab page paints faster.
          // Group vendor code by domain so the new-tab paint only needs the
          // React core + app shell. Heavy decorative libs (motion, dnd, radix,
          // calendar) are split off and lazy-loaded with the modals that use
          // them. Order matters — first match wins.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("@dnd-kit")) return "vendor-dnd";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("react-day-picker") || id.includes("date-fns")) {
              return "vendor-calendar";
            }
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("zustand") || id.includes("zod")) return "vendor-state";
            // Everything else (react, react-dom, scheduler, react-router,
            // clsx, tailwind-merge, class-variance-authority, etc.) lands in
            // the same chunk so we never trip a circular-chunk warning.
            return "vendor-core";
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
