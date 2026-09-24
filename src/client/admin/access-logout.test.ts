import { describe, expect, it } from "vitest";
import { ACCESS_PATH_PATTERN, LOGOUT_PATH } from "./access-logout";

describe("ACCESS_PATH_PATTERN", () => {
  it("matches LOGOUT_PATH — what ties the two together", () => {
    expect(ACCESS_PATH_PATTERN.test(LOGOUT_PATH)).toBe(true);
  });

  it("matches only the /cdn-cgi/ prefix, not a look-alike", () => {
    expect(ACCESS_PATH_PATTERN.test("/cdn-cgi/access/logout")).toBe(true);
    expect(ACCESS_PATH_PATTERN.test("/api/cdn-cgi/access/logout")).toBe(false);
    expect(ACCESS_PATH_PATTERN.test("/cdn-cgix/access/logout")).toBe(false);
  });
});
