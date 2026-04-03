import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  onUpload: (rows: { keyword: string; category: string; business_aim: string }[], fileName: string) => Promise<void>;
}

export function ExcelUploadCard({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
      const rows = json.map((row) => ({
        keyword: row.keyword || row.Keyword || "",
        category: row.category || row.Category || "General",
        business_aim: row.business_aim || row["Business Aim"] || "General",
      })).filter((r) => r.keyword.trim());
      if (rows.length === 0) {
        toast.error("No valid rows found. Ensure column 'keyword' exists.");
        return;
      }
      await onUpload(rows, file.name);
    } catch {
      toast.error("Failed to parse Excel file");
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { keyword: "best laptops 2025", category: "Technology", business_aim: "Tech Marketing" },
      { keyword: "personal finance tips", category: "Finance", business_aim: "Financial Services" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Keywords");
    XLSX.writeFile(wb, "keywords_template.xlsx");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Excel Upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <input id="excel-upload-input" ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        <Button variant="outline" size="sm" className="w-full cursor-pointer" asChild>
          <label htmlFor="excel-upload-input" className="flex items-center justify-center gap-2 w-full h-full">
            <Upload className="h-4 w-4" /> Upload Excel
          </label>
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Download Template
        </Button>
      </CardContent>
    </Card>
  );
}
