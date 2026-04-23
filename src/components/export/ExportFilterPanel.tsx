import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, FileSpreadsheet, Filter, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { ExportFilters } from "@/services/excelExportService";

interface KeywordOption {
  id: string;
  keyword: string;
  category: string | null;
}
interface ChannelOption {
  channel_id: string; // YouTube ID (text)
  channel_name: string;
}

interface ExportFilterPanelProps {
  isExporting: boolean;
  onExport: (filters: ExportFilters) => void;
}

export function ExportFilterPanel({ isExporting, onExport }: ExportFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<string[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [includeBackfill, setIncludeBackfill] = useState(true);

  const [keywords, setKeywords] = useState<KeywordOption[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // Load keyword + channel lists once when the panel first opens
  useEffect(() => {
    if (!open || optionsLoaded) return;
    let cancelled = false;
    (async () => {
      // Pull keywords & channels in parallel; both are bounded (~hundreds → few thousand).
      const [kwRes, chRes] = await Promise.all([
        supabase
          .from("keywords_search_runs")
          .select("id,keyword,category")
          .order("keyword", { ascending: true })
          .limit(5000),
        supabase
          .from("channels")
          .select("channel_id,channel_name")
          .order("channel_name", { ascending: true })
          .limit(5000),
      ]);
      if (cancelled) return;
      if (kwRes.data) setKeywords(kwRes.data as KeywordOption[]);
      if (chRes.data) setChannels(chRes.data as ChannelOption[]);
      setOptionsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, optionsLoaded]);

  const filterCount = useMemo(() => {
    let n = 0;
    if (fromDate) n++;
    if (toDate) n++;
    if (selectedKeywordIds.length > 0) n++;
    if (selectedChannelIds.length > 0) n++;
    if (!includeBackfill) n++;
    return n;
  }, [fromDate, toDate, selectedKeywordIds, selectedChannelIds, includeBackfill]);

  const clearAll = () => {
    setFromDate(undefined);
    setToDate(undefined);
    setSelectedKeywordIds([]);
    setSelectedChannelIds([]);
    setIncludeBackfill(true);
  };

  const buildFilters = (): ExportFilters => ({
    fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
    toDate: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
    keywordIds: selectedKeywordIds.length > 0 ? selectedKeywordIds : undefined,
    channelIds: selectedChannelIds.length > 0 ? selectedChannelIds : undefined,
    includeBackfill,
  });

  const runFilteredExport = () => {
    onExport(buildFilters());
    setOpen(false);
  };

  const runFullExport = () => {
    if (filterCount > 0) {
      const ok = window.confirm(
        "This will export the entire database and may take several minutes. Continue?",
      );
      if (!ok) return;
    }
    onExport({});
    setOpen(false);
  };

  const toggleKeyword = (id: string) => {
    setSelectedKeywordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const toggleChannel = (id: string) => {
    setSelectedChannelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm" disabled={isExporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {isExporting ? "Exporting..." : "Export Report"}
          {filterCount > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 h-5 text-xs">
              {filterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4" /> Export filters
            </div>
            {filterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 px-2 text-xs">
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wide">
              Date range (videos added)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <DatePopover label="From" date={fromDate} setDate={setFromDate} />
              <DatePopover label="To" date={toDate} setDate={setToDate} />
            </div>
          </div>

          <Separator />

          {/* Keywords */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground tracking-wide">
                Keywords
              </Label>
              {selectedKeywordIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedKeywordIds.length} selected
                </span>
              )}
            </div>
            <MultiSelectCombobox
              placeholder={
                selectedKeywordIds.length === 0
                  ? "All keywords"
                  : `${selectedKeywordIds.length} keyword${selectedKeywordIds.length > 1 ? "s" : ""} selected`
              }
              loading={!optionsLoaded}
              items={keywords.map((k) => ({
                value: k.id,
                label: k.keyword,
                hint: k.category || undefined,
              }))}
              selected={selectedKeywordIds}
              onToggle={toggleKeyword}
              onClear={() => setSelectedKeywordIds([])}
            />
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="include-backfill"
                checked={includeBackfill}
                onCheckedChange={(v) => setIncludeBackfill(v === true)}
              />
              <Label
                htmlFor="include-backfill"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Include Last-50 backfilled videos (S3 / S4)
              </Label>
            </div>
          </div>

          <Separator />

          {/* Channels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground tracking-wide">
                Channels
              </Label>
              {selectedChannelIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedChannelIds.length} selected
                </span>
              )}
            </div>
            <MultiSelectCombobox
              placeholder={
                selectedChannelIds.length === 0
                  ? "All channels"
                  : `${selectedChannelIds.length} channel${selectedChannelIds.length > 1 ? "s" : ""} selected`
              }
              loading={!optionsLoaded}
              items={channels.map((c) => ({
                value: c.channel_id,
                label: c.channel_name,
              }))}
              selected={selectedChannelIds}
              onToggle={toggleChannel}
              onClear={() => setSelectedChannelIds([])}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
          <Button
            variant="outline"
            size="sm"
            onClick={runFullExport}
            disabled={isExporting}
          >
            Export All
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={runFilteredExport}
            disabled={isExporting || filterCount === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Filtered
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DatePopover({
  label,
  date,
  setDate,
}: {
  label: string;
  date: Date | undefined;
  setDate: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "justify-start text-left font-normal",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-2" />
          {date ? format(date, "MMM d, yyyy") : <span>{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {date && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setDate(undefined)}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ComboItem {
  value: string;
  label: string;
  hint?: string;
}

function MultiSelectCombobox({
  placeholder,
  items,
  selected,
  onToggle,
  onClear,
  loading,
}: {
  placeholder: string;
  items: ComboItem[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder={loading ? "Loading..." : "Search..."} />
          <CommandList>
            <CommandEmpty>{loading ? "Loading..." : "No matches."}</CommandEmpty>
            {selected.length > 0 && (
              <>
                <CommandGroup>
                  <CommandItem onSelect={onClear} className="text-xs text-muted-foreground">
                    <X className="h-3 w-3 mr-2" /> Clear selection
                  </CommandItem>
                </CommandGroup>
                <Separator />
              </>
            )}
            <CommandGroup>
              <ScrollArea className="h-[240px]">
                {items.map((item) => {
                  const isSelected = selected.includes(item.value);
                  return (
                    <CommandItem
                      key={item.value}
                      value={`${item.label} ${item.hint ?? ""} ${item.value}`}
                      onSelect={() => onToggle(item.value)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 mr-2",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{item.label}</div>
                        {item.hint && (
                          <div className="truncate text-xs text-muted-foreground">{item.hint}</div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
