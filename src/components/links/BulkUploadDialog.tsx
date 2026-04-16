import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileUp } from "lucide-react";
import { toast } from "sonner";
import { PatternType } from "@/hooks/useAffiliatePatterns";

interface ParsedRow {
  pattern: string;
  name: string;
  classification: string;
  type: PatternType;
}

interface BulkUploadDialogProps {
  onUpload: (rows: ParsedRow[]) => Promise<void>;
}

function parseCSVContent(text: string, defaultType: PatternType): ParsedRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    // Support tab, comma, or pipe separated
    const parts = line.split(/[,\t|]/).map(s => s.trim());
    if (parts.length < 2) continue;

    const pattern = parts[0];
    const name = parts[1];
    const classification = (parts[2] || "NEUTRAL").toUpperCase();
    const rawType = (parts[3] || "").trim().toLowerCase();
    const type: PatternType = rawType === "affiliate_platform" || rawType === "platform"
      ? "affiliate_platform" : rawType === "retailer" ? "retailer" : rawType === "social" ? "social" : rawType === "neutral" ? "neutral" : defaultType;

    if (!pattern || !name) continue;
    if (!["OWN", "COMPETITOR", "NEUTRAL"].includes(classification)) continue;

    rows.push({ pattern, name, classification, type });
  }

  return rows;
}

export function BulkUploadDialog({ onUpload }: BulkUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<PatternType>("retailer");
  const [textContent, setTextContent] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleParse = () => {
    const rows = parseCSVContent(textContent, defaultType);
    if (rows.length === 0) {
      toast.error("No valid rows found. Format: pattern, name, classification");
      return;
    }
    setParsedRows(rows);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setTextContent(content);
      const rows = parseCSVContent(content, defaultType);
      setParsedRows(rows);
      if (rows.length === 0) toast.error("No valid rows found in file");
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      await onUpload(parsedRows);
      toast.success(`${parsedRows.length} patterns uploaded`);
      setOpen(false);
      setTextContent("");
      setParsedRows([]);
    } catch {
      toast.error("Upload failed");
    }
    setUploading(false);
  };

  const classColors: Record<string, string> = {
    OWN: "bg-green-500/15 text-green-700 border-green-500/30",
    COMPETITOR: "bg-red-500/15 text-red-700 border-red-500/30",
    NEUTRAL: "bg-muted text-muted-foreground",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setParsedRows([]); setTextContent(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" /> Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Patterns</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Default Type</Label>
            <Select value={defaultType} onValueChange={(v) => setDefaultType(v as PatternType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="affiliate_platform">Affiliate Platform</SelectItem>
                <SelectItem value="retailer">Retailer</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Paste CSV (pattern, name, classification, type)</Label>
            <Textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder={`amazon.in, Amazon, COMPETITOR, retailer\nwsli.nk, Wishlink, NEUTRAL, affiliate_platform\nflipkart.com, Flipkart, COMPETITOR`}
              rows={6}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleParse}>
              Preview
            </Button>
            <Label htmlFor="csv-file" className="cursor-pointer">
              <div className="inline-flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground">
                <FileUp className="h-4 w-4" /> Upload CSV
              </div>
              <input id="csv-file" type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
            </Label>
          </div>

          {parsedRows.length > 0 && (
            <>
              <div className="text-sm text-muted-foreground">{parsedRows.length} rows parsed</div>
              <div className="max-h-60 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pattern</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{r.pattern}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={classColors[r.classification] || classColors.NEUTRAL}>
                            {r.classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.type === "retailer" ? "Retailer" : r.type === "social" ? "Social" : r.type === "neutral" ? "Neutral" : "Platform"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button onClick={handleUpload} disabled={uploading} className="w-full">
                {uploading ? "Uploading..." : `Upload ${parsedRows.length} Patterns`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
