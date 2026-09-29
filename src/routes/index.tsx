import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
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
  TRAIN_TAG_DIGIT,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Activity, AlertTriangle, RefreshCw, Gauge, Plus, X, LayoutGrid, Columns2, Rows, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trains Operation Monitor (TOM)" },
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

// Auto-fitting Y axis: pad 5%, and snap to whole numbers once the values are
// large enough that decimals add no information.
export const Y_AUTO_DOMAIN: [
  (dataMin: number) => number,
  (dataMax: number) => number,
] = [
  (dataMin: number) => {
    if (!Number.isFinite(dataMin)) return 0;
    const v = dataMin - Math.max(Math.abs(dataMin) * 0.05, 0.5);
    return Math.abs(v) >= 5 ? Math.floor(v) : Number(v.toFixed(2));
  },
  (dataMax: number) => {
    if (!Number.isFinite(dataMax)) return 1;
    const v = dataMax + Math.max(Math.abs(dataMax) * 0.05, 0.5);
    return Math.abs(v) >= 5 ? Math.ceil(v) : Number(v.toFixed(2));
  },
];

// Kill floating-point noise on axis labels (59.99999954 → 60).
export function formatTick(v: number | string) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 5) return String(Math.round(n));
  const r = Number(n.toFixed(2));
  return String(r);
}

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

  // For compare mode (and the efficiency trend): fetch all trains in parallel
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
                Trains Operation Monitor (TOM)
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
            siteRows={siteQuery.data?.rows}
            siteColumns={siteQuery.data?.columns}
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

  // Site sensors (general + this train's) are merged into the same systems as
  // the train sheet — there is no separate "Site" section.
  const siteSensors = useMemo(() => [...siteForTrain, ...siteGeneral], [siteForTrain, siteGeneral]);
  const allSensors = useMemo(() => [...columns, ...siteSensors], [columns, siteSensors]);
  const groups = useMemo(() => groupColumns(allSensors), [allSensors]);
  const groupNames = Object.keys(groups);
  const mergedData = useMemo(() => {
    if (!filteredSite.length) return filteredData;
    const keep = new Set(siteSensors);
    const siteRowsTrim = filteredSite.map((r) => {
      const o: Row = { __timestamp: r.__timestamp } as Row;
      for (const k of Object.keys(r)) if (keep.has(k)) o[k] = r[k];
      return o;
    });
    return [...filteredData, ...siteRowsTrim].sort(
      (a, b) => (a.__timestamp?.getTime() ?? 0) - (b.__timestamp?.getTime() ?? 0),
    );
  }, [filteredData, filteredSite, siteSensors]);

  // Build the full set of section tabs.
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
    return tabs;
  }, [groupNames, groups]);

  const [activeGroup, setActiveGroup] = useState(allTabs[0]?.key ?? "");
  if (activeGroup && !allTabs.find((t) => t.key === activeGroup)) {
    // active tab disappeared after data shape change
    setActiveGroup(allTabs[0]?.key ?? "");
  }

  const latest = filteredData[filteredData.length - 1];
  const previous = filteredData[filteredData.length - 2];

  const kpis = useMemo(
    () => [
      ...buildKpis(mergedData, allSensors),
      ...buildOilCoolerKpi(filteredData, filteredSite, train),
    ],
    [filteredData, mergedData, allSensors, filteredSite, train]
  );
  const visibleKpis = useMemo(
    () => kpis.filter((k) => k.groups && k.groups.includes(activeGroup)),
    [kpis, activeGroup]
  );

  // Axial compressor isentropic efficiency — shown as a trend chart via an icon
  // on the Axial Compressor page (replaces the old efficiency KPI card).
  const [effOpen, setEffOpen] = useState(false);
  const isAxial = activeGroup === "Axial Compressor (Air)";
  const effSeries = useMemo(
    () => [{ train, points: axialEffSeries(filteredData, columns) }],
    [filteredData, columns, train]
  );

  // Raw Readings follows the active page: same rows the charts use, and by
  // default the exact sensors currently plotted.
  const [chartSensors, setChartSensors] = useState<string[]>([]);
  const [rawAll, setRawAll] = useState(false);
  const activeTab = allTabs.find((t) => t.key === activeGroup);
  // Readings are taken twice a day (09:00 and 21:00). Snap every row (train or
  // site sheet) to its nearest shift slot and merge rows sharing a slot.
  const rawData = useMemo(() => {
    const slots = new Map<number, Row>();
    for (const r of mergedData) {
      const t = r.__timestamp;
      if (!t) continue;
      const d = new Date(t);
      const h = d.getHours();
      if (h < 3) {
        d.setDate(d.getDate() - 1);
        d.setHours(21, 0, 0, 0);
      } else if (h < 15) d.setHours(9, 0, 0, 0);
      else d.setHours(21, 0, 0, 0);
      const key = d.getTime();
      const slot = slots.get(key) ?? ({ __timestamp: d } as Row);
      for (const k of Object.keys(r)) {
        if (k === "__timestamp") continue;
        const v = r[k];
        if (v !== null && v !== undefined && v !== "") slot[k] = v;
      }
      slots.set(key, slot);
    }
    return [...slots.values()].sort(
      (a, b) => (a.__timestamp?.getTime() ?? 0) - (b.__timestamp?.getTime() ?? 0),
    );
  }, [mergedData]);
  const rawColumns = useMemo(() => {
    const pageSensors = activeTab?.sensors ?? [];
    if (rawAll || chartSensors.length === 0) return pageSensors;
    const inPage = chartSensors.filter((s) => pageSensors.includes(s));
    return inPage.length ? inPage : pageSensors;
  }, [rawAll, chartSensors, activeTab]);



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

      {/* Axial compressor efficiency trend — icon shown only on that page */}
      {isAxial && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Axial compressor isentropic efficiency trend"
            aria-label="Axial compressor isentropic efficiency trend"
            onClick={() => setEffOpen(true)}
          >
            <TrendingUp className="size-4 text-primary" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Isentropic efficiency trend — {train}
          </span>
        </div>
      )}
      <EffTrendDialog open={effOpen} onOpenChange={setEffOpen} series={effSeries} />

      {/* KPI grid — filtered by the currently selected system/page */}
      {visibleKpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {visibleKpis.map((k, i) => (
            <KpiCard key={`${k.label}-${i}`} {...k} previous={previous} />
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
                data={mergedData}
                sectionName={g.label}
                onSelectionChange={setChartSensors}
              />
            ))}
        </div>
      </div>

      {/* Raw data — mirrors the active page and the sensors plotted in it */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Raw Readings</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {activeTab?.label ?? "—"} · {rawColumns.length} sensor
                {rawColumns.length !== 1 && "s"} · {rawData.length} reading
                {rawData.length !== 1 && "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={rawAll ? "outline" : "default"}
                className="h-8 text-xs"
                onClick={() => setRawAll(false)}
              >
                Charted sensors
              </Button>
              <Button
                size="sm"
                variant={rawAll ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setRawAll(true)}
              >
                All in page
              </Button>
              <Input
                placeholder="Filter columns…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs h-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RawTable data={rawData} columns={rawColumns} search={search} />
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

// Isentropic efficiency of an axial air compressor from the latest row.
// User equation: ηc = T1 * [(P2/P1)^((γ−1)/γ) − 1] / (T2 − T1)
// P1 is recorded ABSOLUTE (barometric), P2 is GAUGE → convert P2 only.
function axialEffForRow(row: Row, columns: string[]): number | null {
  const P_ATM = 1.01325;
  const gamma = 1.4;
  const exp = (gamma - 1) / gamma;
  const avg = (cols: string[]): number | null => {
    const vs = cols.map((c) => row[c]).filter((v): v is number => typeof v === "number");
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  };
  // Some sheets mislabel a pressure column as "Air Temp." (e.g.
  // "Air Temp. at Axial Compressor Discharge (PT-2203B)"), so classify by the
  // instrument tag (PT/PI/PDI = pressure, TE/TI/TC = temperature) and fall back
  // to the wording only when there is no tag.
  const isPressure = (c: string) => /\(\s*P[A-Z]*-/i.test(c) || (!/\([A-Z]+-/i.test(c) && /press/i.test(c));
  const isTemp = (c: string) => /\(\s*T[A-Z]*-/i.test(c) || (!/\([A-Z]+-/i.test(c) && /temp/i.test(c));
  const atSuction = (c: string) => /axial compressor suction/i.test(c);
  const atDischarge = (c: string) => /axial compressor discharge/i.test(c);
  const suctionT = columns.filter((c) => atSuction(c) && isTemp(c));
  const suctionP = columns.filter((c) => atSuction(c) && isPressure(c));
  const dischargeP = columns.filter((c) => atDischarge(c) && isPressure(c));
  const dischargeT = columns.filter((c) => atDischarge(c) && isTemp(c));
  const t1C = avg(suctionT);
  const p1r = avg(suctionP);
  const p2g = avg(dischargeP);
  const t2C = avg(dischargeT);
  if (t1C === null || p1r === null || p2g === null || t2C === null) return null;
  const T1 = t1C + 273.15;
  const T2 = t2C + 273.15;
  const P1 = p1r; // already absolute
  const P2 = p2g + P_ATM; // gauge → absolute
  if (T1 <= 0 || P1 <= 0 || P2 <= P1 || T2 <= T1) return null;
  const eff = (T1 * (Math.pow(P2 / P1, exp) - 1)) / (T2 - T1);
  if (!Number.isFinite(eff) || eff <= 0 || eff > 1.05) return null;
  return eff * 100;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Centered rolling median (odd window) — removes single-point spikes without
// shifting the trend in time.
function rollingMedian(vals: number[], win: number) {
  const half = Math.floor(win / 2);
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - half), Math.min(vals.length, i + half + 1));
    return median(slice);
  });
}

// Time-series of isentropic efficiency for one train.
// Instrument noise (a temperature or pressure reading briefly off) produces
// non-physical jumps, so the raw series is cleaned in three stages:
//  1. hard physical bounds
//  2. robust outlier rejection (median + MAD)
//  3. centered rolling median smoothing
// What is left is the slow degradation / washing-recovery behaviour.
export function axialEffSeries(
  data: Row[],
  columns: string[],
): { ts: number; eff: number }[] {
  const raw: { ts: number; eff: number }[] = [];
  for (const r of data) {
    const eff = axialEffForRow(r, columns);
    const ts = r.__timestamp?.getTime();
    // Axial compressors realistically sit between 60% and 95%.
    if (eff !== null && ts && eff >= 50 && eff <= 100) raw.push({ ts, eff });
  }
  raw.sort((a, b) => a.ts - b.ts);
  if (raw.length < 5) return raw;

  const vals = raw.map((p) => p.eff);
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med))) || 1e-6;
  // 3 * 1.4826 * MAD ≈ 3 sigma for normally distributed noise.
  const limit = 3 * 1.4826 * mad;
  const kept = raw.filter((p) => Math.abs(p.eff - med) <= limit);
  const base = kept.length >= 5 ? kept : raw;

  const win = Math.min(7, base.length % 2 ? base.length : base.length - 1);
  const smoothed = rollingMedian(
    base.map((p) => p.eff),
    Math.max(3, win),
  );
  return base.map((p, i) => ({ ts: p.ts, eff: smoothed[i] }));
}


function EffTrendChart({
  series,
}: {
  series: { train: string; points: { ts: number; eff: number }[] }[];
}) {
  const { data, keys } = useMemo(() => {
    const byTs = new Map<number, Record<string, number | string>>();
    for (const s of series)
      for (const p of s.points) {
        const row = byTs.get(p.ts) ?? { __ts: p.ts, time: format(new Date(p.ts), "MM/dd HH:mm") };
        row[s.train] = Number(p.eff.toFixed(2));
        byTs.set(p.ts, row);
      }
    const rows = [...byTs.values()].sort((a, b) => (a.__ts as number) - (b.__ts as number));
    return { data: rows, keys: series.filter((s) => s.points.length).map((s) => s.train) };
  }, [series]);

  if (!data.length)
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        No isentropic efficiency data available for the selected train(s).
      </p>
    );

  return (
    <div className="h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis
            tick={{ fontSize: 10 }}
            unit="%"
            domain={[
              (min: number) => Math.max(0, Math.floor(min - Math.max(0.5, Math.abs(min) * 0.05))),
              (max: number) => Math.ceil(max + Math.max(0.5, Math.abs(max) * 0.05)),
            ]}
            tickFormatter={formatTick}
            allowDataOverflow={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => `${v}%`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EffTrendDialog({
  open,
  onOpenChange,
  series,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  series: { train: string; points: { ts: number; eff: number }[] }[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            Axial Compressor Isentropic Efficiency — Trend
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            ηc = T₁·[(P₂/P₁)^((γ−1)/γ) − 1] / (T₂ − T₁) · γ = 1.4 · T in Kelvin · P₁ absolute, P₂ gauge
          </DialogDescription>
        </DialogHeader>
        <EffTrendChart series={series} />
      </DialogContent>
    </Dialog>
  );
}




function buildKpis(data: Row[], columns: string[]): Kpi[] {
  if (!data.length) return [];
  // Last known value per column (rows from different sheets are interleaved).
  const latest: Row = {} as Row;
  for (const r of data) for (const k of Object.keys(r)) if (r[k] != null && r[k] !== "") latest[k] = r[k];
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
  // Aggregate over EVERY row in the selected time range (not just the latest).
  const rangeValues = (cols: string[]): number[] => {
    const out: number[] = [];
    for (const row of data)
      for (const c of cols) {
        const v = row[c];
        if (typeof v === "number" && Number.isFinite(v)) out.push(v);
      }
    return out;
  };
  const maxNum = (cols: string[]) => {
    const v = rangeValues(cols);
    return v.length ? Math.max(...v) : null;
  };
  const minNum = (cols: string[]) => {
    const v = rangeValues(cols);
    return v.length ? Math.min(...v) : null;
  };
  const avgNum = (cols: string[]) => {
    const v = rangeValues(cols);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
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
  // Skip Axial Compressor — a dedicated Isentropic Efficiency card is added separately.
  for (const [groupName, groupCols] of Object.entries(groups)) {
    if (groupCols.length === 0) continue;
    if (groupName === "Axial Compressor (Air)") continue;
    if (groupName === "Seal Gas") continue;
    if (groupName === "Fuel Gas") continue;
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

  // Fuel Gas cards
  const srvPos = pick(/srv position/i);
  const gcvPos = pick(/gcv position/i);
  const fgUp = pick(/fuel gas p upstream srv/i);
  const fgMid = pick(/intermediate stage p/i);
  const fgDown = pick(/fuel gas p downstream gcv/i);
  const avgDiff = (a?: string, b?: string): number | null => {
    if (!a || !b) return null;
    const d: number[] = [];
    for (const r of data) {
      const x = r[a], y = r[b];
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) d.push(x - y);
    }
    return d.length ? d.reduce((s, v) => s + v, 0) / d.length : null;
  };
  const fg: Kpi[] = [
    { label: "Max SRV Position", value: srvPos ? maxNum([srvPos]) : null, column: srvPos ?? "", unit: "%", groups: ["Fuel Gas"] },
    { label: "Max GCV Position", value: gcvPos ? maxNum([gcvPos]) : null, column: gcvPos ?? "", unit: "%", groups: ["Fuel Gas"] },
    { label: "Avg DP Across SRV", value: avgDiff(fgUp, fgMid), column: "", unit: "bar", groups: ["Fuel Gas"] },
    { label: "Avg DP Across GCV", value: avgDiff(fgMid, fgDown), column: "", unit: "bar", groups: ["Fuel Gas"] },
    { label: "Avg Burned Fuel P (downstream GCV)", value: fgDown ? avgNum([fgDown]) : null, column: fgDown ?? "", unit: "bar", groups: ["Fuel Gas"] },
  ];
  items.push(...fg.filter((k) => k.value !== null));





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

  // Aggregate over EVERY row in the selected time range (not just the latest).
  const rangeValues = (cols: string[]): number[] => {
    const out: number[] = [];
    for (const row of data)
      for (const c of cols) {
        const v = row[c];
        if (typeof v === "number" && Number.isFinite(v)) out.push(v);
      }
    return out;
  };
  const maxNum = (cols: string[]) => {
    const v = rangeValues(cols);
    return v.length ? Math.max(...v) : null;
  };
  const minNum = (cols: string[]) => {
    const v = rangeValues(cols);
    return v.length ? Math.min(...v) : null;
  };
  const avgNum = (cols: string[]) => {
    const v = rangeValues(cols);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
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

function buildOilCoolerKpi(
  trainData: Row[],
  siteData: Row[],
  train: string,
): Kpi[] {
  if (!trainData.length || !siteData.length) return [];
  const digit = TRAIN_TAG_DIGIT[train];
  if (!digit) return [];

  const findCol = (row: Row, re: RegExp): string | undefined =>
    Object.keys(row).find((c) => re.test(c));

  const numAt = (row: Row | undefined, re: RegExp): number | null => {
    if (!row) return null;
    const col = findCol(row, re);
    if (!col) return null;
    const v = row[col];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const latestNum = (rows: Row[], re: RegExp): number | null => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = numAt(rows[i], re);
      if (v !== null) return v;
    }
    return null;
  };

  const inletRe = new RegExp(`TI-${digit}430`, "i");
  const outletRe = new RegExp(`TI-${digit}431`, "i");
  const ambientRe = new RegExp(`TE-${digit}415`, "i");
  const trainLetter = train.replace(/^Train\s+/i, "").trim();
  const inSvcRe = new RegExp(`Turbine\\s+${trainLetter}\\s+Oil Cooler`, "i");

  const codeToLabel: Record<string, string> = { "1": "A", "2": "B", "3": "C" };

  // Find the train-sheet row nearest (in time) to a given site row, and pull
  // the ambient reading from there. Falls back to the latest available.
  const nearestAmbient = (siteRow: Row): number | null => {
    const t = siteRow.__timestamp?.getTime();
    if (t != null && trainData.length) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < trainData.length; i++) {
        const tt = trainData[i].__timestamp?.getTime();
        if (tt == null) continue;
        const d = Math.abs(tt - t);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const v = numAt(trainData[bestIdx], ambientRe);
        if (v !== null) return v;
      }
    }
    return latestNum(trainData, ambientRe);
  };

  // Walk site rows backwards; for each cooler A/B/C, capture the most recent
  // row where that cooler was in service AND inlet/outlet are numeric.
  const perCooler: Record<
    string,
    { inlet: number; outlet: number; ambient: number | null } | null
  > = { A: null, B: null, C: null };
  for (let i = siteData.length - 1; i >= 0; i--) {
    const row = siteData[i];
    const svcCol = findCol(row, inSvcRe);
    if (!svcCol) continue;
    const raw = row[svcCol];
    const s = raw == null ? "" : String(raw).trim();
    const label = codeToLabel[s] ?? (s ? s.toUpperCase() : "");
    if (!label || !(label in perCooler)) continue;
    if (perCooler[label]) continue;
    const inlet = numAt(row, inletRe);
    const outlet = numAt(row, outletRe);
    if (inlet === null || outlet === null) continue;
    perCooler[label] = { inlet, outlet, ambient: nearestAmbient(row) };
    if (perCooler.A && perCooler.B && perCooler.C) break;
  }

  let currentSvc = "";
  for (let i = siteData.length - 1; i >= 0; i--) {
    const col = findCol(siteData[i], inSvcRe);
    if (!col) continue;
    const raw = siteData[i][col];
    const s = raw == null ? "" : String(raw).trim();
    if (!s) continue;
    currentSvc = codeToLabel[s] ?? s.toUpperCase();
    break;
  }

  const out: Kpi[] = [];
  for (const label of ["A", "B", "C"] as const) {
    const rec = perCooler[label];
    if (!rec || rec.ambient === null) continue;
    const denom = rec.inlet - rec.ambient;
    if (denom === 0) continue;
    const eff = ((rec.inlet - rec.outlet) / denom) * 100;
    let tone: Kpi["tone"] = "default";
    if (eff < 40) tone = "danger";
    else if (eff < 60) tone = "warning";
    out.push({
      label: `Oil Cooler ${label} Effectiveness${currentSvc === label ? " (in service)" : ""}`,
      value: eff,
      column: "",
      unit: "%",
      tone,
      groups: ["Lube Oil"],
    });
  }
  return out;
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

type PanelKind = "line" | "bar";
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
  onSelectionChange,
}: {
  sensors: string[];
  data: Row[];
  sectionName: string;
  onSelectionChange?: (sensors: string[]) => void;
}) {
  const initialSensors = sensors.slice(0, Math.min(4, sensors.length));
  const [panels, setPanels] = useState<ChartPanelConfig[]>(() => [
    { id: nextPanelId(), kind: "line", sensors: initialSensors },
  ]);
  const [cols, setCols] = useState<1 | 2 | 3>(1);

  // Report every sensor currently plotted so the Raw Readings table can mirror
  // exactly what the charts on this page show.
  const selectedKey = panels
    .flatMap((p) => p.sensors)
    .filter((s, i, a) => a.indexOf(s) === i)
    .join("||");
  useEffect(() => {
    onSelectionChange?.(selectedKey ? selectedKey.split("||") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);


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
        domain={Y_AUTO_DOMAIN}
        tickFormatter={formatTick}
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
              ) : (
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
                        <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickFormatter={formatTick} />
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

  // Show every reading in the selected time frame (newest first), matching the
  // data the charts plot.
  const last20 = useMemo(() => [...data].reverse(), [data]);

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

// Tags carry the train number, e.g. Train A "(LT-1600)" vs Train B "(LT-2600)".
// Canonicalise to "(LT-x600)" so the same measurement lines up across trains.
function canonKey(col: string) {
  return col.replace(/\(([A-Za-z]+)-[1-4](?=\d)/g, "($1-x");
}



function CompareView({
  trainNames,
  queries,
  siteRows,
  siteColumns,
}: {
  trainNames: string[];
  queries: CompareQuery[];
  siteRows?: Row[];
  siteColumns?: string[];
}) {
  const loaded = queries.filter((q) => q.data);
  const anyLoading = queries.some((q) => q.isLoading);
  const errors = queries.filter((q) => q.error);

  // Time frame (same behaviour as single-train mode)
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

  // Site Conditions sensors, canonicalised so the same tag can be compared
  // across trains: "(PDI-1314)" / "(PDI-2314)" → "(PDI-x314)".
  // Keep general site readings separate from train-tagged site readings so
  // compare mode mirrors the single-train pages: Site — General / Site — Train.
  const site = useMemo(() => {
    if (!siteRows?.length || !siteColumns?.length) return null;
    const split = splitSiteColumns(siteColumns);
    const canonMap: Record<string, Record<string, string>> = {};
    const trainSensorNames: string[] = [];
    const generalSensorNames: string[] = [];
    const addCanon = (list: string[], c: string) => {
      if (!list.includes(c)) list.push(c);
    };
    for (const t of trainNames) canonMap[t] = {};
    for (const t of Object.keys(split.byTrain)) {
      if (!canonMap[t]) canonMap[t] = {};
      for (const col of split.byTrain[t]) {
        const canon = `Site · ${canonKey(col)}`;
        canonMap[t][canon] = col;
        addCanon(trainSensorNames, canon);
      }
    }
    for (const col of split.general) {
      const canon = `Site · ${col}`;
      for (const t of Object.keys(canonMap)) canonMap[t][canon] = col;
      addCanon(generalSensorNames, canon);
    }
    return { canonMap, trainSensorNames, generalSensorNames, rows: siteRows };
  }, [siteRows, siteColumns, trainNames]);

  // Per-train rows, keyed by canonical sensor names (train sheet + site sheet)
  const rowsByTrain = useMemo(() => {
    const out: Record<string, Row[]> = {};
    for (const q of loaded) {
      const rows: Row[] = [];
      const cols = q.data!.columns;
      for (const src of q.data!.rows) {
        if (!inRange(src)) continue;
        const r: Row = { __timestamp: src.__timestamp };
        for (const c of cols) {
          const v = src[c];
          r[canonKey(c)] = typeof v === "number" ? v : null;
        }
        rows.push(r);
      }
      const m = site?.canonMap[q.train];
      if (m) {
        for (const sr of site!.rows) {
          if (!inRange(sr)) continue;
          const r: Row = { __timestamp: sr.__timestamp };
          for (const [canon, actual] of Object.entries(m)) {
            const v = sr[actual];
            r[canon] = typeof v === "number" ? v : null;
          }
          rows.push(r);
        }
      }
      out[q.train] = rows;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, site, fromMs, toMs]);

  // Union of canonical sensor columns across all loaded trains
  const allColumns = useMemo(() => {
    const set = new Set<string>();
    for (const q of loaded) for (const c of q.data!.columns) set.add(canonKey(c));
    return Array.from(set);
  }, [loaded]);

  // Site sensors are merged into the same topical groups as the train sheets,
  // so picking "Lube Oil" shows lube-oil sensors from trains AND from site.
  const groups = useMemo(() => {
    const siteNames = [
      ...(site?.trainSensorNames ?? []),
      ...(site?.generalSensorNames ?? []),
    ];
    return groupColumns([...allColumns, ...siteNames]);
  }, [allColumns, site]);

  const groupNames = Object.keys(groups);
  const [activeGroup, setActiveGroup] = useState<string>(groupNames[0] ?? "");
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [selectedTrains, setSelectedTrains] = useState<string[]>(trainNames);

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

  // Series = one line per (train × sensor) combination
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
    const map = new Map<number, Record<string, string | number | null>>();
    for (const t of activeTrains) {
      for (const row of rowsByTrain[t] ?? []) {
        if (!row.__timestamp) continue;
        const ts = row.__timestamp.getTime();
        let entry = map.get(ts);
        if (!entry) {
          entry = { __ts: ts, t: format(row.__timestamp, "MM/dd HH:mm") };
          map.set(ts, entry);
        }
        for (const s of effectiveSensors) {
          if (!(s in row)) continue;
          const v = row[s];
          entry[`${t} · ${s}`] = typeof v === "number" ? v : null;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.__ts as number) - (b.__ts as number)
    );
  }, [rowsByTrain, series, effectiveSensors, activeTrains]);

  // Latest reading per series (within the selected time frame)
  const latestPerSeries = useMemo(() => {
    return series.map((s) => {
      const rows = rowsByTrain[s.train] ?? [];
      let val: number | null = null;
      let bestTs = -Infinity;
      for (const r of rows) {
        const v = r[s.sensor];
        const ts = r.__timestamp?.getTime() ?? -Infinity;
        if (typeof v === "number" && ts >= bestTs) {
          val = v;
          bestTs = ts;
        }
      }
      return { ...s, value: val };
    });
  }, [series, rowsByTrain]);

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
              Time frame
            </span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={!from && !to}
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </Button>
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
              ) : (
                <LineCompare data={chartData} series={series} />
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
        <YAxis
          stroke="var(--color-muted-foreground)"
          fontSize={11}
          tickMargin={4}
          domain={Y_AUTO_DOMAIN}
          tickFormatter={formatTick}
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



