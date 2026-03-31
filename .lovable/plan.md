# Fix Affiliate Platform vs Retailer Classification Pipeline

## Problem

Shortened URLs (wsli.nk, fkrt.it, amzn.to) and direct retailer URLs (amazon.in, flipkart.com) are treated the same. They need separate handling: the shortened domain identifies the **affiliate platform**, and the unshortened destination identifies the **retailer**.

## Changes

### 1. Database Migration — New columns on `video_links` and `channels`

**video_links** — add:

- `link_type` text (affiliate / retailer / both)
- `affiliate_platform` text — e.g. "Wishlink"
- `affiliate_domain` text — e.g. "wsli.nk"
- `resolved_retailer` text — e.g. "Amazon"
- `resolved_retailer_domain` text — e.g. "amazon.in"
- `is_shortened` boolean default false

**channels** — add:

- `retailer_via_affiliate_counts` jsonb default '{}'
- `retailer_direct_counts` jsonb default '{}'  
RETAILER_DOMAINS:  
  amazon.in / amazon.com → Amazon  
  flipkart.com → Flipkart  
  myntra.com → Myntra  
  ajio.com → AJIO  
  meesho.com → Meesho  
  nykaa.com → Nykaa  
  snapdeal.com → Snapdeal  
  tatacliq.com → Tata CLiQ  
  reliancedigital.in → Reliance Digital  
  croma.com → Croma

For each link:

1. Extract `original_domain` from the raw URL
2. Check if it's a known shortener → `is_shortened = true`
3. If shortened: set `affiliate_domain = original_domain`, look up `affiliate_platform` name from map
4. Unshorten the URL → get `resolved_retailer_domain`, look up `resolved_retailer` name
5. If NOT shortened but domain matches a retailer: `link_type = "retailer"`, `resolved_retailer = name`, no affiliate fields
6. If shortened and resolved to retailer: `link_type = "both"`
7. If shortened but retailer unknown: `link_type = "affiliate"`
8. Still keep the existing pattern matching for `classification` (OWN/COMPETITOR/NEUTRAL)

### 3. Update `compute-channel-stats` Edge Function

Change the select to include the new columns: `affiliate_platform`, `resolved_retailer`, `link_type`.

For `platform_video_counts`: group by `affiliate_platform` (not null), count distinct video_ids.

For `retailer_video_counts`: group by `resolved_retailer` (not null), count distinct video_ids.

For `retailer_via_affiliate_counts`: count distinct video_ids where `link_type` is "both" or "affiliate" AND `resolved_retailer` is not null, grouped by retailer.

For `retailer_direct_counts`: count distinct video_ids where `link_type` = "retailer", grouped by `resolved_retailer`.

### 4. Update `useChannels.ts`

Add `retailer_via_affiliate_counts` and `retailer_direct_counts` to the Channel interface.

### 5. Update `Channels.tsx`

**Platform tags** (amber color): Show affiliate platform name + count + share%.

**Retailer tags**: Show retailer name + total count + share%, with two gray sub-tags underneath:

- "via affiliate: X"
- "direct: Y"

**Download**: Replace CSV with XLSX using two sheets:

- Sheet 1 "Affiliate Platforms": Channel Name, Subscribers, Total Videos, Platform Name, Videos Using Platform, Market Share %
- Sheet 2 "Retailers": Channel Name, Subscribers, Total Videos, Retailer Name, Total Videos, Via Affiliate, Direct, Market Share %

### 6. Files Changed


| File                             | Change                                                   |
| -------------------------------- | -------------------------------------------------------- |
| Migration SQL                    | Add 6 columns to `video_links`, 2 to `channels`          |
| `process-video-links/index.ts`   | Add affiliate/retailer domain maps, populate new columns |
| `compute-channel-stats/index.ts` | Use new columns for counts, compute via/direct split     |
| `src/hooks/useChannels.ts`       | Add new fields to interface                              |
| `src/pages/Channels.tsx`         | Separate tagged sections, sub-tags, XLSX download        |
