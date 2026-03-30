

# Remove Business Aim & Add All YouTube Categories

## Changes

### 1. `src/components/keywords/AddKeywordDialog.tsx`
- Remove the "Business Aim" field entirely (the input + label + state)
- Remove `businessAim` from state and submission logic
- Hardcode a static list of all YouTube video categories in the dropdown instead of pulling from `channel_categories` table
- YouTube categories: Film & Animation, Autos & Vehicles, Music, Pets & Animals, Sports, Short Movies, Travel & Events, Gaming, Videoblogging, People & Blogs, Comedy, Entertainment, News & Politics, Howto & Style, Education, Science & Technology, Nonprofits & Activism

### 2. `src/hooks/useKeywords.ts`
- Update `addKeyword` to use a default business_aim value ("General") since UI no longer collects it
- Update `onAdd` signature if needed

### 3. `src/components/keywords/ExcelUploadCard.tsx` (if it references business aim)
- Check if bulk upload also needs the same treatment — will keep as-is if business_aim comes from Excel columns

## Files
1. **`src/components/keywords/AddKeywordDialog.tsx`** — remove business aim field, replace category dropdown with hardcoded YouTube categories
2. **`src/hooks/useKeywords.ts`** — simplify `addKeyword` signature

