

# Fix Discovered Patterns + Add Bulk Upload

## Root Cause: Why Discovered Patterns Don't Work

The `process-video-links` edge function uses `upsert` with `onConflict: "pattern"` but **there is no unique constraint on the `pattern` column** in `affiliate_patterns`. This causes the upsert to fail silently, so no auto-discovered patterns are ever created.

**Fix**: Add a unique index on `affiliate_patterns.pattern`.

## Changes

### 1. Migration — Add unique constraint
Add `CREATE UNIQUE INDEX` on `affiliate_patterns(pattern)` so the upsert works correctly.

### 2. Update `process-video-links` — populate new text columns
The function currently doesn't set `link_type`, `affiliate_platform`, `affiliate_domain`, `resolved_retailer`, `resolved_retailer_domain`, or `is_shortened` on `video_links`. Add these to the update payload using the domain lookup maps:

- Known affiliate short domains: `wsli.nk` → Wishlink, `fkrt.it` → Flipkart Affiliate, `amzn.to` → Amazon Associates
- Known retailer domains: `amazon.in` → Amazon, `flipkart.com` → Flipkart, etc.
- Set `is_shortened = true` when original domain differs from unshortened
- Set `link_type` = "affiliate" / "retailer" / "both" based on what was detected

### 3. Add Bulk Upload to Links Page

Add a bulk upload section (dialog or inline card) on the Links page with two modes:

**Option A — Textarea paste** (tab-separated or CSV):
- Format: `pattern, name, classification` (one per line)
- Example: `amazon.in, Amazon, COMPETITOR`
- Type selector at top to choose "Affiliate Platform" or "Retailer"
- Parse and insert all rows at once via multiple `addPattern` calls

**Option B — File upload** (CSV/Excel):
- Accept `.csv` file with columns: pattern, name, classification, type
- Parse with `FileReader` + simple CSV split
- Preview parsed rows in a table before confirming

Both options will be in a new "Bulk Upload" dialog accessible from the header buttons.

### 4. Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add unique index on `affiliate_patterns(pattern)` |
| `process-video-links/index.ts` | Populate `link_type`, `affiliate_platform`, `affiliate_domain`, `resolved_retailer`, `resolved_retailer_domain`, `is_shortened` |
| `src/pages/Links.tsx` | Add Bulk Upload dialog with CSV paste + file upload |

