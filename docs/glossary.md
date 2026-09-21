# Glossary

Use these words in code, UI and docs. One concept, one name.

| Term | Meaning | Not |
|---|---|---|
| **Prospect** | A business we want to canvass (restaurant, café, food truck…) | lead, venue, entity |
| **Agent** | Field person doing visits | rep, user, worker |
| **Admin** | Person who imports, assigns, configures scripts | manager |
| **Visit** | One physical attempt at a prospect. A revisit is a new visit | check-in (that's the action) |
| **Outcome** | Result of a visit: `no_contact`, `interested`, `not_interested`, `follow_up`, `converted` | result |
| **Status** | Lifecycle of a prospect: `new`, `assigned`, `follow_up`, `converted`, `rejected` | state |
| **Script** | Versioned list of questions an agent asks during a visit | survey, form |
| **Answers** | Responses to a script, stored on the visit | |
| **Import** | Bulk creation of prospects from CSV or map | upload |
| **Map import** | Import from an OpenStreetMap area via Overpass | scrape |
| **Field prospect** | Prospect created by an agent on the ground (`source = field`) | |
| **Sync** | One request that pushes pending local writes and pulls the agent's list | |
| **Dedupe key** | Stable key that makes re-imports update instead of duplicate | |
| **Today list** | The agent's open prospects, ordered by distance | route |
