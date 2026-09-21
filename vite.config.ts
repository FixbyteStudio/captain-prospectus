import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // shadcn generates imports as "@/ui/button". The alias is mirrored in
  // tsconfig.client.json; both are needed, Vite resolves and tsc typechecks.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Captain Prospectus",
        short_name: "Prospectus",
        description: "Tournées de prospection terrain",
        lang: "fr",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1f6f4a",
        icons: [],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // INVARIANT 8: the service worker never caches /api/*.
        // A cached sync response would show an agent a stale today list, or
        // worse, make a failed sync look successful. navigateFallbackDenylist
        // keeps /api out of the SPA fallback; there are no runtimeCaching rules
        // on purpose. Asserted in config.test.ts.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
});
