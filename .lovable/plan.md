

# Fix Excel Upload Button in Preview

## Problem
The "Upload Excel" button uses `inputRef.current?.click()` to programmatically trigger a hidden file input. Browser security policies inside iframes (like the Lovable preview) can block this, preventing the file picker from opening.

## Solution
Replace the hidden input + button pattern with a `<label>` wrapping approach. Browsers always allow a `<label htmlFor>` to trigger its associated file input, even inside iframes.

## Changes

**File: `src/components/keywords/ExcelUploadCard.tsx`**

1. Add an `id` to the hidden file input (e.g., `id="excel-upload-input"`)
2. Replace the `<Button onClick={...}>` with a `<label htmlFor="excel-upload-input">` styled to look like the existing button
3. Keep the download template button unchanged

The upload button will visually remain identical but will now reliably open the file picker in all environments.

