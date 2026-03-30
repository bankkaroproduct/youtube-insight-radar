import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

interface AddKeysDialogProps {
  onAdd: (keys: string[]) => void;
  isPending: boolean;
}

export function AddKeysDialog({ onAdd, isPending }: AddKeysDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const handleAdd = () => {
    const keys = text
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (keys.length === 0) return;
    onAdd(keys);
    setText("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> Add Key(s)</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add YouTube API Keys</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Paste one API key per line. Supports bulk paste.</p>
        <Textarea
          rows={10}
          placeholder={"AIzaSyA...\nAIzaSyB...\nAIzaSyC..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {text.split("\n").filter((l) => l.trim()).length} key(s)
          </span>
          <Button onClick={handleAdd} disabled={isPending}>
            {isPending ? "Adding..." : "Add Keys"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
