# Free-tier budget

Limits change. **Re-verify on the vendors' pricing pages before relying on them**, and update the "checked" date.

| Service | Free limit (as understood) | Our expected usage | Headroom |
|---|---|---|---|
| Workers requests | 100,000 / day | ~2 agents × ~200 syncs + admin polling ~2,000 ≈ 3,000 / day | ~30× |
| D1 storage | 5 GB | < 50 MB in year one | large |
| D1 rows read | 5 M / day | low tens of thousands | large |
| D1 rows written | 100 k / day | imports up to a few thousand; visits ~100 | large |
| Cloudflare Access | Free Zero Trust plan, seat-capped | 3–4 users | large |
| Overpass API | Public, fair-use | a few queries per week, cached 7 days | fine if cached |
| OSM tiles | Public, fair-use, attribution required | light admin use | fine |
| GitHub Actions | Free minutes for private repos | a few minutes per PR | fine |

Checked: 2026-09-21 (from public sources, to be confirmed on official pricing pages).

## Watch-outs
- A bug that loops syncs could burn request quota: the client backs off exponentially on errors.
- Row reads count scanned rows: keep the indexes in [data-model.md](data-model.md) and avoid unindexed filters.
