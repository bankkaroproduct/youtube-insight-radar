

# Add Domains Column to Videos CSV Export

## What
Add a new column to the videos CSV export that lists all unique domains found in each video's links, with labels showing the domain name and its classification (e.g., `amzn.in - Amazon Affiliate`, `amazon.com - Amazon Retailer`).

## How

**File: `src/pages/Videos.tsx`** — modify `downloadVideosCSV`

1. Add a "Domains" column to the CSV headers (after "Total Links").
2. For each video, collect unique domains from its links, building a label for each:
   - Use `domain` (or `original_domain` as fallback) for the domain name
   - Append the affiliate/retailer name and type: e.g., `affiliate_platform` → "Affiliate", `resolved_retailer` → "Retailer", otherwise just the `classification`
   - Format: `domain - Name Type` (e.g., `amzn.in - Amazon Affiliate`, `amazon.com - Amazon Retailer`)
   - Deduplicate by domain string
3. Join all domain labels with `; ` separator into the cell value.

This requires no database or edge function changes — all data is already present in the `video.links` array.

