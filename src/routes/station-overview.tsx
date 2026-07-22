import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { format } from "date-fns";
import { fetchSheet, type Row } from "@/lib/parse-sheet";
import { TRAIN_SHEETS } from "@/lib/sheets-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, AlertCircle, Gauge, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/station-overview")({
  head: () => ({
    meta: [
      { title: "Station Overview — Rotating Equipment" },
      { name: "description", content: "At-a-glance status of all gas-turbine-driven compressor trains with active alarm indicators." },
      { property: "og:title", content: "Station Overview — Rotating Equipment" },
      { property: "og:description", content: "At-a-glance status of all gas-turbine-driven compressor trains." },
    ],
  }),
  component: StationOverview,
});

const ONE_DAY = 24 * 60 * 60 * 1000;
function msUntilNext11AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(11, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

type Severity = "ok" | "warning" | "danger" | "unknown";

interface Alarm {
  severity: Severity;
  label: string;
  value: number;
  unit: string;
  threshold: string;
}

// Threshold rules mirroring the main dashboard heuristics.
const RULES: {
  match: RegExp;
  unit: string;
  warn: number;
  danger: number;
  label: (col: string) => string;
}[] = [
  {
    match: /bearing.*temp/i,
    unit: "°C",
    warn: 85,
    danger: 95,
    label: (c) => c,
  },
  {
    match: /vibration/i,
    unit: "mm/s",
    warn: 7,
    danger: 10,
    label: (c) => c,
  },
  {
    match: /exhaust temperature.*mean/i,
    unit: "°C",
    warn: 540,
    danger: 580,
    label: () => "Exhaust Mean T",
  },
  {
    match: /lube oil header p/i,
    unit: "bar",
    // low-pressure alarm handled specially below
    warn: -Infinity,
    danger: -Infinity,
    label: () => "Lube Oil Header P",
  },
];

function evaluateTrain(rows: Row[]): {
  latestAt: Date | null;
  alarms: Alarm[];
  worst: Severity;
} {
  if (!rows.length) return { latestAt: null, alarms: [], worst: "unknown" };
  const latest = rows[rows.length - 1];
  const alarms: Alarm[] = [];

  for (const col of Object.keys(latest)) {
    if (col.startsWith("__")) continue;
    const v = latest[col];
    if (typeof v !== "number") continue;

    for (const rule of RULES) {
      if (!rule.match.test(col)) continue;
      // Lube oil header pressure = low-alarm (below 1.2 bar warn, below 0.9 danger)
      if (/lube oil header p/i.test(col)) {
        if (v < 0.9)
          alarms.push({ severity: "danger", label: col, value: v, unit: "bar", threshold: "< 0.9" });
        else if (v < 1.2)
          alarms.push({ severity: "warning", label: col, value: v, unit: "bar", threshold: "< 1.2" });
        break;
      }
      if (v >= rule.danger)
        alarms.push({
          severity: "danger",
          label: rule.label(col),
          value: v,
          unit: rule.unit,
          threshold: `≥ ${rule.danger}`,
        });
      else if (v >= rule.warn)
        alarms.push({
          severity: "warning",
          label: rule.label(col),
          value: v,
          unit: rule.unit,
          threshold: `≥ ${rule.warn}`,
        });
      break;
    }
  }

  const worst: Severity = alarms.some((a) => a.severity === "danger")
    ? "danger"
    : alarms.some((a) => a.severity === "warning")
      ? "warning"
      : "ok";

  // Sort worst first, then by value magnitude.
  alarms.sort((a, b) => {
    const rank = { danger: 0, warning: 1, ok: 2, unknown: 3 };
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return b.value - a.value;
  });

  return { latestAt: latest.__timestamp, alarms, worst };
}

function StationOverview() {
  const trainNames = Object.keys(TRAIN_SHEETS);
  const queries = useQueries({
    queries: trainNames.map((t) => ({
      queryKey: ["sheet", t, TRAIN_SHEETS[t]],
      queryFn: () => fetchSheet(TRAIN_SHEETS[t]),
      enabled: !!TRAIN_SHEETS[t],
      refetchInterval: () => msUntilNext11AM(),
      staleTime: ONE_DAY,
      refetchOnWindowFocus: false,
    })),
  });

  const trains = useMemo(
    () =>
      trainNames.map((t, i) => {
        const q = queries[i];
        const rows = q.data?.rows ?? [];
        return {
          name: t,
          loading: q.isLoading,
          error: q.error as Error | null,
          ...evaluateTrain(rows),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queries.map((q) => q.dataUpdatedAt).join(","), queries.map((q) => q.isLoading).join(",")]
  );

  const counts = trains.reduce(
    (acc, t) => {
      acc[t.worst] = (acc[t.worst] ?? 0) + 1;
      return acc;
    },
    {} as Record<Severity, number>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
              <Gauge className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Station Overview</h1>
              <p className="text-xs text-muted-foreground font-mono">
                All trains at a glance · daily refresh at 11:00 AM
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <span className="size-2 rounded-full bg-emerald-500" /> OK {counts.ok ?? 0}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <span className="size-2 rounded-full bg-amber-400" /> Warn {counts.warning ?? 0}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <span className="size-2 rounded-full bg-red-500" /> Alarm {counts.danger ?? 0}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="size-4 mr-1" /> Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {trains.map((t) => (
            <TrainCard key={t.name} train={t} />
          ))}
        </div>
      </main>
    </div>
  );
}

function TrainCard({
  train,
}: {
  train: {
    name: string;
    loading: boolean;
    error: Error | null;
    latestAt: Date | null;
    alarms: Alarm[];
    worst: Severity;
  };
}) {
  const style = SEVERITY_STYLES[train.worst];
  const Icon = style.icon;

  return (
    <Card className={`relative overflow-hidden border ${style.border}`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${style.bar}`} />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{train.name}</CardTitle>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
            <span className={`size-2.5 rounded-full ${style.dot} ${train.worst === "danger" ? "animate-pulse" : ""}`} />
            {style.label}
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          {train.loading
            ? "Loading…"
            : train.error
              ? "Failed to load"
              : train.latestAt
                ? `Last update ${format(train.latestAt, "MMM d, HH:mm")}`
                : "No data"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-5 ${style.text}`} />
          <span className="text-2xl font-semibold">
            {train.worst === "unknown" ? "—" : train.alarms.filter((a) => a.severity !== "ok").length}
          </span>
          <span className="text-xs text-muted-foreground">active alarms</span>
        </div>

        {train.alarms.length === 0 && !train.loading && !train.error && (
          <p className="text-xs text-muted-foreground">All monitored sensors within limits.</p>
        )}

        {train.alarms.slice(0, 3).map((a, i) => (
          <div
            key={`${a.label}-${i}`}
            className="flex items-center justify-between text-xs rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
          >
            <div className="min-w-0">
              <div className="truncate font-medium" title={a.label}>
                {a.label}
              </div>
              <div className="text-muted-foreground font-mono">Threshold {a.threshold} {a.unit}</div>
            </div>
            <div className={`font-mono tabular-nums ${SEVERITY_STYLES[a.severity].text}`}>
              {a.value.toFixed(1)} {a.unit}
            </div>
          </div>
        ))}
        {train.alarms.length > 3 && (
          <p className="text-xs text-muted-foreground">+{train.alarms.length - 3} more</p>
        )}
      </CardContent>
    </Card>
  );
}

const SEVERITY_STYLES: Record<
  Severity,
  {
    label: string;
    text: string;
    dot: string;
    bar: string;
    border: string;
    icon: typeof CheckCircle2;
  }
> = {
  ok: {
    label: "Normal",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
  },
  warning: {
    label: "Warning",
    text: "text-amber-400",
    dot: "bg-amber-400",
    bar: "bg-amber-400",
    border: "border-amber-400/40",
    icon: AlertTriangle,
  },
  danger: {
    label: "Alarm",
    text: "text-red-400",
    dot: "bg-red-500",
    bar: "bg-red-500",
    border: "border-red-500/50",
    icon: AlertCircle,
  },
  unknown: {
    label: "No data",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    bar: "bg-muted-foreground/40",
    border: "border-border",
    icon: AlertTriangle,
  },
};
