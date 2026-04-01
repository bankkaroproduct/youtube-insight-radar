

# Increase Link Processing Batch Size to 500

## Change

| File | Line | Change |
|------|------|--------|
| `src/pages/Links.tsx` | 442 | Change `callEdgeFunction(100)` → `callEdgeFunction(500)` |

One-line change. The edge function already supports up to 500. With two Unshorten API keys now rotating, the larger batch will process faster without hitting rate limits.

