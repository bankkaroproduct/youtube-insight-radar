

## Understanding the request

In your screenshot, YouTube's "More info" → "Links" panel shows:
- **Instagram** → `instagram.com/mee_praveena_vlogs?igshid=...`
- **Haulpack** → `haulpack.com/c/praveena`

Each link has a **custom header name** the creator set (e.g. "Haulpack"). You want these in S5 Channel Deep Data, classified as L1, L2, etc.

## Current state

S5 already extracts URLs from the channel **description text** and labels them L1, L2…  but it's missing two things:
1. The **custom header name** ("Instagram", "Haulpack") that the creator set in the YouTube "Links" section.
2. Links that appear **only** in the YouTube "Links" panel and not in the description.

## The challenge

YouTube Data API v3 **does not expose** the "Links" panel data (header + URL pairs) — that section is rendered from data only available by scraping the channel "About" page (`/about` or `/@handle`). This means:

- **API-only path (free)**: We can only use what's already in the description — no custom header names, just the URL itself. We can *infer* a label from the domain (e.g. `instagram.com` → "Instagram", `haulpack.com` → "Haulpack").
- **Scraping path (more accurate, slower)**: Add an edge function that fetches `https://www.youtube.com/channel/{id}/about` and parses out the Links section with their custom headers. Slower (1 HTTP request per channel), occasionally blocked, but matches exactly what you see in the screenshot.

## Recommended approach (two questions before I plan in detail)

Before writing the plan, I need to clarify:

**Q1 — Header source**: Do you want exact creator-set headers ("Haulpack", "My Store") which require scraping the YouTube About page, OR is auto-inferred labels from the domain ("Instagram", "Haulpack" derived from `haulpack.com`) good enough?

**Q2 — Sheet shape**: Should each link be its own row (current pattern: one channel spans N rows, one per L1/L2/L3…) with a new "Link Header" column? Or should links be flattened into wide columns (`L1 Header | L1 URL | L2 Header | L2 URL …`) on a single row per channel?

Once you answer these, I'll write the implementation plan.

