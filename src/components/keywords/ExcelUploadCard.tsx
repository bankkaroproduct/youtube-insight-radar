import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  onUpload: (rows: { keyword: string; category: string; business_aim: string }[], fileName: string) => Promise<void>;
}

export function ExcelUploadCard({ onUpload }: Props) {

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
    e.target.value = "";
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
        <div className="relative inline-flex items-center justify-center gap-2 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors select-none">
          <Upload className="h-4 w-4" /> Upload Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <Button variant="ghost" size="sm" className="w-full" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Download Template
        </Button>
      </CardContent>
    </Card>
  );
}
