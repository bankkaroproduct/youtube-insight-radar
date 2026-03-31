

# Fix JS-Redirect Unshortening for Wishlink/Lehlah

## Problem
Wishlink and Lehlah URLs use JavaScript redirects (e.g., `window.location.href = "https://amazon.in/..."`) instead of HTTP 3xx redirects. The current `fallbackUnshorten` and `unshortenUrl` only follow HTTP redirects, so they return the intermediate page URL (wishlink.com) instead of the final retailer URL (amazon.in). This causes 200/201 links to have `original_url == unshortened_url` and empty retailer columns.

## Changes

### 1. Add JS-redirect HTML parsing to `fallbackUnshorten` (process-video-links/index.ts)

Add a new `JS_REDIRECT_DOMAINS` constant and an `extractRedirectFromHtml` helper function. After the normal `fetch(redirect:follow)` resolves, check if the final domain is in `JS_REDIRECT_DOMAINS`. If so, fetch the HTML body and extract the destination URL using these regex patterns in order:

1. `window.location(.href)? = "URL"` — JS redirect
2. `<meta http-equiv="refresh" content="...url=URL">` — meta refresh
3. `<link rel="canonical" href="URL">` — canonical tag
4. First external `<a href>` not pointing back to the same domain — last resort

Modify `fallbackUnshorten` to call this after getting the response — if the resolved domain is a JS-redirect domain, do a GET, read the body, and parse it. Also update `unshortenUrl` to apply the same HTML parsing after the unshorten.me API returns a result that's still on a JS-redirect domain.

### 2. SQL data reset for failed links (migration)

Run an UPDATE on `video_links` to set `unshortened_url = NULL` for all links where `original_url = unshortened_url` AND the original domain is a known shortener or affiliate redirect domain. This puts them back into the processing queue. Also clear `resolved_retailer`, `resolved_retailer_domain`, and `link_type`.

```sql
UPDATE video_links
SET unshortened_url = NULL,
    resolved_retailer = NULL,
    resolved_retailer_domain = NULL,
    link_type = NULL
WHERE original_url = unshortened_url
  AND (
    original_url LIKE '%wsli.nk%'
    OR original_url LIKE '%wishlink.com%'
    OR original_url LIKE '%lehlah.club%'
    OR original_url LIKE '%fkrt.it%'
    OR original_url LIKE '%bit.ly%'
    OR original_url LIKE '%t.co%'
    OR original_url LIKE '%tiny.cc%'
    OR original_url LIKE '%amzn.to%'
  );
```

### 3. Ensure link_type is always set (already mostly correct, minor fix)

In the main processing loop, after all platform/retailer detection, ensure `link_type` defaults to `"unknown"` instead of `null` when neither platform nor retailer is identified. This prevents null link_types from being excluded in market share calculations.

### 4. Channel stats recomputation

Already handled — the function auto-triggers `compute-channel-stats` for affected channels at the end. The reset in step 2 will cause reprocessing which will naturally trigger this.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/process-video-links/index.ts` | Add `JS_REDIRECT_DOMAINS`, `extractRedirectFromHtml()` helper, update `fallbackUnshorten` and `unshortenUrl` to parse HTML for JS redirects |
| SQL migration | Reset `unshortened_url` to NULL for failed links so they get reprocessed |

## Implementation Detail

```text
Current flow:
  wsli.nk/abc → HTTP 302 → wishlink.com/product/abc → STOP (no HTTP redirect)
  Result: unshortened_url = wishlink.com/product/abc, retailer = NULL

Fixed flow:
  wsli.nk/abc → HTTP 302 → wishlink.com/product/abc
    → detect wishlink.com is JS_REDIRECT_DOMAIN
    → GET HTML body → parse window.location.href = "amazon.in/dp/..."
    → unshortened_url = amazon.in/dp/..., retailer = "Amazon"
```

