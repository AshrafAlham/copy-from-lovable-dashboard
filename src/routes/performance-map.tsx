import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchSheet } from "@/lib/parse-sheet";
import { TRAIN_SHEETS, META_COLUMNS } from "@/lib/sheets-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Upload, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/performance-map")({
  head: () => ({
    meta: [
      { title: "Performance Map — Rotating Equipment" },
      {
        name: "description",
        content:
          "Overlay historical compressor operating points on user-defined surge and stonewall curves.",
      },
      { property: "og:title", content: "Performance Map — Rotating Equipment" },
      {
        property: "og:description",
        content:
          "Scatter plot of centrifugal gas compressor operating data on top of theoretical surge and stonewall lines.",
      },
    ],
  }),
  component: PerformanceMap,
});

interface Curve {
  id: string;
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

const DEFAULT_CURVES: Curve[] = [
  {
    id: "surge",
    name: "Surge Line",
    color: "hsl(0, 85%, 60%)",
    points: [],
  },
  {
    id: "stonewall",
    name: "Stonewall Line",
    color: "hsl(220, 85%, 60%)",
    points: [],
  },
];

function parseCurveText(text: string): { x: number; y: number }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const parts = l.split(/[\s,;\t]+/).map(Number);
      return { x: parts[0], y: parts[1] };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);
}

function storageKey(train: string) {
  return `perfmap:${train}`;
}

function PerformanceMap() {
  const [train, setTrain] = useState<string>("Train A");

  const { data, isLoading } = useQuery({
    queryKey: ["train", train],
    queryFn: () => fetchSheet(TRAIN_SHEETS[train]),
  });

  const numericColumns = useMemo(() => {
    if (!data) return [];
    const cols: string[] = [];
    for (const c of data.columns) {
      if (META_COLUMNS.has(c) || META_COLUMNS.has(c.trim())) continue;
      // Sample a few rows to confirm numeric
      const sample = data.rows.slice(-30).map((r) => r[c]);
      if (sample.some((v) => typeof v === "number")) cols.push(c);
    }
    return cols;
  }, [data]);

  const [xCol, setXCol] = useState<string>("");
  const [yCol, setYCol] = useState<string>("");

  useEffect(() => {
    if (numericColumns.length && !xCol) {
      const flow = numericColumns.find((c) => /flow/i.test(c));
      const disch = numericColumns.find((c) => /discharge.*press|dp/i.test(c));
      setXCol(flow ?? numericColumns[0]);
      setYCol(disch ?? numericColumns[1] ?? numericColumns[0]);
    }
  }, [numericColumns, xCol]);

  // Reset column pickers when switching train (columns may differ)
  useEffect(() => {
    setXCol("");
    setYCol("");
  }, [train]);

  const [curves, setCurves] = useState<Curve[]>(DEFAULT_CURVES);

  // Load per-train curves from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(train));
      if (raw) setCurves(JSON.parse(raw));
      else setCurves(DEFAULT_CURVES);
    } catch {
      setCurves(DEFAULT_CURVES);
    }
  }, [train]);

  const saveCurves = (next: Curve[]) => {
    setCurves(next);
    try {
      localStorage.setItem(storageKey(train), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const scatterData = useMemo(() => {
    if (!data || !xCol || !yCol) return [];
    return data.rows
      .map((r) => {
        const x = r[xCol];
        const y = r[yCol];
        if (typeof x !== "number" || typeof y !== "number") return null;
        return { x, y, ts: r.__timestamp };
      })
      .filter((p): p is { x: number; y: number; ts: Date | null } => p !== null);
  }, [data, xCol, yCol]);

  const domain = useMemo(() => {
    const xs = scatterData.map((p) => p.x);
    const ys = scatterData.map((p) => p.y);
    for (const c of curves) {
      for (const p of c.points) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    if (!xs.length) return { x: [0, 1] as [number, number], y: [0, 1] as [number, number] };
    const pad = (min: number, max: number) => {
      const d = Math.max((max - min) * 0.05, 0.5);
      return [min - d, max + d] as [number, number];
    };
    return {
      x: pad(Math.min(...xs), Math.max(...xs)),
      y: pad(Math.min(...ys), Math.max(...ys)),
    };
  }, [scatterData, curves]);

  const handleFileUpload = (curveId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const points = parseCurveText(text);
      saveCurves(curves.map((c) => (c.id === curveId ? { ...c, points } : c)));
    };
    reader.readAsText(file);
  };

  const addCurve = () => {
    const id = `curve-${Date.now()}`;
    saveCurves([
      ...curves,
      { id, name: `Curve ${curves.length + 1}`, color: "hsl(140, 70%, 55%)", points: [] },
    ]);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Performance Map</h1>
              <p className="text-xs text-muted-foreground">
                Surge / stonewall curves with historical operating points
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Train</Label>
            <Select value={train} onValueChange={setTrain}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(TRAIN_SHEETS).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Operating Map — {train}</CardTitle>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label className="text-xs">X axis (flow)</Label>
                <Select value={xCol} onValueChange={setXCol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a sensor" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Y axis (head / pressure)</Label>
                <Select value={yCol} onValueChange={setYCol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a sensor" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[520px] grid place-items-center text-muted-foreground">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={560}>
                <ComposedChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={domain.x}
                    stroke="hsl(var(--muted-foreground))"
                    label={{ value: xCol, position: "insideBottom", offset: -8, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={domain.y}
                    stroke="hsl(var(--muted-foreground))"
                    label={{ value: yCol, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))}
                  />
                  <Legend />
                  {curves.map((c) =>
                    c.points.length > 1 ? (
                      <Line
                        key={c.id}
                        data={c.points}
                        dataKey="y"
                        name={c.name}
                        stroke={c.color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        type="monotone"
                      />
                    ) : null,
                  )}
                  <Scatter
                    name="Operating points"
                    data={scatterData}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.55}
                    shape="circle"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {scatterData.length} historical points plotted.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Baseline Curves</CardTitle>
            <Button size="sm" variant="outline" onClick={addCurve}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Enter one <code>x,y</code> pair per line (comma / space / tab). Points are sorted by
              x. Saved per train in your browser.
            </p>
            {curves.map((curve) => (
              <div key={curve.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: curve.color }}
                  />
                  <Input
                    value={curve.name}
                    onChange={(e) =>
                      saveCurves(
                        curves.map((c) => (c.id === curve.id ? { ...c, name: e.target.value } : c)),
                      )
                    }
                    className="h-8 flex-1"
                  />
                  <Input
                    type="color"
                    value={rgbToHex(curve.color)}
                    onChange={(e) =>
                      saveCurves(
                        curves.map((c) =>
                          c.id === curve.id ? { ...c, color: e.target.value } : c,
                        ),
                      )
                    }
                    className="h-8 w-10 p-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => saveCurves(curves.filter((c) => c.id !== curve.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  placeholder={"# x,y\n1200, 3.1\n1500, 3.4\n1800, 3.6"}
                  value={curve.points.map((p) => `${p.x}, ${p.y}`).join("\n")}
                  onChange={(e) =>
                    saveCurves(
                      curves.map((c) =>
                        c.id === curve.id ? { ...c, points: parseCurveText(e.target.value) } : c,
                      ),
                    )
                  }
                  rows={5}
                  className="font-mono text-xs"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {curve.points.length} points
                  </span>
                  <label className="text-xs cursor-pointer inline-flex items-center gap-1 text-primary hover:underline">
                    <Upload className="h-3 w-3" />
                    Upload CSV
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(curve.id, f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function rgbToHex(color: string): string {
  // Best-effort: if already hex, return; if hsl(...) leave a fallback.
  if (color.startsWith("#")) return color;
  // Try to render via canvas
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return "#888888";
    ctx.fillStyle = color;
    return ctx.fillStyle as string;
  } catch {
    return "#888888";
  }
}
