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
      "@envio-dev/hypersync-client",
      "@envio-dev/hypersync-client-darwin-arm64",
      "@envio-dev/hypersync-client-darwin-x64",
      "@envio-dev/hypersync-client-linux-arm64",
      "@envio-dev/hypersync-client-linux-x64",
      "@envio-dev/hypersync-client-win32-x64"
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
  // Transpile specific packages (ensure ADK ESM works on server)
  transpilePackages: ['@metamask/sdk', '@iqai/adk'],
};

export default nextConfig;
