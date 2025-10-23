import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // Externalize problematic dependencies (server-side only)
    if (isServer) {
      config.externals.push(
        "pino-pretty",
        "lokijs",
        "encoding",
        "@react-native-async-storage/async-storage",
        "@opentelemetry/winston-transport",
        "@opentelemetry/exporter-jaeger"
      );
    }

    // Basic Node.js polyfills for browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
  // Transpile specific packages (ensure ADK ESM works on server)
  transpilePackages: ['@metamask/sdk', '@iqai/adk'],
};

export default nextConfig;
