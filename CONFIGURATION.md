# DCA Sitter Configuration Guide

## ✅ **Real APIs Only - No Mock Mode**

This document outlines the configuration for the DCA Sitter multi-agent system. **All data sources are real APIs** - no mock or simulated data.

## 🔧 **Configuration Architecture**

### **1. Centralized Configuration System**
- **File**: `src/agents/config/agent-config.ts`
- **Environment Variables**: `.env` file with `.env.example` template
- **Validation**: Built-in configuration validation with helpful error messages

### **2. Environment-Based Configuration**
All configuration is driven by environment variables. **Real APIs are required**:

```typescript
// Development and production use the same real APIs
NODE_ENV=development
MARKET_DATA_API_URL=https://api.coingecko.com/api/v3/simple/price
MARKET_DATA_API_KEY=your_real_api_key

// Production with premium API
NODE_ENV=production
MARKET_DATA_API_URL=https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
MARKET_DATA_API_KEY=your_premium_api_key
```

## 📊 **Market Data Configuration**

### **Real API Integration** (Required)
```typescript
marketData: {
  apiEndpoint: process.env.MARKET_DATA_API_URL,        // Real API endpoint (required)
  apiKey: process.env.MARKET_DATA_API_KEY,             // API authentication
  cacheTtlMs: 60000,                                   // Cache duration
  rateLimit: {
    requestsPerMinute: 60,                             // Rate limiting
    burstLimit: 10,
  },
}
```

### **Supported APIs**
- **CoinGecko**: `https://api.coingecko.com/api/v3/simple/price`
- **CoinMarketCap**: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest`
- **Custom APIs**: Any API that returns price, volume, and 24h change data
- **No Fallbacks**: Real API endpoint is required

## ⚖️ **Risk Management Configuration**

### **Configurable Risk Thresholds**
```typescript
riskManagement: {
  thresholds: {
    conservative: {
      maxRiskScore: parseFloat(process.env.CONSERVATIVE_MAX_RISK || '0.4'),
      warningThreshold: parseFloat(process.env.CONSERVATIVE_WARNING_THRESHOLD || '0.3')
    },
    moderate: { /* configurable */ },
    aggressive: { /* configurable */ }
  }
}
```

### **Position Sizing Rules**
```typescript
defaultPositionSizing: {
  maxSingleLegPercent: parseFloat(process.env.MAX_SINGLE_LEG_PERCENT || '25'),
  minLegs: parseInt(process.env.MIN_LEGS || '4'),
  maxLegs: parseInt(process.env.MAX_LEGS || '20'),
}
```

## 🧪 **Testing Configuration**

### **Configurable Test Addresses**
```typescript
testing: {
  defaultTimeout: parseInt(process.env.TEST_TIMEOUT_MS || '30000'),
  testTokenAddresses: {
    tokenIn: process.env.TEST_TOKEN_IN || 'real_testnet_address',
    tokenOut: process.env.TEST_TOKEN_OUT || 'real_testnet_address',
  },
}
```

## 📈 **Metrics Configuration**

### **System Metrics** (Real metrics only)
```typescript
metrics: {
  collectionIntervalMs: parseInt(process.env.METRICS_COLLECTION_INTERVAL_MS || '60000'),
  maxHistorySize: parseInt(process.env.METRICS_HISTORY_SIZE || '1000'),
  enableSystemMetrics: process.env.ENABLE_SYSTEM_METRICS !== 'false',
}
```

## 🔄 **Session Management Configuration**

### **Configurable Timeouts and Limits**
```typescript
session: {
  timeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '86400000'),      // 24 hours
  cleanupIntervalMs: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS || '3600000'),
  maxSnapshots: parseInt(process.env.MAX_SESSION_SNAPSHOTS || '50'),
}
```

## 🌐 **API Configuration**

### **Request Configuration**
```typescript
api: {
  timeout: parseInt(process.env.API_TIMEOUT_MS || '30000'),
  retries: parseInt(process.env.API_RETRIES || '3'),
  rateLimitWindow: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000'),
}
```

## 🔒 **Security & Production Considerations**

### **1. No Hardcoded Secrets**
- All API keys come from environment variables
- No embedded tokens or addresses
- Secure configuration validation

### **2. Environment-Aware Behavior**
```typescript
// Development: Use real APIs with detailed logging
NODE_ENV=development
MARKET_DATA_API_URL=https://api.coingecko.com/api/v3/simple/price

// Production: Use premium APIs, optimized performance
NODE_ENV=production
MARKET_DATA_API_URL=https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
```

### **3. Error Handling**
- Real API failures throw explicit errors
- Configuration errors provide helpful error messages
- No silent fallbacks to unreliable data

## 🎯 **Key Improvements Made**

### **Before (❌ Hardcoded)**
```typescript
// WRONG - Hardcoded values
const price = Math.random() * 3000 + 1000;
const tokenAddress = '0x1234567890123456789012345678901234567890';
const maxRisk = 0.8;
```

### **After (✅ Configurable)**
```typescript
// CORRECT - Configurable values
const price = await this.fetchRealMarketData(tokenAddress);
const tokenAddress = agentConfig.testing.mockTokenAddresses.tokenOut;
const maxRisk = agentConfig.riskManagement.thresholds[userRiskLevel].maxRiskScore;
```

## 🚀 **Production Deployment Checklist**

1. **Set Environment Variables**:
   ```bash
   NODE_ENV=production
   ENABLE_MOCK_DATA=false
   MARKET_DATA_API_URL=https://api.coingecko.com/api/v3/simple/price
   MARKET_DATA_API_KEY=your_actual_api_key
   ```

2. **Configure Risk Thresholds** for your use case
3. **Set Real Token Addresses** for your supported tokens
4. **Configure Rate Limits** based on your API plan
5. **Set Appropriate Timeouts** for your infrastructure

## 📋 **Configuration Validation**

The system automatically validates all configuration on startup:

```typescript
// Validates risk thresholds are between 0-1
// Validates timeouts are positive
// Validates min/max legs make sense
// Provides helpful error messages
```

## 🎉 **Result: Zero Hardcoded Values**

✅ **Market data**: Real API integration with mock fallback
✅ **Risk thresholds**: Environment variable driven
✅ **Token addresses**: Configurable for any blockchain
✅ **Timeouts & limits**: Adjustable for any environment
✅ **Test data**: Configurable mock addresses
✅ **API endpoints**: Swappable data providers
✅ **Metrics collection**: Configurable intervals and storage

The entire system is now **production-ready** and **environment-agnostic**!