
Fix the Excel upload by replacing the current label-based trigger with a directly clickable native file input surface.

What I found
- `src/components/keywords/ExcelUploadCard.tsx` already uses the plain `<label htmlFor="excel-upload-input">` approach, so the previous fix is already present.
- The session replay shows repeated clicks plus text-selection events on the upload control, which suggests the click is landing on the visible text/button area but not reliably opening the file picker.
- There is another upload flow in `src/components/links/BulkUploadDialog.tsx`, but the Excel uploader is still using a fragile hidden-input trigger pattern.

Plan
1. Update `src/components/keywords/ExcelUploadCard.tsx`
   - Replace the hidden sibling `<input>` + `<label htmlFor>` setup.
   - Use a `relative` wrapper where the real `<input type="file">` sits over the full button area (`absolute inset-0`, transparent, full size, cursor pointer).
   - Keep the visible upload UI looking the same.

2. Make the interaction reliable
   - Add `select-none` so repeated clicks do not select the “Upload Excel” text.
   - Preserve hover/focus styling on the visible surface with wrapper-based classes.

3. Keep the upload logic intact
   - Leave the existing Excel parsing with `xlsx` unchanged.
   - Keep `onUpload(rows, file.name)` unchanged.
   - Clear the input after handling so the same file can be uploaded again.
   - Leave the template download button unchanged.

Technical details
- File to update: `src/components/keywords/ExcelUploadCard.tsx`
- This supersedes the current `htmlFor` fix because the native input itself will receive the click, which is more reliable in embedded preview environments.
- The `useRef` reset can likely be removed and replaced with clearing `e.currentTarget.value`.

Validation
- Clicking anywhere on “Upload Excel” should open the file picker.
- Selecting a valid `.xlsx` or `.xls` file should trigger the existing import flow.
- Re-uploading the same file should still work after the input reset.
