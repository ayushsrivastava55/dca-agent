"use client";

import { useEffect, useMemo, useState } from "react";
import type { TokenInfo } from "@/lib/tokenlist";
import { getTokenList } from "@/lib/tokenlist";

type Props = {
  selectedSymbol?: string;
  selectedAddress?: string;
  onSelect: (t: TokenInfo) => void;
  placeholder?: string;
  excludeNative?: boolean;
  showLogos?: boolean;
};

export default function TokenSelector({ selectedSymbol, selectedAddress, onSelect, placeholder = "Search token (symbol / name / address)", excludeNative = false, showLogos = true, }: Props) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kbIndex, setKbIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const list = await getTokenList();
      setTokens(excludeNative ? list.filter(t => !t.isNative) : list);
    })();
  }, [excludeNative]);

  const filtered = useMemo(() => {
    if (!query) return tokens;
    return tokens.filter(t =>
      t.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.address.toLowerCase() === query.toLowerCase()
    );
  }, [tokens, query]);

  const selected = useMemo(() => {
    if (selectedAddress) return tokens.find(t => t.address.toLowerCase() === selectedAddress.toLowerCase());
    if (selectedSymbol) return tokens.find(t => t.symbol.toLowerCase() === selectedSymbol.toLowerCase());
    return undefined;
  }, [tokens, selectedAddress, selectedSymbol]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          className="rounded-lg px-3 py-2 bg-white border border-black/10 w-full"
          placeholder={selected ? `${selected.symbol} — ${selected.name}` : placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setKbIndex(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setKbIndex(i => Math.min(i + 1, filtered.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setKbIndex(i => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && filtered[kbIndex]) { onSelect(filtered[kbIndex]); setQuery(""); setOpen(false); }
            if (e.key === 'Escape') { setOpen(false); }
          }}
        />
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-black/10 bg-white"
          onClick={() => setOpen(v => !v)}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-black/10 bg-white shadow">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
          )}
          {filtered.map((t, i) => (
            <button
              key={`${t.address}-${t.symbol}`}
              type="button"
              className={`w-full text-left px-3 py-2 hover:bg-gray-100 text-sm ${i === kbIndex ? 'bg-gray-100' : ''}`}
              onClick={() => { onSelect(t); setQuery(""); setOpen(false); }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {showLogos && t.logoURI && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logoURI} alt={t.symbol} className="w-5 h-5 rounded" />
                  )}
                  <span className="font-medium">{t.symbol}</span>
                  <span className="text-gray-600">{t.name}</span>
                </div>
                <span className="text-xs text-gray-500">{t.address === "native" ? "native" : `${t.address.slice(0,6)}...${t.address.slice(-4)}`}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
