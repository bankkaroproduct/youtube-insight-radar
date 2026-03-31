

# Fix Pattern Visibility, Type Normalization & Dynamic Lookup

## Root Causes Found

### 1. Case mismatch — patterns not showing in tabs
The DB stores `type` as `"Retailer"` (capital R) but `useAffiliatePatterns.ts` filters with `p.type === "retailer"` (lowercase). Result: all retailer patterns appear in neither tab. Same risk for `"Affiliate Platform"` vs `"affiliate_platform"`.

### 2. Missing `name` in edge function select
`process-video-links` line 127 selects `id, pattern, classification, is_confirmed, type` but NOT `name`. Lines 135/138 reference `p.name` to build dynamic lookup maps — this is always `undefined`, so user-added patterns are never used for text column population.

### 3. Bulk upload doesn't normalize type values
If CSV contains "Retailer" instead of "retailer", it's stored as-is. No normalization happens.

## Changes

### 1. `src/hooks/useAffiliatePatterns.ts` — Case-insensitive filtering
Change the filtering to use `.toLowerCase()`:
```
const platformPatterns = confirmedPatterns.filter(p => p.type?.toLowerCase() === "affiliate_platform");
const retailerPatterns = confirmedPatterns.filter(p => p.type?.toLowerCase() === "retailer");
```

### 2. `supabase/functions/process-video-links/index.ts` — Add `name` to select + fix dynamic maps
- Line 127: Add `name` to the select: `"id, pattern, name, classification, is_confirmed, type"`
- Add `name` to the `Pattern` interface
- Fix dynamic map building to use case-insensitive type comparison

### 3. `src/components/links/BulkUploadDialog.tsx` — Normalize type
In `parseCSVContent`, normalize the type column:
```
const rawType = (parts[3] || "").trim().toLowerCase();
const type: PatternType = rawType === "affiliate_platform" || rawType === "platform" 
  ? "affiliate_platform" : defaultType === "affiliate_platform" ? "affiliate_platform" : "retailer";
```

### 4. `src/pages/Links.tsx` — Case-insensitive type badge
The PatternTable type badge check `p.type === "retailer"` should also be case-insensitive.

### 5. Data fix migration — Normalize existing type values
Run a migration to standardize all existing `type` values to lowercase:
```sql
UPDATE affiliate_patterns SET type = 'retailer' WHERE lower(type) = 'retailer' AND type != 'retailer';
UPDATE affiliate_patterns SET type = 'affiliate_platform' WHERE lower(type) IN ('affiliate_platform', 'platform', 'affiliate platform') AND type != 'affiliate_platform';
```

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Normalize existing type values to lowercase |
| `src/hooks/useAffiliatePatterns.ts` | Case-insensitive type filtering |
| `src/pages/Links.tsx` | Case-insensitive type badge display |
| `src/components/links/BulkUploadDialog.tsx` | Normalize type in CSV parsing |
| `process-video-links/index.ts` | Add `name` to select + Pattern interface, fix dynamic map building |

