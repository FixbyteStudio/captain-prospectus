/**
 * Row → wire mappers shared by more than one route file.
 *
 * A mapper lives here once two routes need it. `toWireScript` is used by the
 * agent sync pull and by `GET /api/admin/scripts`, which must not be able to
 * disagree about what a script looks like on the wire.
 */
import type { Script } from "../../shared/schemas";
import type { ScriptRow } from "../db/schema";

export function toWireScript(row: ScriptRow): Script {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    // Stored as JSON; the shape is guaranteed by scriptCreateSchema on write.
    questions: row.questions as Script["questions"],
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}
