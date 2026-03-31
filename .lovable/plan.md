

# Add Link-Level Market Share for Platforms & Retailers in Videos Tab

## What
Show per-video link-level market share for platforms and retailers. If a video has 10 links and 4 have `retailer = Meesho`, Meesho's share is `4/10 = 40%`. Same logic for platforms.

## How

### `src/pages/Videos.tsx` — Display market share in Platforms and Retailers columns

Replace the current simple badge display in the Platforms and Retailers columns with badges that include the percentage share.

**Platform market share calculation** (per video):
```
totalLinks = video.links.length
For each unique platform_name, count how many links have that platform_name
Share = count / totalLinks → display as "Wishlink (40%)"
```

**Retailer market share calculation** (per video):
```
totalLinks = video.links.length
For each unique retailer_name, count how many links have that retailer_name
Share = count / totalLinks → display as "Amazon (30%)"
```

Update `getUniquePlatforms` and `getUniqueRetailers` to return `{ name: string, count: number }[]` instead of `string[]`, then render as:

```
<Badge>Wishlink 40%</Badge>  <Badge>Amazon 30%</Badge>
```

Sort entries by count descending so the dominant platform/retailer appears first.

### Changes summary

| File | Change |
|------|--------|
| `src/pages/Videos.tsx` | Refactor `getUniquePlatforms`/`getUniqueRetailers` to return name+count, compute `count/totalLinks` percentage, display in badges |

