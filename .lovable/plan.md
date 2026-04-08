

# Add CSV Download to Affiliate Platforms Page

## Change

Add a "Download CSV" button to the Links page (Affiliates & Retailers) that exports the current tab's patterns as a CSV file.

### File: `src/pages/Links.tsx`

1. **Add a `downloadPatternsCSV` function** that takes a patterns array and generates a CSV with columns: Pattern, Name, Classification, Type, Source (Auto/Manual), Created At.

2. **Add `Download` icon import** from lucide-react.

3. **Add Download CSV button** next to the existing "Bulk Upload" and "Process Links" buttons in the top action bar. It will export all confirmed patterns (both platforms and retailers combined). Alternatively, add a download button inside each tab's CardHeader so users can download just platforms or just retailers separately.

I'll add a download button in the top action bar that exports all patterns, keeping it simple and consistent with other pages.

