

# Increase Link Processing Batch Size to 1000

## Change

| File | Line | Change |
|------|------|--------|
| `src/pages/Links.tsx` | 442 | Change `callEdgeFunction(500)` → `callEdgeFunction(1000)` |

One-line change. The batch size parameter is passed directly to the edge function.

