
Fix the Excel upload by switching from a custom “fake button” trigger to a visible native file input.

What I found
- `src/components/keywords/ExcelUploadCard.tsx` already uses the transparent overlay approach, so the previous fixes are present but still not solving it.
- Your screenshot shows the upload control rendering as a very thin strip instead of a normal button, which matches a native file input / overlay styling issue.
- The session replay shows repeated clicks on the same element with no picker opening, so the click target itself is the problem.
- The actual import logic in `handleFile` looks fine; the failure is at the file-picker trigger stage.

Plan
1. Replace the custom upload surface in `src/components/keywords/ExcelUploadCard.tsx`
   - Remove the `relative` div + invisible overlaid file input.
   - Use a normal visible file input instead of trying to simulate a button.

2. Style the native input with the existing shared input styles
   - Reuse the project’s `Input` component for `type="file"` so it keeps the app’s design while staying natively clickable.
   - Keep accepted formats limited to `.xlsx,.xls`.

3. Keep the Excel parsing/import flow unchanged
   - Preserve `handleFile`, `xlsx` parsing, toast errors, and `onUpload(rows, file.name)`.
   - Keep clearing `e.target.value` so the same file can be selected again.
   - Leave the “Download Template” button unchanged.

4. Minor cleanup
   - Remove any no-longer-needed upload-specific wrapper styling.
   - Keep the card layout simple and reliable.

Technical details
- Main file: `src/components/keywords/ExcelUploadCard.tsx`
- Likely change:
  ```tsx
  <Input type="file" accept=".xlsx,.xls" onChange={handleFile} className="cursor-pointer" />
  ```
- This avoids browser/iframe quirks around hidden inputs, labels, overlays, and proxy click targets.

Validation
- The upload control should appear as a normal full-height input, not a thin strip.
- Clicking anywhere inside the file input should open the file picker.
- Selecting an Excel file should trigger the existing import flow.
- Re-selecting the same file should still work.
