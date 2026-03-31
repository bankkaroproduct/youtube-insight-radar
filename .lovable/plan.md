

# Add Channel Relevance Column & Keep P1-P5 Priority

## Summary

Two changes based on user feedback:

1. **Channels page**: Add a single "Relevance" column showing Yes/No (is this channel useful for Flipkart/Wishlink affiliate marketing). Uses AI to analyze channel description + category.
2. **Keyword priority**: Keep existing P1-P5 tier system as-is (already implemented in `analyze-keyword-priority`). No changes needed.

## Plan

### 1. DB Migration
Add to `channels` table:
- `is_relevant` (boolean, nullable) — Yes/No relevance flag
- `relevance_reasoning` (text, nullable) — AI explanation stored for reference
- `last_relevance_check_at` (timestamptz, nullable)

### 2. Create `analyze-channel-relevance` edge function
New edge function: `supabase/functions/analyze-channel-relevance/index.ts`
- Accepts `{ channels: [{ id, channel_name, description, youtube_category }] }`
- Uses Lovable AI gateway (gemini-2.5-flash) with tool calling
- For each channel, determines: is this channel useful for Flipkart/Wishlink affiliate marketing? (reviews, unboxing, comparisons, buying guides, hauls, shoppable products)
- Returns `is_relevant` (boolean) + `reasoning` (one line)
- Updates `channels` table with results
- Batch up to 20 channels per AI call

### 3. Update Channels page (`src/pages/Channels.tsx`)
- Add "Relevance" column after Status showing Yes (green badge) / No (gray badge) / "—" (not checked)
- Add "Check Relevance" button in header toolbar that triggers the edge function for all unchecked channels
- Add sortable header and filter dropdown (All / Yes / No) for the Relevance column

### 4. Update `src/hooks/useChannels.ts`
- Include `is_relevant` in the Channel interface (already fetching `*`)

## Files to create/modify
1. **DB migration** — add `is_relevant`, `relevance_reasoning`, `last_relevance_check_at` to `channels`
2. `supabase/functions/analyze-channel-relevance/index.ts` — new edge function
3. `src/pages/Channels.tsx` — add Relevance column, filter, "Check Relevance" button
4. `src/hooks/useChannels.ts` — add `is_relevant` to Channel interface

Keyword priority stays P1-P5 — no changes needed, already implemented.

