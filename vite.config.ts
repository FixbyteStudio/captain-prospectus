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
        // The logo's own field, so the splash and the mark share a white.
        background_color: "#f6f7f0",
        // The band colour: it tints Android's status bar around the icon.
        theme_color: "#1b2a4a",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          // Android crops this one to a circle or squircle of its choosing.
          // Without a maskable entry it crops a normal icon instead and clips
          // the wheel's handles.
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // ADR-0019: precache the field app only. `AdminApp-*.js` is ~299 kB of
        // TanStack Query, Radix, sonner, PapaParse and (from M4) Leaflet that a
        // phone can never open — App.tsx refuses to render /admin/* from a
        // cached identity, so precaching it bought nothing. Vite emits the whole
        // admin side as this one chunk, so one glob is the whole rule; a NEW
        // admin-only chunk would need adding here. Asserted in config.test.ts.
        globIgnores: ["**/assets/AdminApp-*.js"],
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
