export type TokenInfo = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
};

const DEFAULT_TOKENS: TokenInfo[] = [
  { address: "native", symbol: "MON", name: "Monad", decimals: 18, isNative: true },
  { address: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701", symbol: "WMON", name: "Wrapped MON", decimals: 18 },
];

function mergeUnique(base: TokenInfo[], add: TokenInfo[]): TokenInfo[] {
  const m = new Map<string, TokenInfo>();
  for (const t of base) m.set(t.address.toLowerCase(), t);
  for (const t of add) m.set(t.address.toLowerCase(), t);
  return Array.from(m.values());
}

export async function loadRemoteTokenList(url?: string): Promise<TokenInfo[]> {
  if (!url) return [];
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    const items: TokenInfo[] = (j.tokens || j) as TokenInfo[];
    return Array.isArray(items) ? items.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function getTokenList(): Promise<TokenInfo[]> {
  const envUsdc = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  const envListUrl = process.env.NEXT_PUBLIC_TOKENLIST_URL;
  const dynamic: TokenInfo[] = [];
  if (envUsdc && envUsdc.startsWith("0x")) {
    dynamic.push({ address: envUsdc, symbol: "USDC", name: "USD Coin (Testnet)", decimals: 6 });
  }
  const remote = await loadRemoteTokenList(envListUrl);
  return mergeUnique(DEFAULT_TOKENS, mergeUnique(dynamic, remote));
}

export async function resolveToken(input: string, tokens?: TokenInfo[]): Promise<TokenInfo | null> {
  const list = tokens && tokens.length > 0 ? tokens : await getTokenList();
  const q = input.trim();
  const byAddress = list.find(t => t.address.toLowerCase() === q.toLowerCase());
  if (byAddress) return byAddress;
  const bySymbol = list.find(t => t.symbol.toLowerCase() === q.toLowerCase());
  if (bySymbol) return bySymbol;
  const byName = list.find(t => t.name.toLowerCase() === q.toLowerCase());
  if (byName) return byName;
  return null;
}

export async function searchTokens(query: string, tokens?: TokenInfo[]): Promise<TokenInfo[]> {
  const list = tokens && tokens.length > 0 ? tokens : await getTokenList();
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(t =>
    t.symbol.toLowerCase().includes(q) ||
    t.name.toLowerCase().includes(q) ||
    t.address.toLowerCase() === q
  );
}
