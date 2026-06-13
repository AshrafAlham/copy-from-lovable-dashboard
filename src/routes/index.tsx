import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";

import { fetchSheet, type Row } from "@/lib/parse-sheet";
import { TRAIN_SHEETS, groupColumns } from "@/lib/sheets-config";
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
import { Activity, AlertTriangle, RefreshCw, Gauge } from "lucide-react";

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
                if (mode === "single") query.refetch();
                else compareQueries.forEach((q) => q.refetch());
              }}
              disabled={
                mode === "single"
                  ? query.isFetching
                  : compareQueries.some((q) => q.isFetching)
              }
            >
              <RefreshCw
                className={`size-4 ${
                  (mode === "single" ? query.isFetching : compareQueries.some((q) => q.isFetching))
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
              <DashboardBody data={query.data.rows} columns={query.data.columns} />
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

function DashboardBody({ data, columns }: { data: Row[]; columns: string[] }) {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupColumns(columns), [columns]);
  const groupNames = Object.keys(groups);
  const [activeGroup, setActiveGroup] = useState(groupNames[0] ?? "");

  const latest = data[data.length - 1];
  const previous = data[data.length - 2];

  const kpis = useMemo(() => buildKpis(data, columns), [data, columns]);

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-6 justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">
              {data.length} readings · last:{" "}
              <span className="text-foreground">
                {latest?.__timestamp
                  ? format(latest.__timestamp, "PP HH:mm")
                  : "—"}
              </span>
            </span>
          </div>
          <Badge variant="outline" className="font-mono">
            <Activity className="size-3 mr-1" />
            {columns.length} sensors tracked
          </Badge>
        </CardContent>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} previous={previous} />
        ))}
      </div>

      {/* Sections */}
      <Tabs value={activeGroup} onValueChange={setActiveGroup}>
        <ScrollArea className="w-full">
          <TabsList className="h-auto flex-wrap justify-start">
            {groupNames.map((g) => (
              <TabsTrigger key={g} value={g} className="text-xs">
                {g}{" "}
                <span className="ml-1 opacity-60">({groups[g].length})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        {groupNames.map((g) => (
          <TabsContent key={g} value={g} className="space-y-4 mt-4">
            <SectionView sensors={groups[g]} data={data} sectionName={g} />
          </TabsContent>
        ))}
      </Tabs>

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
          <RawTable data={data} columns={columns} search={search} />
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
}

function buildKpis(data: Row[], columns: string[]): Kpi[] {
  if (!data.length) return [];
  const latest = data[data.length - 1];
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

  const items: Kpi[] = [
    { label: "Lube Oil P", value: getNum(latest, lubeP), column: lubeP ?? "", unit: "bar" },
    { label: "Lube Oil T", value: getNum(latest, lubeT), column: lubeT ?? "", unit: "°C" },
    { label: "Oil Tank T", value: getNum(latest, oilTank), column: oilTank ?? "", unit: "°C" },
    { label: "Exhaust Mean", value: getNum(latest, exhaustMean), column: exhaustMean ?? "", unit: "°C" },
    { label: "Max Bearing T", value: maxNum(tempCols), column: "", unit: "°C" },
    { label: "Max Vibration", value: maxNum(vibCols), column: "", unit: "mm/s" },
    { label: "FSR", value: getNum(latest, fsr), column: fsr ?? "", unit: "%" },
  ].filter((k) => k.value !== null);

  // Tone heuristics
  return items.map((k) => {
    if (k.label === "Max Bearing T" && k.value && k.value > 85)
      return { ...k, tone: k.value > 95 ? "danger" : "warning" };
    if (k.label === "Max Vibration" && k.value && k.value > 7)
      return { ...k, tone: k.value > 10 ? "danger" : "warning" };
    return k;
  });
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

function SectionView({
  sensors,
  data,
  sectionName,
}: {
  sensors: string[];
  data: Row[];
  sectionName: string;
}) {
  // Default-select first 6 sensors so charts aren't overwhelming
  const [selected, setSelected] = useState<string[]>(() =>
    sensors.slice(0, Math.min(6, sensors.length))
  );

  const chartData = useMemo(
    () =>
      data
        .filter((r) => r.__timestamp)
        .map((r) => {
          const o: Record<string, string | number | null> = {
            t: format(r.__timestamp as Date, "MM/dd HH:mm"),
          };
          for (const s of selected) {
            const v = r[s];
            o[s] = typeof v === "number" ? v : null;
          }
          return o;
        }),
    [data, selected]
  );

  const toggle = (s: string) =>
    setSelected((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {sectionName} — Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            {selected.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                Select sensors to plot →
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="t"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickMargin={6}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickMargin={4}
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
                  {selected.map((s, i) => (
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
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Sensors ({selected.length}/{sensors.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-1">
              {sensors.map((s) => {
                const active = selected.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggle(s)}
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
