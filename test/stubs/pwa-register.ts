/**
 * Stand-in for `virtual:pwa-register/react`, which only exists when VitePWA is
 * in the pipeline. Vitest is not, so anything importing `src/client/pwa.ts` —
 * which is `App.tsx`, and therefore every routing test — would fail to
 * resolve without this. Aliased in the `dom` project only (vitest.config.ts).
 *
 * The annotation is the point: it is the real module's own type (the alias is
 * a vitest-only resolution, so tsc still reads vite-plugin-pwa's declaration
 * here), so a plugin release that changes this signature is a compile error
 * rather than a stub that silently no longer matches what `usePwa` destructures.
 *
 * It registers nothing and its options are dropped. A test that needs a new
 * build waiting mocks this module and says so there (`App.test.tsx`).
 */
import type * as PwaRegister from "virtual:pwa-register/react";

export const useRegisterSW: typeof PwaRegister.useRegisterSW = () => ({
  needRefresh: [false, () => {}],
  offlineReady: [false, () => {}],
  updateServiceWorker: async () => {},
});
