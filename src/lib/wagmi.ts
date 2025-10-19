import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "@/lib/chains";

export const config = createConfig({
  chains: [monadTestnet],
  connectors: [
    injected({
      target: "metaMask",
      shimDisconnect: true,
    }),
  ],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
});
