"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "pixel-retroui";

type LegRow = {
  id: string;
  txHash: string;
  timestamp: number;
  token: string;
  from: string;
  to: string;
  value: string | number;
};

export default function EnvioPanel() {
  const [ready, setReady] = useState<{ envioEnabled: boolean; hasApiToken: boolean; router?: string } | null>(null);
  const [rows, setRows] = useState<LegRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gqlUrl = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/envio/executions");
        const data = await res.json();
        if (!res.ok) {
          setReady(null);
          setError(data?.message || data?.error || "envio_not_ready");
          return;
        }
        setReady({ envioEnabled: data.envioEnabled, hasApiToken: data.hasApiToken, router: data.router });
      } catch (e) {
        setError("envio_probe_failed");
      }
    })();
  }, []);

  async function loadLegs() {
    if (!gqlUrl) return;
    setLoading(true);
    setError(null);
    try {
      const query = {
        query:
          "query RecentLegs { LegExecution(limit: 10, order_by: { timestamp: desc }, where: { routerMatch: { _eq: true } }) { id txHash timestamp token from to value } }",
      };
      const r = await fetch(gqlUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(query),
      });
      const j = await r.json();
      if (j.errors) {
        setError("graphql_error");
        setRows([]);
      } else {
        setRows(j.data?.LegExecution || []);
      }
    } catch (e) {
      setError("graphql_fetch_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-medium">Envio Indexing</div>
        {gqlUrl ? (
          <Button onClick={loadLegs} disabled={loading} className="px-3 py-1 text-sm">
            {loading ? "Loading…" : "Load Recent Executions"}
          </Button>
        ) : null}
      </div>

      <div className="text-sm space-y-2">
        <div>Client: {ready?.envioEnabled ? "detected" : "not detected"}</div>
        <div>API Token: {ready?.hasApiToken ? "present" : "missing"}</div>
        <div>Router: {ready?.router || "-"}</div>
        <div>GraphQL: {gqlUrl || "NEXT_PUBLIC_ENVIO_GRAPHQL_URL not set"}</div>
        {error && <div className="text-red-600">{error}</div>}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded border border-black/10 p-3 text-sm flex items-center justify-between">
              <div className="flex-1 truncate">{r.txHash}</div>
              <div className="w-24 text-right">{r.value?.toString?.() || r.value}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
