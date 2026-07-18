import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import { format } from "date-fns";

import { fetchSheet, type Row } from "@/lib/parse-sheet";
import {
  TRAIN_SHEETS,
  SITE_CONDITIONS_SHEET,
  groupColumns,
  splitSiteColumns,
} from "@/lib/sheets-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Activity, AlertTriangle, RefreshCw, Gauge, Plus, X, LayoutGrid, Columns2, Rows } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rotating Equipment Dashboard" },
      {
        name: "description",
        content:
          "Live monitoring dashboard for rotating equipment trains — bearings, vibration, lube oil, gearbox, exhaust.",
      },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

// ms until the next 11:00 AM local time
function msUntilNext11AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(11, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

const ONE_DAY = 24 * 60 * 60 * 1000;

function Dashboard() {
  const trainNames = Object.keys(TRAIN_SHEETS);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [train, setTrain] = useState(trainNames[0]);
  const url = TRAIN_SHEETS[train];

  const query = useQuery({
    queryKey: ["sheet", train, url],
    queryFn: () => fetchSheet(url),
    enabled: !!url && mode === "single",
    refetchInterval: () => msUntilNext11AM(),
    staleTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });

  // Site Conditions sheet — general plant data + per-train tagged sensors.
  const siteQuery = useQuery({
    queryKey: ["sheet", "site-conditions", SITE_CONDITIONS_SHEET],
    queryFn: () => fetchSheet(SITE_CONDITIONS_SHEET),
    enabled: !!SITE_CONDITIONS_SHEET,
    refetchInterval: () => msUntilNext11AM(),
    staleTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });

  // For compare mode: fetch all trains in parallel
  const compareQueries = useQueries({
    queries: trainNames.map((t) => ({
      queryKey: ["sheet", t, TRAIN_SHEETS[t]],
      queryFn: () => fetchSheet(TRAIN_SHEETS[t]),
      enabled: !!TRAIN_SHEETS[t] && mode === "compare",
      refetchInterval: () => msUntilNext11AM(),
      staleTime: ONE_DAY,
      refetchOnWindowFocus: false,
    })),
  });



  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
              <Gauge className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Rotating Equipment — Control Room
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                Auto-refresh daily at 11:00 AM
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "compare")}>
              <TabsList className="h-9">
                <TabsTrigger value="single" className="text-xs">Single Train</TabsTrigger>
                <TabsTrigger value="compare" className="text-xs">Compare Trains</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "single" && (
              <Select value={train} onValueChange={setTrain}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {trainNames.map((t) => (
                    <SelectItem key={t} value={t} disabled={!TRAIN_SHEETS[t]}>
                      {t} {!TRAIN_SHEETS[t] && "(no URL)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (mode === "single") {
                  query.refetch();
                  siteQuery.refetch();
                } else {
                  compareQueries.forEach((q) => q.refetch());
                  siteQuery.refetch();
                }
              }}
              disabled={
                mode === "single"
                  ? query.isFetching || siteQuery.isFetching
                  : compareQueries.some((q) => q.isFetching)
              }
            >
              <RefreshCw
                className={`size-4 ${
                  (mode === "single"
                    ? query.isFetching || siteQuery.isFetching
                    : compareQueries.some((q) => q.isFetching))
                    ? "animate-spin"
                    : ""
                }`}
              />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6 space-y-6">
        {mode === "single" && (
          <>
            {!url && <NoUrl train={train} />}
            {url && query.isLoading && <Loading />}
            {url && query.error && <ErrorView error={query.error as Error} />}
            {url && query.data && (
              <DashboardBody
                key={train}
                data={query.data.rows}
                columns={query.data.columns}
                train={train}
                siteRows={siteQuery.data?.rows}
                siteColumns={siteQuery.data?.columns}
                siteLoading={siteQuery.isLoading}
                siteError={siteQuery.error as Error | null}
              />
            )}
          </>
        )}
        {mode === "compare" && (
          <CompareView
            trainNames={trainNames}
            queries={compareQueries.map((q, i) => ({
              train: trainNames[i],
              data: q.data,
              isLoading: q.isLoading,
              error: q.error as Error | null,
            }))}
          />
        )}

      </main>
    </div>
  );
}

function NoUrl({ train }: { train: string }) {
  return (
    <Card className="border-warning/30">
      <CardContent className="py-8 text-center space-y-2">
        <AlertTriangle className="size-8 text-warning mx-auto" />
        <p className="font-medium">No published CSV URL for {train}</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Open the Google Sheet → <span className="font-mono">File → Share → Publish to web</span>{" "}
          → select the sheet → CSV → copy the link, then paste it into{" "}
          <span className="font-mono">src/lib/sheets-config.ts</span>.
        </p>
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="grid gap-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="h-32" />
        </Card>
      ))}
    </div>
  );
}

function ErrorView({ error }: { error: Error }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="py-6">
        <p className="text-destructive font-medium">Failed to load data</p>
        <p className="text-sm text-muted-foreground mt-1 font-mono">
          {error.message}
        </p>
      </CardContent>
    </Card>
  );
}

function DashboardBody({
  data,
  columns,
  train,
  siteRows,
  siteColumns,
  siteLoading,
  siteError,
}: {
  data: Row[];
  columns: string[];
  train: string;
  siteRows?: Row[];
  siteColumns?: string[];
  siteLoading?: boolean;
  siteError?: Error | null;
}) {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupColumns(columns), [columns]);
  const groupNames = Object.keys(groups);

  // -- Time frame (date range) applied to BOTH the train sheet and the
  //    Site Conditions sheet so the user can extract a consistent slice.
  const overallRange = useMemo(() => {
    const all: number[] = [];
    for (const r of data) if (r.__timestamp) all.push(r.__timestamp.getTime());
    for (const r of siteRows ?? [])
      if (r.__timestamp) all.push(r.__timestamp.getTime());
    if (!all.length) return null;
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [data, siteRows]);

  const toInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const fromMs = from ? new Date(from + "T00:00:00").getTime() : null;
  const toMs = to ? new Date(to + "T23:59:59").getTime() : null;

  const inRange = (r: Row) => {
    const t = r.__timestamp?.getTime();
    if (t == null) return false;
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    return true;
  };

  const filteredData = useMemo(
    () => (fromMs || toMs ? data.filter(inRange) : data),
    [data, fromMs, toMs]
  );
  const filteredSite = useMemo(
    () => (siteRows ? (fromMs || toMs ? siteRows.filter(inRange) : siteRows) : []),
    [siteRows, fromMs, toMs]
  );

  const siteSplit = useMemo(
    () => (siteColumns ? splitSiteColumns(siteColumns) : null),
    [siteColumns]
  );
  const siteGeneral = siteSplit?.general ?? [];
  const siteForTrain = siteSplit?.byTrain[train] ?? [];

  // Build the full set of section tabs, including Site Conditions.
  type TabDef = {
    key: string;
    label: string;
    count: number;
    sensors: string[];
    source: "train" | "site";
  };
  const allTabs = useMemo<TabDef[]>(() => {
    const tabs: TabDef[] = groupNames.map((g) => ({
      key: g,
      label: g,
      count: groups[g].length,
      sensors: groups[g],
      source: "train",
    }));
    if (siteGeneral.length)
      tabs.push({
        key: "__site_general__",
        label: "Site — General",
        count: siteGeneral.length,
        sensors: siteGeneral,
        source: "site",
      });
    if (siteForTrain.length)
      tabs.push({
        key: "__site_train__",
        label: `Site — ${train}`,
        count: siteForTrain.length,
        sensors: siteForTrain,
        source: "site",
      });
    return tabs;
  }, [groupNames, groups, siteGeneral, siteForTrain, train]);

  const [activeGroup, setActiveGroup] = useState(allTabs[0]?.key ?? "");
  if (activeGroup && !allTabs.find((t) => t.key === activeGroup)) {
    // active tab disappeared after data shape change
    setActiveGroup(allTabs[0]?.key ?? "");
  }

  const latest = filteredData[filteredData.length - 1];
  const previous = filteredData[filteredData.length - 2];

  const kpis = useMemo(
    () => [
      ...buildKpis(filteredData, columns),
      ...buildSiteKpis(filteredSite, siteColumns ?? [], train),
    ],
    [filteredData, columns, filteredSite, siteColumns, train]
  );
  const visibleKpis = useMemo(
    () => kpis.filter((k) => k.groups && k.groups.includes(activeGroup)),
    [kpis, activeGroup]
  );


  return (
    <div className="space-y-6">
      {/* Status strip + Time Frame */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">
              {filteredData.length}/{data.length} train · {filteredSite.length}/
              {siteRows?.length ?? 0} site · last:{" "}
              <span className="text-foreground">
                {latest?.__timestamp
                  ? format(latest.__timestamp, "PP HH:mm")
                  : "—"}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Time frame
            </span>
            <Input
              type="date"
              value={from}
              min={overallRange ? toInput(overallRange.min) : undefined}
              max={overallRange ? toInput(overallRange.max) : undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              min={overallRange ? toInput(overallRange.min) : undefined}
              max={overallRange ? toInput(overallRange.max) : undefined}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              disabled={!from && !to}
            >
              Reset
            </Button>
            <Badge variant="outline" className="font-mono">
              <Activity className="size-3 mr-1" />
              {columns.length} sensors
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Site Conditions load state hint */}
      {siteLoading && (
        <p className="text-xs text-muted-foreground font-mono">
          Loading Site Conditions sheet…
        </p>
      )}
      {siteError && (
        <Card className="border-warning/40">
          <CardContent className="py-3 text-xs font-mono text-warning">
            Site Conditions sheet failed to load: {siteError.message}
          </CardContent>
        </Card>
      )}

      {/* KPI grid — filtered by the currently selected system/page */}
      {visibleKpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {visibleKpis.map((k) => (
            <KpiCard key={k.label} {...k} previous={previous} />
          ))}
        </div>
      )}


      {/* Sections — sidebar pages */}
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Card className="md:sticky md:top-24 md:self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Pages
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="max-h-[70vh]">
              <nav className="flex flex-col gap-1">
                {allTabs.map((g) => {
                  const active = g.key === activeGroup;
                  return (
                    <button
                      key={g.key}
                      onClick={() => setActiveGroup(g.key)}
                      className={`text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center justify-between gap-2 ${
                        active
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "hover:bg-muted/60 text-foreground/80"
                      }`}
                    >
                      <span className="truncate">{g.label}</span>
                      <span className="text-xs opacity-60 font-mono">
                        {g.count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </ScrollArea>
          </CardContent>
        </Card>
        <div className="min-w-0">
          {allTabs
            .filter((g) => g.key === activeGroup)
            .map((g) => (
              <SectionView
                key={g.key}
                sensors={g.sensors}
                data={g.source === "site" ? filteredSite : filteredData}
                sectionName={g.label}
              />
            ))}
        </div>
      </div>

      {/* Raw data */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Raw Readings</CardTitle>
            <Input
              placeholder="Filter columns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs h-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <RawTable data={filteredData} columns={columns} search={search} />
        </CardContent>
      </Card>
    </div>
  );
}

interface Kpi {
  label: string;
  value: number | null;
  column: string;
  unit?: string;
  tone?: "default" | "warning" | "danger";
  groups?: string[];
}

function buildKpis(data: Row[], columns: string[]): Kpi[] {
  if (!data.length) return [];
  const latest = data[data.length - 1];
  const groups = groupColumns(columns);
  const pick = (re: RegExp): string | undefined =>
    columns.find((c) => re.test(c));

  const lubeP = pick(/lube oil header p/i);
  const lubeT = pick(/lube oil header t/i);
  const oilTank = pick(/oil temp.*main tank/i);
  const fsr = pick(/^fsr/i);
  const exhaustMean = pick(/exhaust temperature.*mean/i);

  // Max bearing temp & max vibration across all sensors
  const tempCols = columns.filter((c) => /bearing.*temp/i.test(c));
  const vibCols = columns.filter((c) => /vibration/i.test(c));
  const maxNum = (cols: string[]) =>
    cols.reduce<number | null>((m, c) => {
      const v = latest[c];
      if (typeof v === "number" && (m === null || v > m)) return v;
      return m;
    }, null);
  const minNum = (cols: string[]) =>
    cols.reduce<number | null>((m, c) => {
      const v = latest[c];
      if (typeof v === "number" && (m === null || v < m)) return v;
      return m;
    }, null);
  const avgNum = (cols: string[]) => {
    const values = cols
      .map((c) => latest[c])
      .filter((v): v is number => typeof v === "number");
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  const BEARING_TEMP_GROUPS = [
    "Turbine Bearings — Temperature",
    "Compressor Bearings — Temperature",
    "Gearbox Bearings — Temperature",
  ];
  const VIB_GROUPS = [
    "Turbine Bearings — Vibration",
    "Compressor Bearings — Vibration",
    "Gearbox Bearings — Vibration",
  ];

  const items: Kpi[] = [
    { label: "Lube Oil P", value: getNum(latest, lubeP), column: lubeP ?? "", unit: "bar", groups: ["Lube Oil"] },
    { label: "Lube Oil T", value: getNum(latest, lubeT), column: lubeT ?? "", unit: "°C", groups: ["Lube Oil"] },
    { label: "Oil Tank T", value: getNum(latest, oilTank), column: oilTank ?? "", unit: "°C", groups: ["Lube Oil"] },
    { label: "Exhaust Mean", value: getNum(latest, exhaustMean), column: exhaustMean ?? "", unit: "°C", groups: ["Exhaust"] },
    { label: "Max Bearing T", value: maxNum(tempCols), column: "", unit: "°C", groups: BEARING_TEMP_GROUPS },
    { label: "Max Vibration", value: maxNum(vibCols), column: "", unit: "mm/s", groups: VIB_GROUPS },
    { label: "FSR", value: getNum(latest, fsr), column: fsr ?? "", unit: "%", groups: ["Control"] },
  ].filter((k) => k.value !== null);

  // Add per-group generic KPIs (max / min / average) so every system has at least 2 cards.
  for (const [groupName, groupCols] of Object.entries(groups)) {
    if (groupCols.length === 0) continue;
    const max = maxNum(groupCols);
    const min = minNum(groupCols);
    const avg = avgNum(groupCols);
    if (max !== null)
      items.push({ label: "Max Value", value: max, column: "", unit: "", groups: [groupName] });
    if (min !== null)
      items.push({ label: "Min Value", value: min, column: "", unit: "", groups: [groupName] });
    if (avg !== null)
      items.push({ label: "Average Value", value: avg, column: "", unit: "", groups: [groupName] });
  }

  // Tone heuristics
  return items.map((k) => {
    if (k.label === "Max Bearing T" && k.value && k.value > 85)
      return { ...k, tone: k.value > 95 ? "danger" : "warning" };
    if (k.label === "Max Vibration" && k.value && k.value > 7)
      return { ...k, tone: k.value > 10 ? "danger" : "warning" };
    return k;
  });
}

function buildSiteKpis(data: Row[], columns: string[], train: string): Kpi[] {
  if (!data.length || !columns.length) return [];
  const latest = data[data.length - 1];
  const split = splitSiteColumns(columns);
  const groups: Record<string, string[]> = {
    "__site_general__": split.general,
    "__site_train__": split.byTrain[train] ?? [],
  };

  const maxNum = (cols: string[]) =>
    cols.reduce<number | null>((m, c) => {
      const v = latest[c];
      if (typeof v === "number" && (m === null || v > m)) return v;
      return m;
    }, null);
  const minNum = (cols: string[]) =>
    cols.reduce<number | null>((m, c) => {
      const v = latest[c];
      if (typeof v === "number" && (m === null || v < m)) return v;
      return m;
    }, null);
  const avgNum = (cols: string[]) => {
    const values = cols
      .map((c) => latest[c])
      .filter((v): v is number => typeof v === "number");
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  const items: Kpi[] = [];
  for (const [groupKey, groupCols] of Object.entries(groups)) {
    if (groupCols.length === 0) continue;
    const max = maxNum(groupCols);
    const min = minNum(groupCols);
    const avg = avgNum(groupCols);
    if (max !== null)
      items.push({ label: "Max Value", value: max, column: "", unit: "", groups: [groupKey] });
    if (min !== null)
      items.push({ label: "Min Value", value: min, column: "", unit: "", groups: [groupKey] });
    if (avg !== null)
      items.push({ label: "Average Value", value: avg, column: "", unit: "", groups: [groupKey] });
  }
  return items;
}


function getNum(row: Row | undefined, col?: string): number | null {
  if (!row || !col) return null;
  const v = row[col];
  return typeof v === "number" ? v : null;
}

function KpiCard({
  label,
  value,
  unit,
  tone = "default",
  previous,
  column,
}: Kpi & { previous?: Row }) {
  const prev = column ? getNum(previous, column) : null;
  const delta = value !== null && prev !== null ? value - prev : null;
  const toneClass =
    tone === "danger"
      ? "border-destructive/50 bg-destructive/5"
      : tone === "warning"
      ? "border-warning/40 bg-warning/5"
      : "";
  return (
    <Card className={toneClass}>
      <CardContent className="py-4 px-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-mono font-semibold mt-1">
          {value !== null ? value.toFixed(1) : "—"}
          {unit && (
            <span className="text-sm text-muted-foreground ml-1">{unit}</span>
          )}
        </p>
        {delta !== null && (
          <p
            className={`text-xs font-mono mt-0.5 ${
              Math.abs(delta) < 0.05
                ? "text-muted-foreground"
                : delta > 0
                ? "text-warning"
                : "text-accent"
            }`}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta).toFixed(2)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type PanelKind = "line" | "bar" | "area";
type BarMode = "snapshot" | "timeseries";
type BarOrient = "vertical" | "horizontal";

interface ChartPanelConfig {
  id: string;
  kind: PanelKind;
  sensors: string[];
  barMode?: BarMode;
  barOrient?: BarOrient;
}

let panelCounter = 0;
const nextPanelId = () => `p${++panelCounter}_${Date.now().toString(36)}`;

function SectionView({
  sensors,
  data,
  sectionName,
}: {
  sensors: string[];
  data: Row[];
  sectionName: string;
}) {
  // Default: two panels (Line + Bar) sharing the first sensors.
  const initialSensors = sensors.slice(0, Math.min(4, sensors.length));
  const [panels, setPanels] = useState<ChartPanelConfig[]>(() => [
    { id: nextPanelId(), kind: "line", sensors: initialSensors },
    {
      id: nextPanelId(),
      kind: "bar",
      sensors: sensors.slice(0, Math.min(3, sensors.length)),
    },
  ]);
  const [cols, setCols] = useState<1 | 2 | 3>(2);

  const addPanel = (kind: PanelKind) =>
    setPanels((p) => [
      ...p,
      { id: nextPanelId(), kind, sensors: sensors.slice(0, Math.min(3, sensors.length)) },
    ]);
  const removePanel = (id: string) =>
    setPanels((p) => p.filter((x) => x.id !== id));
  const updatePanel = (id: string, patch: Partial<ChartPanelConfig>) =>
    setPanels((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const gridClass =
    cols === 1
      ? "grid-cols-1"
      : cols === 2
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">
            {sectionName} · {panels.length} chart{panels.length !== 1 && "s"}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => addPanel("line")}
          >
            <Plus className="size-3 mr-1" /> Line
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => addPanel("bar")}
          >
            <Plus className="size-3 mr-1" /> Bar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => addPanel("area")}
          >
            <Plus className="size-3 mr-1" /> Area
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Layout</span>
          <Button
            size="icon"
            variant={cols === 1 ? "default" : "outline"}
            className="size-8"
            onClick={() => setCols(1)}
            title="1 column"
          >
            <Rows className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant={cols === 2 ? "default" : "outline"}
            className="size-8"
            onClick={() => setCols(2)}
            title="2 columns"
          >
            <Columns2 className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant={cols === 3 ? "default" : "outline"}
            className="size-8"
            onClick={() => setCols(3)}
            title="3 columns"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>
      </div>

      {panels.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No charts. Use the buttons above to add one.
          </CardContent>
        </Card>
      ) : (
        <div className={`grid gap-4 ${gridClass}`}>
          {panels.map((panel) => (
            <ChartPanel
              key={panel.id}
              config={panel}
              data={data}
              allSensors={sensors}
              onChange={(patch) => updatePanel(panel.id, patch)}
              onRemove={() => removePanel(panel.id)}
              canRemove={panels.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChartPanel({
  config,
  data,
  allSensors,
  onChange,
  onRemove,
  canRemove,
}: {
  config: ChartPanelConfig;
  data: Row[];
  allSensors: string[];
  onChange: (patch: Partial<ChartPanelConfig>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { kind, sensors } = config;
  const barMode: BarMode = config.barMode ?? "snapshot";
  const barOrient: BarOrient = config.barOrient ?? "vertical";

  const chartData = useMemo(
    () =>
      data
        .filter((r) => r.__timestamp)
        .map((r) => {
          const o: Record<string, string | number | null> = {
            t: format(r.__timestamp as Date, "MM/dd HH:mm"),
          };
          for (const s of sensors) {
            const v = r[s];
            o[s] = typeof v === "number" ? v : null;
          }
          return o;
        }),
    [data, sensors]
  );

  // Snapshot: one bar per sensor using the latest non-null value.
  const snapshotData = useMemo(() => {
    return sensors.map((s) => {
      let val: number | null = null;
      for (let i = data.length - 1; i >= 0; i--) {
        const v = data[i][s];
        if (typeof v === "number") {
          val = v;
          break;
        }
      }
      return { sensor: shortName(s), value: val };
    });
  }, [data, sensors]);

  // Time-series bars: down-sample to last ~24 points so bars stay readable.
  const displayData =
    kind === "bar" && barMode === "timeseries" ? chartData.slice(-24) : chartData;

  const toggleSensor = (s: string) => {
    const next = sensors.includes(s)
      ? sensors.filter((x) => x !== s)
      : [...sensors, s];
    onChange({ sensors: next });
  };

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
      <XAxis
        dataKey="t"
        stroke="var(--color-muted-foreground)"
        fontSize={10}
        tickMargin={6}
      />
      <YAxis
        stroke="var(--color-muted-foreground)"
        fontSize={10}
        tickMargin={4}
        domain={[
          (dataMin: number) => (Number.isFinite(dataMin) ? dataMin - Math.max(Math.abs(dataMin) * 0.05, 0.5) : 0),
          (dataMax: number) => (Number.isFinite(dataMax) ? dataMax + Math.max(Math.abs(dataMax) * 0.05, 0.5) : 1),
        ]}
        allowDataOverflow={false}
      />
      <Tooltip
        contentStyle={{
          background: "var(--color-popover)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          fontSize: 12,
        }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 justify-between flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Select
              value={kind}
              onValueChange={(v) => onChange({ kind: v as PanelKind })}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="area">Area</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {sensors.length}/{allSensors.length} selected
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange({ sensors: [...allSensors] })}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange({ sensors: [] })}
              >
                None
              </Button>
            </div>
            {kind === "bar" && (
              <div className="flex items-center gap-1">
                <Select
                  value={barMode}
                  onValueChange={(v) => onChange({ barMode: v as BarMode })}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="snapshot">Snapshot (latest)</SelectItem>
                    <SelectItem value="timeseries">Time series</SelectItem>
                  </SelectContent>
                </Select>
                {barMode === "snapshot" && (
                  <Select
                    value={barOrient}
                    onValueChange={(v) => onChange({ barOrient: v as BarOrient })}
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vertical">Vertical</SelectItem>
                      <SelectItem value="horizontal">Horizontal</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onRemove}
              title="Remove chart"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[88px] mb-2 rounded-md border bg-muted/30 p-2">
          <div className="flex flex-wrap gap-1">
            {allSensors.length === 0 ? (
              <span className="text-xs text-muted-foreground">No sensors in this group.</span>
            ) : (
              allSensors.map((s) => {
                const active = sensors.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSensor(s)}
                    className={`text-[11px] px-2 py-1 rounded-md font-mono transition-colors ${
                      active
                        ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                        : "bg-background hover:bg-muted text-muted-foreground border"
                    }`}
                  >
                    {shortName(s)}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
        <div className="h-[320px]">
          {sensors.length === 0 ? (
            <div className="h-full grid place-items-center text-xs text-muted-foreground">
              Pick sensors from the menu above
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {kind === "line" ? (
                <LineChart data={displayData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  {commonAxes}
                  {sensors.map((s, i) => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      name={shortName(s)}
                    />
                  ))}
                </LineChart>
              ) : kind === "bar" ? (
                barMode === "snapshot" ? (
                  <BarChart
                    data={snapshotData}
                    layout={barOrient === "horizontal" ? "vertical" : "horizontal"}
                    margin={{ top: 10, right: 20, left: barOrient === "horizontal" ? 40 : -10, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    {barOrient === "horizontal" ? (
                      <>
                        <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={10} />
                        <YAxis
                          type="category"
                          dataKey="sensor"
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          width={140}
                          tick={{ fontSize: 10 }}
                        />
                      </>
                    ) : (
                      <>
                        <XAxis
                          dataKey="sensor"
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          angle={-25}
                          textAnchor="end"
                          interval={0}
                          height={70}
                        />
                        <YAxis stroke="var(--color-muted-foreground)" fontSize={10} />
                      </>
                    )}
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {snapshotData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position={barOrient === "horizontal" ? "right" : "top"}
                        style={{ fill: "var(--color-foreground)", fontSize: 10, fontFamily: "monospace" }}
                        formatter={(v: unknown) =>
                          typeof v === "number" ? v.toFixed(2) : ""
                        }
                      />
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={displayData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    {commonAxes}
                    {sensors.map((s, i) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        name={shortName(s)}
                      />
                    ))}
                  </BarChart>
                )
              ) : (
                <AreaChart data={displayData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  {commonAxes}
                  {sensors.map((s, i) => (
                    <Area
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.2}
                      strokeWidth={1.5}
                      connectNulls
                      name={shortName(s)}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function shortName(s: string) {
  // Strip trailing tag like (TE-1428) for the legend but keep readable
  return s.replace(/\s+/g, " ").trim();
}

function RawTable({
  data,
  columns,
  search,
}: {
  data: Row[];
  columns: string[];
  search: string;
}) {
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const visible = columns.filter(
      (c) => c !== "Timestamp" && (!s || c.toLowerCase().includes(s))
    );
    return visible;
  }, [columns, search]);

  const last20 = data.slice(-20).reverse();

  return (
    <ScrollArea className="h-[420px] w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">
              Timestamp
            </TableHead>
            {filtered.map((c) => (
              <TableHead key={c} className="whitespace-nowrap text-xs font-mono">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {last20.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="sticky left-0 bg-card font-mono text-xs whitespace-nowrap">
                {r.__timestamp ? format(r.__timestamp, "MM/dd HH:mm") : "—"}
              </TableCell>
              {filtered.map((c) => {
                const v = r[c];
                return (
                  <TableCell key={c} className="font-mono text-xs">
                    {v === null || v === undefined
                      ? "—"
                      : typeof v === "number"
                      ? v.toFixed(2)
                      : String(v)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

// ===================== Compare Trains =====================

interface CompareQuery {
  train: string;
  data?: { columns: string[]; rows: Row[] };
  isLoading: boolean;
  error: Error | null;
}

type ChartKind = "line" | "bar" | "heatmap" | "pie";

function CompareView({
  trainNames,
  queries,
}: {
  trainNames: string[];
  queries: CompareQuery[];
}) {
  const loaded = queries.filter((q) => q.data);
  const anyLoading = queries.some((q) => q.isLoading);
  const errors = queries.filter((q) => q.error);

  // Union of sensor columns across all loaded trains
  const allColumns = useMemo(() => {
    const set = new Set<string>();
    for (const q of loaded) for (const c of q.data!.columns) set.add(c);
    return Array.from(set);
  }, [loaded]);

  const groups = useMemo(() => groupColumns(allColumns), [allColumns]);
  const groupNames = Object.keys(groups);
  const [activeGroup, setActiveGroup] = useState<string>(groupNames[0] ?? "");
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [selectedTrains, setSelectedTrains] = useState<string[]>(trainNames);
  const [chartKind, setChartKind] = useState<ChartKind>("line");

  const sensorsInGroup = groups[activeGroup] ?? [];

  // Auto-pick first sensor when group changes and nothing valid is selected
  const effectiveSensors = useMemo(() => {
    const valid = selectedSensors.filter((s) => sensorsInGroup.includes(s));
    if (valid.length) return valid;
    return sensorsInGroup.slice(0, 1);
  }, [selectedSensors, sensorsInGroup]);

  const activeTrains = useMemo(
    () => selectedTrains.filter((t) => queries.find((q) => q.train === t)?.data),
    [selectedTrains, queries]
  );

  // Series = one line/bar per (train × sensor) combination
  const series = useMemo(() => {
    const out: { key: string; train: string; sensor: string; label: string }[] = [];
    for (const t of activeTrains) {
      for (const s of effectiveSensors) {
        out.push({
          key: `${t} · ${s}`,
          train: t,
          sensor: s,
          label: effectiveSensors.length > 1 ? `${t} · ${shortName(s)}` : t,
        });
      }
    }
    return out;
  }, [activeTrains, effectiveSensors]);

  // Time-series merged data
  const chartData = useMemo(() => {
    if (series.length === 0) return [];
    const map = new Map<string, Record<string, string | number | null>>();
    for (const q of loaded) {
      if (!activeTrains.includes(q.train)) continue;
      for (const row of q.data!.rows) {
        if (!row.__timestamp) continue;
        const key = format(row.__timestamp, "MM/dd HH:mm");
        let entry = map.get(key);
        if (!entry) {
          entry = { t: key };
          map.set(key, entry);
        }
        for (const s of effectiveSensors) {
          const v = row[s];
          entry[`${q.train} · ${s}`] = typeof v === "number" ? v : null;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.t).localeCompare(String(b.t))
    );
  }, [loaded, series, effectiveSensors, activeTrains]);

  // Latest reading per series (used by bar/pie)
  const latestPerSeries = useMemo(() => {
    return series.map((s) => {
      const q = queries.find((x) => x.train === s.train);
      const rows = q?.data?.rows ?? [];
      let val: number | null = null;
      for (let i = rows.length - 1; i >= 0; i--) {
        const v = rows[i][s.sensor];
        if (typeof v === "number") {
          val = v;
          break;
        }
      }
      return { ...s, value: val };
    });
  }, [series, queries]);

  const toggleTrain = (t: string) =>
    setSelectedTrains((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );

  const toggleSensor = (s: string) =>
    setSelectedSensors((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  if (anyLoading && loaded.length === 0) return <Loading />;

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive font-mono">
            Failed to load: {errors.map((e) => e.train).join(", ")}
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider w-16">
              Trains
            </span>
            {trainNames.map((t) => {
              const active = selectedTrains.includes(t);
              const q = queries.find((x) => x.train === t);
              const disabled = !q?.data;
              return (
                <button
                  key={t}
                  disabled={disabled}
                  onClick={() => toggleTrain(t)}
                  className={`text-xs px-2.5 py-1 rounded-md font-mono transition-colors ${
                    disabled
                      ? "opacity-40 cursor-not-allowed border border-border"
                      : active
                      ? "bg-primary/15 ring-1 ring-primary/30 text-foreground"
                      : "border border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider w-16">
              Chart
            </span>
            {(["line", "bar", "heatmap", "pie"] as ChartKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setChartKind(k)}
                className={`text-xs px-2.5 py-1 rounded-md font-mono capitalize transition-colors ${
                  chartKind === k
                    ? "bg-primary/15 ring-1 ring-primary/30 text-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {k}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Select value={activeGroup} onValueChange={setActiveGroup}>
                <SelectTrigger className="w-[220px] h-8 text-xs">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  {groupNames.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {effectiveSensors.length === 1
                ? `${effectiveSensors[0]} — across trains`
                : `${effectiveSensors.length} sensors × ${activeTrains.length} trains`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[460px]">
              {series.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">
                  Select at least one sensor and one train
                </div>
              ) : chartKind === "line" ? (
                <LineCompare data={chartData} series={series} />
              ) : chartKind === "bar" ? (
                <BarCompare data={chartData} series={series} />
              ) : chartKind === "pie" ? (
                <PieCompare latest={latestPerSeries} />
              ) : (
                <HeatmapCompare data={chartData} series={series} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sensor multi-select */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sensors ({effectiveSensors.length}/{sensorsInGroup.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <ScrollArea className="h-[460px] pr-2">
              <div className="space-y-1">
                {sensorsInGroup.map((s) => {
                  const active = effectiveSensors.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSensor(s)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors font-mono ${
                        active
                          ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {shortName(s)}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Latest value summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Latest readings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {latestPerSeries.map((s) => (
              <Card key={s.key} className="bg-muted/30">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">
                    {s.train}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate">
                    {shortName(s.sensor)}
                  </p>
                  <p className="text-xl font-mono font-semibold mt-1">
                    {typeof s.value === "number" ? s.value.toFixed(2) : "—"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- chart variants ----------

type Series = { key: string; train: string; sensor: string; label: string };

function LineCompare({
  data,
  series,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="t" stroke="var(--color-muted-foreground)" fontSize={11} tickMargin={6} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickMargin={4} />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={1.8}
            dot={false}
            connectNulls
            name={s.label}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarCompare({
  data,
  series,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
}) {
  // Show only the most recent 24 timestamps so bars are legible
  const trimmed = data.slice(-24);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={trimmed} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="t" stroke="var(--color-muted-foreground)" fontSize={11} tickMargin={6} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickMargin={4} />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            name={s.label}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieCompare({
  latest,
}: {
  latest: (Series & { value: number | null })[];
}) {
  const items = latest
    .filter((d) => typeof d.value === "number" && (d.value as number) > 0)
    .map((d) => ({ name: d.label, value: d.value as number }));
  if (items.length === 0) {
    return (
      <div className="h-full grid place-items-center text-sm text-muted-foreground">
        No positive latest values to render as a pie
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={items}
          dataKey="value"
          nameKey="name"
          outerRadius="75%"
          label={(d) => d.name}
        >
          {items.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function HeatmapCompare({
  data,
  series,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
}) {
  // Use the most recent N timestamps so cells stay visible
  const N = 40;
  const slice = data.slice(-N);
  if (slice.length === 0 || series.length === 0) {
    return (
      <div className="h-full grid place-items-center text-sm text-muted-foreground">
        No data to render
      </div>
    );
  }

  // Compute min/max per series for row-normalised color
  const stats = series.map((s) => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of slice) {
      const v = row[s.key];
      if (typeof v === "number") {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min, max };
  });

  return (
    <ScrollArea className="h-full w-full">
      <div className="min-w-fit">
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `180px repeat(${slice.length}, 22px)`,
          }}
        >
          {/* Header row */}
          <div className="text-[10px] font-mono text-muted-foreground sticky left-0 bg-card px-2 py-1">
            sensor · train
          </div>
          {slice.map((row, i) => (
            <div
              key={i}
              className="text-[9px] font-mono text-muted-foreground -rotate-90 origin-left h-6 translate-y-5 whitespace-nowrap"
            >
              {String(row.t)}
            </div>
          ))}

          {/* Data rows */}
          {series.map((s, rIdx) => {
            const { min, max } = stats[rIdx];
            const range = max - min || 1;
            return (
              <Fragment key={s.key}>
                <div
                  key={`label-${s.key}`}
                  className="text-[10px] font-mono px-2 py-1 truncate sticky left-0 bg-card border-r border-border"
                  title={s.key}
                >
                  {s.label}
                </div>
                {slice.map((row, cIdx) => {
                  const v = row[s.key];
                  const n = typeof v === "number" ? (v - min) / range : null;
                  const bg =
                    n === null
                      ? "transparent"
                      : `color-mix(in oklab, var(--color-primary) ${Math.round(
                          n * 100
                        )}%, var(--color-muted))`;
                  return (
                    <div
                      key={`${s.key}-${cIdx}`}
                      className="h-6 rounded-sm"
                      style={{ background: bg }}
                      title={typeof v === "number" ? `${s.label}: ${v.toFixed(2)}` : "—"}
                    />
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}


