import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, RotateCcw } from "lucide-react";
import { format, subDays } from "date-fns";

export interface FetchSettings {
  orderBy: string;
  publishedAfter: Date | undefined;
}

interface Props {
  settings: FetchSettings;
  onChange: (s: FetchSettings) => void;
}

export function FetchSettingsCard({ settings, onChange }: Props) {
  const set = <K extends keyof FetchSettings>(key: K, val: FetchSettings[K]) =>
    onChange({ ...settings, [key]: val });

  const quickDate = (days: number) => set("publishedAfter", subDays(new Date(), days));
  const reset = () => onChange({ orderBy: "relevance", publishedAfter: undefined });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Video Fetch Settings</CardTitle>
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1 h-3 w-3" /> Reset</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Video Ranking</Label>
          <Select value={settings.orderBy} onValueChange={(v) => set("orderBy", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="viewCount">View Count</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="rating">Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Published After</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {settings.publishedAfter ? format(settings.publishedAfter, "PP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={settings.publishedAfter} onSelect={(d) => set("publishedAfter", d)} /></PopoverContent>
          </Popover>
          <div className="flex gap-1 mt-2">
            {[7, 14, 30, 90].map((d) => (
              <Button key={d} variant="outline" size="sm" className="text-xs flex-1" onClick={() => quickDate(d)}>
                {d}d
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
