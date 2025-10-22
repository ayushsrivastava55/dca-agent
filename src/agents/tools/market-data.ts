import { z } from 'zod';
import { agentConfig } from '../config/agent-config';

export interface MarketDataPoint {
  price: number;
  volume: number;
  timestamp: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
}

export interface VolatilityMetrics {
  current: number;
  category: 'low' | 'medium' | 'high';
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
}

export interface MarketTrend {
  direction: 'bullish' | 'bearish' | 'sideways';
  strength: number;
  duration: number;
  confidence: number;
}

export const MarketDataSchema = z.object({
  price: z.number().positive(),
  volume: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  high24h: z.number().positive(),
  low24h: z.number().positive(),
  change24h: z.number(),
  changePercent24h: z.number(),
});

export const VolatilityMetricsSchema = z.object({
  current: z.number().nonnegative(),
  category: z.enum(['low', 'medium', 'high']),
  trend: z.enum(['increasing', 'decreasing', 'stable']),
  confidence: z.number().min(0).max(1),
});

export class MarketDataTool {
  private cache = new Map<string, { data: MarketDataPoint; timestamp: number }>();
  private rateLimitCache = new Map<string, { data: number; timestamp: number }>();
  private cacheTimeout = 60000; // 1 minute cache

  async getCurrentPrice(tokenAddress: string): Promise<number> {
    const marketData = await this.getMarketData(tokenAddress);
    return marketData.price;
  }

  async getMarketData(tokenAddress: string): Promise<MarketDataPoint> {
    const cacheKey = `market_${tokenAddress}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < agentConfig.marketData.cacheTtlMs) {
      return cached.data;
    }

    const marketData = await this.fetchRealMarketData(tokenAddress);
    this.cache.set(cacheKey, { data: marketData, timestamp: Date.now() });
    return marketData;
  }

  private async fetchRealMarketData(tokenAddress: string): Promise<MarketDataPoint> {
    const { apiEndpoint, apiKey, rateLimit } = agentConfig.marketData;

    // Check rate limiting
    const now = Date.now();
    const rateLimitKey = `rate_limit_${Math.floor(now / 60000)}`; // Per minute
    const cached = this.rateLimitCache.get(rateLimitKey);
    const currentCalls = cached?.data || 0;

    if (currentCalls >= rateLimit.requestsPerMinute) {
      throw new Error('Rate limit exceeded for market data API');
    }

    // Construct API URL (example for CoinGecko-style API)
    const url = new URL(apiEndpoint);
    url.searchParams.set('ids', tokenAddress);
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    url.searchParams.set('include_24hr_vol', 'true');

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'DCA-Sitter/1.0',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), agentConfig.api.timeout);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Market data API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Update rate limit counter
    this.rateLimitCache.set(rateLimitKey, { data: currentCalls + 1, timestamp: now });

    // Parse response (adjust based on actual API format)
    return this.parseApiResponse(data, tokenAddress);
  }

  private parseApiResponse(data: any, tokenAddress: string): MarketDataPoint {
    // This is a generic parser - adjust based on your actual API format
    const tokenData = data[tokenAddress] || data[0] || data;

    if (!tokenData) {
      throw new Error('No data found for token');
    }

    const price = tokenData.current_price || tokenData.price || 0;
    const volume = tokenData.total_volume || tokenData.volume_24h || 0;
    const change24h = tokenData.price_change_24h || 0;
    const changePercent24h = tokenData.price_change_percentage_24h || 0;

    return {
      price,
      volume,
      timestamp: Date.now(),
      high24h: tokenData.high_24h || price * 1.1,
      low24h: tokenData.low_24h || price * 0.9,
      change24h,
      changePercent24h,
    };
  }


  async getVolatilityMetrics(tokenAddress: string, period = 24): Promise<VolatilityMetrics> {
    const marketData = await this.getMarketData(tokenAddress);
    const volatilityPercent = Math.abs(marketData.changePercent24h);

    let category: 'low' | 'medium' | 'high';
    if (volatilityPercent < 5) category = 'low';
    else if (volatilityPercent < 15) category = 'medium';
    else category = 'high';

    return {
      current: volatilityPercent,
      category,
      trend: marketData.changePercent24h > 0 ? 'increasing' : 'decreasing',
      confidence: 0.9, // High confidence for real market data
    };
  }

  async getMarketTrend(tokenAddress: string, period = 24): Promise<MarketTrend> {
    const marketData = await this.getMarketData(tokenAddress);

    let direction: 'bullish' | 'bearish' | 'sideways';
    const changePercent = marketData.changePercent24h;

    if (changePercent > 2) direction = 'bullish';
    else if (changePercent < -2) direction = 'bearish';
    else direction = 'sideways';

    return {
      direction,
      strength: Math.abs(changePercent) / 10, // Normalize to 0-1 scale
      duration: period,
      confidence: 0.85, // High confidence for real market data
    };
  }

  async getOptimalIntervals(
    tokenAddress: string,
    budget: number,
    riskLevel: 'conservative' | 'moderate' | 'aggressive'
  ): Promise<{
    recommendedIntervalMins: number;
    recommendedLegs: number;
    amountPerLeg: number;
    reasoning: string;
  }> {
    const volatility = await this.getVolatilityMetrics(tokenAddress);
    const trend = await this.getMarketTrend(tokenAddress);

    let intervalMins: number;
    let legs: number;

    // Base decisions on volatility and risk level
    if (volatility.category === 'high') {
      intervalMins = riskLevel === 'conservative' ? 15 : 30;
      legs = Math.min(Math.max(Math.floor(budget / 50), 12), 20);
    } else if (volatility.category === 'medium') {
      intervalMins = riskLevel === 'conservative' ? 45 : 90;
      legs = Math.min(Math.max(Math.floor(budget / 100), 6), 12);
    } else {
      intervalMins = riskLevel === 'conservative' ? 120 : 240;
      legs = Math.min(Math.max(Math.floor(budget / 200), 4), 8);
    }

    // Budget adjustments
    if (budget < 100) legs = Math.min(legs, 5);
    else if (budget > 1000) legs = Math.max(legs, 8);

    const amountPerLeg = budget / legs;

    const reasoning = `Based on ${volatility.category} volatility (${volatility.current.toFixed(1)}%) and ${trend.direction} trend, recommending ${intervalMins}min intervals with ${legs} legs for ${riskLevel} risk profile.`;

    return {
      recommendedIntervalMins: intervalMins,
      recommendedLegs: legs,
      amountPerLeg,
      reasoning,
    };
  }

  async validateTradingConditions(tokenAddress: string): Promise<{
    isOptimal: boolean;
    score: number;
    factors: {
      volatility: number;
      volume: number;
      trend: number;
      timing: number;
    };
    recommendation: string;
  }> {
    const marketData = await this.getMarketData(tokenAddress);
    const volatility = await this.getVolatilityMetrics(tokenAddress);
    const trend = await this.getMarketTrend(tokenAddress);

    // Score different factors (0-1 scale)
    const volatilityScore = volatility.category === 'medium' ? 1 :
                           volatility.category === 'low' ? 0.8 : 0.6;

    const volumeScore = marketData.volume > 10000000 ? 1 :
                       marketData.volume > 1000000 ? 0.7 : 0.4;

    const trendScore = trend.direction === 'sideways' ? 1 :
                      trend.strength < 0.5 ? 0.8 : 0.6;

    // Calculate timing score based on market hours and network congestion patterns
    const hour = new Date().getUTCHours();
    const isMarketHours = (hour >= 9 && hour <= 16); // Rough market hours
    const timingScore = isMarketHours ? 0.9 : 0.7;

    const factors = {
      volatility: volatilityScore,
      volume: volumeScore,
      trend: trendScore,
      timing: timingScore,
    };

    const score = (volatilityScore + volumeScore + trendScore + timingScore) / 4;
    const isOptimal = score > 0.7;

    let recommendation: string;
    if (score > 0.8) {
      recommendation = "Excellent conditions for DCA execution";
    } else if (score > 0.6) {
      recommendation = "Good conditions, proceed with standard strategy";
    } else {
      recommendation = "Suboptimal conditions, consider adjusting strategy or waiting";
    }

    return { isOptimal, score, factors, recommendation };
  }
}

export const marketDataTool = new MarketDataTool();