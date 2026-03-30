import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const YOUTUBE_CATEGORIES = [
  "Film & Animation",
  "Autos & Vehicles",
  "Music",
  "Pets & Animals",
  "Sports",
  "Short Movies",
  "Travel & Events",
  "Gaming",
  "Videoblogging",
  "People & Blogs",
  "Comedy",
  "Entertainment",
  "News & Politics",
  "Howto & Style",
  "Education",
  "Science & Technology",
  "Nonprofits & Activism",
];

interface Props {
  onAdd: (keyword: string, category: string) => Promise<void>;
}

export function AddKeywordDialog({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!keyword.trim() || !category) return;
    setLoading(true);
    await onAdd(keyword.trim(), category);
    setLoading(false);
    setKeyword("");
    setCategory("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Add Keyword</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Keyword</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Keyword</Label>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Enter keyword..." />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {YOUTUBE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} disabled={loading || !keyword.trim() || !category} className="w-full">
            {loading ? "Adding..." : "Add Keyword"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
