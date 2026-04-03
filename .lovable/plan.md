

# Fix Excel Upload Button

## Problem
The `Button` component with `asChild` uses Radix UI's `Slot`, which can interfere with the native `<label htmlFor>` click-to-trigger-input behavior. The `Slot` component merges props and may prevent the label's default action from reaching the hidden file input.

## Solution
Remove `asChild` and the `Button` wrapper entirely. Style the `<label>` directly with Tailwind classes to match the outline button appearance. This ensures the native label-input association works without any Radix interference.

## Changes

**File: `src/components/keywords/ExcelUploadCard.tsx`**

Replace the current Button+label combination (lines 56-60) with a plain `<label>` styled to look like the outline button:

```tsx
<label
  htmlFor="excel-upload-input"
  className="inline-flex items-center justify-center gap-2 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
>
  <Upload className="h-4 w-4" /> Upload Excel
</label>
```

This removes the Radix `Slot` layer entirely while keeping the same visual appearance.

