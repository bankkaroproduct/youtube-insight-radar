

# Add Competitor Name Dropdown to Affiliate Patterns

## Problem
Currently the "Display Name" field is free-text, leading to duplicates like "CashKaro" vs "Cashkaro" vs "cashkaro". Different domains belonging to the same competitor should share one canonical name.

## Solution
Create a `competitor_names` database table to store canonical competitor names. Use a dropdown (with "Add new" option) instead of free-text input for the name field — both when adding new patterns and when confirming discovered patterns.

## Database

### New table: `competitor_names`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| name | text UNIQUE, NOT NULL | e.g. "CashKaro", "Wishlink" |
| created_at | timestamptz | auto |

RLS: authenticated can read, admin can manage.

## Changes

### 1. Migration
- Create `competitor_names` table with RLS policies.

### 2. New hook: `src/hooks/useCompetitorNames.ts`
- Fetch all names from `competitor_names`
- `addName(name)` — insert new competitor name
- Used by the Links page for dropdowns

### 3. Update `src/pages/Links.tsx`
- **Add Pattern dialog**: Replace the "Display Name" `<Input>` with a `<Select>` dropdown populated from `competitor_names`. Show when classification is COMPETITOR or OWN. Include an "Add new..." option that shows an inline input to create a new name on the fly.
- **Discovered Patterns tab**: When clicking "Competitor", show a small popover/select to pick the competitor name before confirming.

### 4. Update `src/hooks/useAffiliatePatterns.ts`
- `confirmPattern` already accepts a classification + updates name — will also accept the selected competitor name.

## Files
1. **Migration SQL** — `competitor_names` table + RLS
2. **`src/hooks/useCompetitorNames.ts`** — new hook
3. **`src/pages/Links.tsx`** — dropdown for name selection in both tabs
4. **`src/hooks/useAffiliatePatterns.ts`** — minor update to pass name on confirm

