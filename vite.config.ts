import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
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
        // on purpose. Asserted in src/client/sw.test.ts.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
});
