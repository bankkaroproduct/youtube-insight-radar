import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { ChannelCategory } from "@/hooks/useKeywords";

interface Props {
  categories: ChannelCategory[];
  onAdd: (keyword: string, category: string, businessAim: string) => Promise<void>;
}

export function AddKeywordDialog({ categories, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [businessAim, setBusinessAim] = useState("General");
  const [loading, setLoading] = useState(false);

  const selectedCategory = categories.find((c) => c.name === category);

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    const cat = categories.find((c) => c.name === val);
    if (cat) setBusinessAim(cat.business_aim);
  };

  const handleSubmit = async () => {
    if (!keyword.trim() || !category) return;
    setLoading(true);
    await onAdd(keyword.trim(), category, businessAim);
    setLoading(false);
    setKeyword("");
    setCategory("");
    setBusinessAim("General");
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
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Business Aim</Label>
            <Input value={businessAim} onChange={(e) => setBusinessAim(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !keyword.trim() || !category} className="w-full">
            {loading ? "Adding..." : "Add Keyword"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
