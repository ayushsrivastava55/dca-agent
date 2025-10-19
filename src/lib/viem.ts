import { createPublicClient, http } from "viem";
import { monadTestnet } from "@/lib/chains";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});
