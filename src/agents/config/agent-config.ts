export interface AgentConfig {
  // Market Data Configuration
  marketData: {
    apiEndpoint: string;
    apiKey?: string;
    cacheTtlMs: number;
    rateLimit: {
      requestsPerMinute: number;
      burstLimit: number;
    };
  };

  // Risk Management Configuration
  riskManagement: {
    thresholds: {
      conservative: { maxRiskScore: number; warningThreshold: number };
      moderate: { maxRiskScore: number; warningThreshold: number };
      aggressive: { maxRiskScore: number; warningThreshold: number };
    };
    defaultPositionSizing: {
      maxSingleLegPercent: number;
      minLegs: number;
      maxLegs: number;
    };
  };

  // Session Management Configuration
  session: {
    timeoutMs: number;
    cleanupIntervalMs: number;
    maxSnapshots: number;
  };

  // Event System Configuration
  events: {
    maxHistorySize: number;
    cleanupIntervalMs: number;
  };

  // Metrics Configuration
  metrics: {
    collectionIntervalMs: number;
    maxHistorySize: number;
    enableSystemMetrics: boolean;
  };

  // Testing Configuration
  testing: {
    defaultTimeout: number;
    testTokenAddresses: {
      tokenIn: string;
      tokenOut: string;
    };
  };

  // API Configuration
  api: {
    timeout: number;
    retries: number;
    rateLimitWindow: number;
  };
}

export const defaultAgentConfig: AgentConfig = {
  marketData: {
    apiEndpoint: process.env.MARKET_DATA_API_URL || 'https://api.coingecko.com/api/v3/simple/price',
    apiKey: process.env.MARKET_DATA_API_KEY,
    cacheTtlMs: 60000, // 1 minute
    rateLimit: {
      requestsPerMinute: 60,
      burstLimit: 10,
    },
  },

  riskManagement: {
    thresholds: {
      conservative: {
        maxRiskScore: parseFloat(process.env.CONSERVATIVE_MAX_RISK || '0.4'),
        warningThreshold: parseFloat(process.env.CONSERVATIVE_WARNING_THRESHOLD || '0.3')
      },
      moderate: {
        maxRiskScore: parseFloat(process.env.MODERATE_MAX_RISK || '0.6'),
        warningThreshold: parseFloat(process.env.MODERATE_WARNING_THRESHOLD || '0.5')
      },
      aggressive: {
        maxRiskScore: parseFloat(process.env.AGGRESSIVE_MAX_RISK || '0.8'),
        warningThreshold: parseFloat(process.env.AGGRESSIVE_WARNING_THRESHOLD || '0.7')
      },
    },
    defaultPositionSizing: {
      maxSingleLegPercent: parseFloat(process.env.MAX_SINGLE_LEG_PERCENT || '25'),
      minLegs: parseInt(process.env.MIN_LEGS || '4'),
      maxLegs: parseInt(process.env.MAX_LEGS || '20'),
    },
  },

  session: {
    timeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '86400000'), // 24 hours
    cleanupIntervalMs: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS || '3600000'), // 1 hour
    maxSnapshots: parseInt(process.env.MAX_SESSION_SNAPSHOTS || '50'),
  },

  events: {
    maxHistorySize: parseInt(process.env.EVENT_HISTORY_SIZE || '1000'),
    cleanupIntervalMs: parseInt(process.env.EVENT_CLEANUP_INTERVAL_MS || '300000'), // 5 minutes
  },

  metrics: {
    collectionIntervalMs: parseInt(process.env.METRICS_COLLECTION_INTERVAL_MS || '60000'), // 1 minute
    maxHistorySize: parseInt(process.env.METRICS_HISTORY_SIZE || '1000'),
    enableSystemMetrics: process.env.ENABLE_SYSTEM_METRICS !== 'false',
  },

  testing: {
    defaultTimeout: parseInt(process.env.TEST_TIMEOUT_MS || '30000'),
    testTokenAddresses: {
      tokenIn: process.env.TEST_TOKEN_IN || '0xA0b86a33E6441e42dF319e01bBC6F41EB76dF919', // USDC on testnet
      tokenOut: process.env.TEST_TOKEN_OUT || '0x4200000000000000000000000000000000000006', // ETH on testnet
    },
  },

  api: {
    timeout: parseInt(process.env.API_TIMEOUT_MS || '30000'),
    retries: parseInt(process.env.API_RETRIES || '3'),
    rateLimitWindow: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000'),
  },
};

// Validate configuration
export function validateConfig(config: AgentConfig): void {
  // Validate market data API endpoint
  if (!config.marketData.apiEndpoint) {
    throw new Error('Market data API endpoint is required');
  }

  try {
    new URL(config.marketData.apiEndpoint);
  } catch {
    throw new Error('Market data API endpoint must be a valid URL');
  }

  // Validate risk thresholds
  Object.values(config.riskManagement.thresholds).forEach(threshold => {
    if (threshold.maxRiskScore <= 0 || threshold.maxRiskScore > 1) {
      throw new Error('Risk thresholds must be between 0 and 1');
    }
    if (threshold.warningThreshold >= threshold.maxRiskScore) {
      throw new Error('Warning threshold must be less than max risk score');
    }
  });

  // Validate timeouts
  if (config.session.timeoutMs <= 0) {
    throw new Error('Session timeout must be positive');
  }

  // Validate position sizing
  const sizing = config.riskManagement.defaultPositionSizing;
  if (sizing.minLegs >= sizing.maxLegs) {
    throw new Error('Minimum legs must be less than maximum legs');
  }

  // Validate token addresses
  const tokenAddresses = [config.testing.testTokenAddresses.tokenIn, config.testing.testTokenAddresses.tokenOut];
  tokenAddresses.forEach(address => {
    if (!address.startsWith('0x') || address.length !== 42) {
      throw new Error(`Invalid token address: ${address}`);
    }
  });

  console.log('[AgentConfig] Configuration validated successfully');
}

// Initialize and export config
export const agentConfig = (() => {
  try {
    validateConfig(defaultAgentConfig);
    return defaultAgentConfig;
  } catch (error) {
    console.error('[AgentConfig] Configuration validation failed:', error);
    throw error;
  }
})();