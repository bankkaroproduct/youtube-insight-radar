import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, AlertTriangle } from "lucide-react";

interface AddKeysDialogProps {
  onAdd: (keys: string[]) => void;
  isPending: boolean;
}

const KEY_REGEX = /^AIza[0-9A-Za-z_-]{35}$/;

export function AddKeysDialog({ onAdd, isPending }: AddKeysDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const { valid, invalid } = useMemo(() => {
    const lines = text.split("\n").map((k) => k.trim()).filter((k) => k.length > 0);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const l of lines) {
      if (KEY_REGEX.test(l)) valid.push(l);
      else invalid.push(l);
    }
    return { valid, invalid };
  }, [text]);

  const submit = (keys: string[]) => {
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

        {invalid.length > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {invalid.length} invalid {invalid.length === 1 ? "line" : "lines"}
            </div>
            <p className="text-xs text-muted-foreground">
              Not a valid YouTube API key format (expected <code>AIza...</code> 39 chars):
            </p>
            <ul className="text-xs font-mono max-h-24 overflow-y-auto space-y-0.5">
              {invalid.map((k, i) => (
                <li key={i} className="truncate">
                  {k.length > 50 ? k.slice(0, 50) + "…" : k}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-between items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {valid.length} valid · {invalid.length} invalid
          </span>
          <div className="flex gap-2">
            {invalid.length > 0 && valid.length > 0 && (
              <Button variant="outline" onClick={() => submit(valid)} disabled={isPending}>
                Add valid keys only ({valid.length})
              </Button>
            )}
            <Button
              onClick={() => submit(valid)}
              disabled={isPending || valid.length === 0 || invalid.length > 0}
            >
              {isPending ? "Adding..." : `Add ${valid.length} Key${valid.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
