import { relative } from "node:path";

/**
 * A Rolldown module id as a package name, or as a path relative to `repoRoot`
 * for the repo's own code. `check-precache.mjs` matches its admin-only list
 * against these names, so a wrong one there silently matches nothing (GH #95).
 */
export function chunkModuleName(id: string, repoRoot: string): string {
  const path = id.replace(/^\0/, "").split("?")[0] ?? id;
  const at = path.lastIndexOf("/node_modules/");
  if (at !== -1) {
    const segments = path.slice(at + "/node_modules/".length).split("/");
    return segments.slice(0, segments[0]?.startsWith("@") ? 2 : 1).join("/");
  }
  const root = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
  // A virtual module (the PWA register, Vite's preload helper) keeps its id.
  return path.startsWith(root) ? relative(root, path) : path;
}
