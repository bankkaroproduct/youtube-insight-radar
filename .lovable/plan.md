

## Goal

In the Full Report export:

1. **S6 — Contact Info**: include the scraped channel "More info" links (custom_links), not just URLs from the description, when populating the social-platform columns (Instagram / Facebook / Twitter / WhatsApp / etc.).
2. **S5 — Channel Deep Data**: classify each channel link's `Affiliate Used` and `Retailer` columns using the `affiliate_patterns` table (same way S2 / S3 video links are classified), instead of always showing blank/N/A.

## Changes — `src/services/excelExportService.ts`

### 1. Build an affiliate-domain map alongside the retailer map

Currently only `retailerByDomain` is built from `affiliate_patterns` (type='retailer'). Extend it in the same loop to also build `affiliateByDomain` from rows where `type='affiliate_platform'`.

```ts
const retailerByDomain = new Map<string, string>();
const affiliateByDomain = new Map<string, string>();
for (const p of patterns) {
  if (!p.is_confirmed) continue;
  const d = p.pattern.replace(/^www\./, "").toLowerCase();
  if (!d) continue;
  const t = (p.type || "").toLowerCase();
  if (t === "retailer") retailerByDomain.set(d, p.name);
  else if (t === "affiliate_platform") affiliateByDomain.set(d, p.name);
}
```

### 2. `buildSheet5` — classify channel links

- Accept `retailerByDomain` and `affiliateByDomain` as params.
- For each link's domain, look up affiliate-platform name and retailer name (exact match, then suffix match for subdomains).
- Populate `Affiliate Used` and `Retailer` columns with the matches (empty string if no match).
- Also **merge** scraped `custom_links` with description-extracted URLs (deduped) so links from either source appear in S5.

```ts
const affiliate = lookupByDomain(domain, affiliateByDomain);
const retailer  = lookupByDomain(domain, retailerByDomain);
rows.push([...base, `L${idx+1}`, header, url, "N/A", domain || "N/A",
           affiliate, retailer, social, excluded]);
```

Add a small helper `lookupByDomain(domain, map)` that handles exact + suffix match (so `shop.haulpack.com` still matches `haulpack.com`).

### 3. `buildSheet6` — pull socials from scraped links too

Replace the description-only URL list with a deduped union of `custom_links` URLs + description URLs. The `findSocial(["Instagram"])`, `findSocial(["Facebook"])`, etc. logic stays the same — it just now sees the scraped links as well, so a creator's "Instagram" link header (e.g. `instagram.com/username`) ends up in the **Instagram Link** column even when it isn't in the description text.

```ts
const scraped = (ch.custom_links || []).map(l => l.url).filter(Boolean);
const allUrls = [...new Set([...scraped, ...extractUrls(ch.description)])];
```

### 4. Wire it up

Pass the new maps to `buildSheet5` in `exportFullReport`.

## Files touched

- `src/services/excelExportService.ts` (only this file)

No DB migration, no edge-function changes, no UI changes.

## Acceptance

- S5 rows with a link domain matching a confirmed retailer in `affiliate_patterns` show the retailer name in **Retailer**.
- S5 rows with a link domain matching a confirmed affiliate platform show its name in **Affiliate Used**.
- S6 Instagram / Facebook / Twitter / WhatsApp / Telegram / Snapchat / LinkedIn / YouTube columns get populated from scraped channel links when those URLs aren't in the description.

