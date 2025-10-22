import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // Externalize problematic dependencies
    config.externals.push(
      "pino-pretty",
      "lokijs",
      "encoding",
      "@react-native-async-storage/async-storage",
      "@opentelemetry/winston-transport",
      "@opentelemetry/exporter-jaeger",
      "@iqai/adk"
    );

    // Basic Node.js polyfills for browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Ignore warnings for @iqai/adk dynamic requires
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...config.module.parser?.javascript,
        exprContextCritical: false,
      },
    };

    return config;
  },
  // Transpile specific packages
  transpilePackages: ['@metamask/sdk'],
};

export default nextConfig;
