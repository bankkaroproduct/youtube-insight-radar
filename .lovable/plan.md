

# Simplify Domains Column in Videos CSV

## What
Change the "Domains" column in the CSV export to show only unique domain names (e.g., `meesho.com; amazon.com`) instead of the current labeled format (`meesho.com - Meesho Retailer`).

## How

**File: `src/pages/Videos.tsx`** — lines 111-123

Replace the current domain labeling logic with simple domain collection:

```typescript
const domainSet = new Set<string>();
for (const link of v.links) {
  const domain = link.domain || link.original_domain;
  if (domain) domainSet.add(domain);
}
```

Then on line 135, output `[...domainSet].join("; ")`.

This removes classification labels and just lists each unique domain once per video.

