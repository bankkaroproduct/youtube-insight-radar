

# Remove CRM Section & Fix Sidebar Visibility

## What's happening

1. **CRM section**: The sidebar has a "CRM" group containing Tasks and Triggers. I'll remove this entire group and its routes.
2. **Keywords/Videos not visible**: Based on the session replay, they ARE rendering and clickable. The likely issue is the sidebar being in collapsed mode (showing only icons without labels). However, I'll verify the nav items render correctly regardless of sidebar state.

## Changes

### 1. Remove CRM from sidebar (`src/components/AppSidebar.tsx`)
- Remove `crmItems` array (Tasks, Triggers)
- Remove `ListChecks`, `Zap` icon imports
- Remove `{renderGroup("CRM", crmItems)}` from the sidebar content

### 2. Remove CRM routes (`src/App.tsx`)
- Remove Tasks and Triggers route entries
- Remove Tasks and Triggers page imports

### 3. Ensure Keywords/Videos visibility
- The sidebar items are present in `discoveryItems` and have no `adminOnly` filter, so they should always show. I'll inspect if there's a CSS or collapsed-state issue hiding them and fix if needed.

## Files Modified
- `src/components/AppSidebar.tsx` — remove CRM group
- `src/App.tsx` — remove CRM routes and imports

