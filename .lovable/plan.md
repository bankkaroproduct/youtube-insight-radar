

# Fix Links Page: Table Titles & Discovered Pattern Actions

## Changes

### 1. Platforms & Retailers tabs — add table title row
Currently the `PatternTable` component has no visible title above the table. Add a simple heading inside the card showing "Affiliate Platforms" or "Retailers" with the count — this is already there via `CardTitle`, so this is already working. No change needed here.

### 2. Discovered Patterns tab — enhanced actions
Currently discovered patterns only let you mark as OWN/COMPETITOR/NEUTRAL but don't let you change the **type** (affiliate_platform vs retailer). Update the discovered patterns table to include:

- A **Type selector** (dropdown or toggle) so you can change between "Affiliate Platform" and "Retailer" before confirming
- Keep the OWN / COMPETITOR / NEUTRAL classification buttons
- When confirming, pass both the selected type and classification

**File: `src/pages/Links.tsx`**
- In the discovered patterns table, add a "Type" column with a `Select` dropdown that calls `updatePatternType(p.id, newType)` 
- Update the `confirmPattern` call to also pass the type if changed
- Alternatively, make the type changeable inline before confirming

**File: `src/hooks/useAffiliatePatterns.ts`**
- The `confirmPattern` function needs to also accept an optional `type` parameter and include it in the update
- `updatePatternType` already exists and works standalone

### Implementation Details

1. **`src/hooks/useAffiliatePatterns.ts`**: Update `confirmPattern` to accept optional `type: PatternType` parameter and include it in the update payload.

2. **`src/pages/Links.tsx`**: 
   - Add a `Type` column to the discovered patterns table with an inline `Select` for switching between Platform/Retailer
   - Track selected types per discovered pattern using local state (`Record<string, PatternType>`)
   - Pass the selected type when confirming via OWN/COMPETITOR/NEUTRAL buttons
   - The DiscoveredNamePicker also passes the type along with classification

