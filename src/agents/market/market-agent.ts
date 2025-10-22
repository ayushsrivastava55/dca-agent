import { marketDataTool } from '../tools/market-data';
import { eventSystem } from '../events/event-system';
import { artifactsManager } from '../artifacts/artifacts-manager';
import { sessionStateManager } from '../tools/session-state';

export interface MarketAnalysisRequest {
  sessionId: string;
  tokenAddress: string;
  analysisType?: 'quick' | 'detailed' | 'comprehensive';
  timeframe?: '1h' | '4h' | '24h' | '7d';
  includeRecommendations?: boolean;
}

export interface MarketAnalysisResult {
  sessionId: string;
  tokenAddress: string;
  timestamp: number;
  marketData: {
    price: number;
    volume: number;
    high24h: number;
    low24h: number;
    change24h: number;
    changePercent24h: number;
  };
  volatilityAnalysis: {
    current: number;
    category: 'low' | 'medium' | 'high';
    trend: 'increasing' | 'decreasing' | 'stable';
    confidence: number;
  };
  trendAnalysis: {
    direction: 'bullish' | 'bearish' | 'sideways';
    strength: number;
    duration: number;
    confidence: number;
  };
  tradingConditions: {
    isOptimal: boolean;
    score: number;
    factors: {
      volatility: number;
      volume: number;
      trend: number;
      timing: number;
    };
    recommendation: string;
  };
  dcaRecommendations?: {
    optimalIntervals: {
      conservative: number;
      moderate: number;
      aggressive: number;
    };
    recommendedLegs: {
      conservative: number;
      moderate: number;
      aggressive: number;
    };
    riskFactors: string[];
    opportunities: string[];
  };
  artifactId: string;
}

export class MarketAnalysisAgent {
  private analysisCache = new Map<string, { result: MarketAnalysisResult; timestamp: number }>();
  private readonly cacheTimeout = 300000; // 5 minutes

  constructor() {
    // Subscribe to market data updates
    eventSystem.subscribe(['market_data_updated'], async (event) => {
      if (event.data.tokenAddress) {
        await this.handleMarketDataUpdate(event.data.tokenAddress as string, event.sessionId);
      }
    });
  }

  async analyzeMarket(request: MarketAnalysisRequest): Promise<MarketAnalysisResult> {
    const { sessionId, tokenAddress, analysisType = 'detailed', includeRecommendations = true } = request;

    console.log(`[MarketAgent] Starting ${analysisType} analysis for ${tokenAddress} in session ${sessionId}`);

    try {
      // Check cache first
      const cacheKey = `${tokenAddress}_${analysisType}`;
      const cached = this.analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[MarketAgent] Returning cached analysis for ${tokenAddress}`);
        return cached.result;
      }

      // Gather market data
      const marketData = await marketDataTool.getMarketData(tokenAddress);
      const volatilityMetrics = await marketDataTool.getVolatilityMetrics(tokenAddress);
      const marketTrend = await marketDataTool.getMarketTrend(tokenAddress);
      const tradingConditions = await marketDataTool.validateTradingConditions(tokenAddress);

      // Generate DCA recommendations if requested
      let dcaRecommendations: MarketAnalysisResult['dcaRecommendations'];
      if (includeRecommendations) {
        dcaRecommendations = await this.generateDcaRecommendations(tokenAddress, marketData, volatilityMetrics, marketTrend);
      }

      // Create analysis result
      const result: MarketAnalysisResult = {
        sessionId,
        tokenAddress,
        timestamp: Date.now(),
        marketData: {
          price: marketData.price,
          volume: marketData.volume,
          high24h: marketData.high24h,
          low24h: marketData.low24h,
          change24h: marketData.change24h,
          changePercent24h: marketData.changePercent24h,
        },
        volatilityAnalysis: volatilityMetrics,
        trendAnalysis: marketTrend,
        tradingConditions,
        dcaRecommendations,
        artifactId: '', // Will be set after artifact creation
      };

      // Store as artifact
      const artifactId = await artifactsManager.createMarketAnalysis(sessionId, {
        tokenAddress,
        marketData: result.marketData,
        volatilityMetrics: result.volatilityAnalysis,
        marketTrend: result.trendAnalysis,
      });

      result.artifactId = artifactId;

      // Update session state
      sessionStateManager.updateState(sessionId, {
        [`market_analysis_${tokenAddress}`]: {
          lastUpdate: result.timestamp,
          volatility: volatilityMetrics.category,
          trend: marketTrend.direction,
          tradingScore: tradingConditions.score,
          artifactId,
        },
        market_volatility: volatilityMetrics.category,
        market_trend: marketTrend.direction,
        price_change_24h: `${marketData.changePercent24h.toFixed(2)}%`,
        volume_analysis: `${(marketData.volume / 1000000).toFixed(1)}M`,
      });

      // Cache result
      this.analysisCache.set(cacheKey, { result, timestamp: Date.now() });

      // Emit analysis completion event
      await eventSystem.emitMarketDataUpdated(tokenAddress, result.marketData, {
        analysisType,
        artifactId,
        tradingScore: tradingConditions.score,
      });

      console.log(`[MarketAgent] Completed ${analysisType} analysis for ${tokenAddress}`);
      return result;

    } catch (error) {
      console.error(`[MarketAgent] Analysis failed for ${tokenAddress}:`, error);

      await eventSystem.emitAgentError(
        'market_analysis_agent',
        error instanceof Error ? error : String(error),
        sessionId,
        { tokenAddress, analysisType }
      );

      throw error;
    }
  }

  async getHistoricalAnalysis(tokenAddress: string, sessionId?: string): Promise<MarketAnalysisResult[]> {
    const artifacts = artifactsManager.query({
      type: 'market_analysis',
      sessionId,
      source: 'market_data_tool',
    });

    return artifacts
      .filter(artifact => artifact.data.tokenAddress === tokenAddress)
      .map(artifact => ({
        sessionId: artifact.sessionId,
        tokenAddress: artifact.data.tokenAddress as string,
        timestamp: artifact.createdAt,
        marketData: artifact.data.marketData as any,
        volatilityAnalysis: artifact.data.volatilityMetrics as any,
        trendAnalysis: artifact.data.marketTrend as any,
        tradingConditions: { isOptimal: true, score: 0.8, factors: { volatility: 0.8, volume: 0.8, trend: 0.8, timing: 0.8 }, recommendation: 'Historical data' },
        artifactId: artifact.id,
      }));
  }

  async compareTokens(
    tokenAddresses: string[],
    sessionId: string,
    criteria: {
      volatilityWeight?: number;
      volumeWeight?: number;
      trendWeight?: number;
      timingWeight?: number;
    } = {}
  ): Promise<{
    rankings: Array<{
      tokenAddress: string;
      score: number;
      analysis: MarketAnalysisResult;
    }>;
    recommendations: string[];
  }> {
    const {
      volatilityWeight = 0.3,
      volumeWeight = 0.25,
      trendWeight = 0.25,
      timingWeight = 0.2,
    } = criteria;

    console.log(`[MarketAgent] Comparing ${tokenAddresses.length} tokens for session ${sessionId}`);

    const analyses = await Promise.all(
      tokenAddresses.map(address =>
        this.analyzeMarket({ sessionId, tokenAddress: address, analysisType: 'quick' })
      )
    );

    // Calculate composite scores
    const rankings = analyses.map(analysis => {
      const { tradingConditions } = analysis;
      const score = (
        tradingConditions.factors.volatility * volatilityWeight +
        tradingConditions.factors.volume * volumeWeight +
        tradingConditions.factors.trend * trendWeight +
        tradingConditions.factors.timing * timingWeight
      );

      return {
        tokenAddress: analysis.tokenAddress,
        score,
        analysis,
      };
    });

    // Sort by score (descending)
    rankings.sort((a, b) => b.score - a.score);

    // Generate recommendations
    const recommendations: string[] = [];
    const topToken = rankings[0];
    const worstToken = rankings[rankings.length - 1];

    if (topToken.score > 0.8) {
      recommendations.push(`${topToken.tokenAddress} shows excellent DCA conditions (score: ${(topToken.score * 100).toFixed(1)}%)`);
    } else if (topToken.score > 0.6) {
      recommendations.push(`${topToken.tokenAddress} shows good DCA conditions with some considerations`);
    } else {
      recommendations.push(`Market conditions are suboptimal for all analyzed tokens. Consider waiting or adjusting strategy.`);
    }

    if (worstToken.score < 0.4) {
      recommendations.push(`Avoid ${worstToken.tokenAddress} due to poor trading conditions (score: ${(worstToken.score * 100).toFixed(1)}%)`);
    }

    // Check for high volatility tokens
    const highVolTokens = rankings.filter(r => r.analysis.volatilityAnalysis.category === 'high');
    if (highVolTokens.length > 0) {
      recommendations.push(`High volatility detected in: ${highVolTokens.map(t => t.tokenAddress).join(', ')}. Consider more frequent, smaller trades.`);
    }

    console.log(`[MarketAgent] Token comparison completed. Top token: ${topToken.tokenAddress} (${(topToken.score * 100).toFixed(1)}%)`);

    return { rankings, recommendations };
  }

  private async generateDcaRecommendations(
    tokenAddress: string,
    marketData: any,
    volatilityMetrics: any,
    marketTrend: any
  ): Promise<MarketAnalysisResult['dcaRecommendations']> {
    const baseIntervals = {
      conservative: 120, // 2 hours
      moderate: 60,      // 1 hour
      aggressive: 30,    // 30 minutes
    };

    const baseLegs = {
      conservative: 12,
      moderate: 8,
      aggressive: 6,
    };

    // Adjust based on volatility
    const volatilityMultiplier = volatilityMetrics.category === 'high' ? 0.5 :
                                volatilityMetrics.category === 'medium' ? 0.75 : 1.25;

    const optimalIntervals = {
      conservative: Math.round(baseIntervals.conservative * volatilityMultiplier),
      moderate: Math.round(baseIntervals.moderate * volatilityMultiplier),
      aggressive: Math.round(baseIntervals.aggressive * volatilityMultiplier),
    };

    const legMultiplier = volatilityMetrics.category === 'high' ? 1.5 :
                         volatilityMetrics.category === 'medium' ? 1.2 : 0.8;

    const recommendedLegs = {
      conservative: Math.round(baseLegs.conservative * legMultiplier),
      moderate: Math.round(baseLegs.moderate * legMultiplier),
      aggressive: Math.round(baseLegs.aggressive * legMultiplier),
    };

    // Generate risk factors and opportunities
    const riskFactors: string[] = [];
    const opportunities: string[] = [];

    if (volatilityMetrics.category === 'high') {
      riskFactors.push('High price volatility may result in poor execution timing');
      opportunities.push('High volatility creates better dollar-cost averaging opportunities');
    }

    if (marketData.volume < 1000000) {
      riskFactors.push('Low trading volume may impact execution quality');
    } else {
      opportunities.push('Good liquidity supports efficient trade execution');
    }

    if (marketTrend.direction === 'bearish' && marketTrend.strength > 0.6) {
      riskFactors.push('Strong bearish trend may continue short-term');
      opportunities.push('Bearish conditions may present good entry opportunities for long-term DCA');
    } else if (marketTrend.direction === 'bullish' && marketTrend.strength > 0.6) {
      riskFactors.push('Strong bullish trend may lead to buying at peaks');
      opportunities.push('Bullish momentum supports DCA strategy');
    }

    if (Math.abs(marketData.changePercent24h) > 15) {
      riskFactors.push('Extreme price movement in last 24h indicates high volatility');
    }

    return {
      optimalIntervals,
      recommendedLegs,
      riskFactors,
      opportunities,
    };
  }

  private async handleMarketDataUpdate(tokenAddress: string, sessionId?: string): Promise<void> {
    console.log(`[MarketAgent] Handling market data update for ${tokenAddress}`);

    // Clear cache for this token
    for (const [key] of this.analysisCache.entries()) {
      if (key.startsWith(tokenAddress)) {
        this.analysisCache.delete(key);
      }
    }

    // If we have a session, trigger analysis update
    if (sessionId) {
      try {
        await this.analyzeMarket({
          sessionId,
          tokenAddress,
          analysisType: 'quick',
          includeRecommendations: false,
        });
      } catch (error) {
        console.error(`[MarketAgent] Failed to update analysis for ${tokenAddress}:`, error);
      }
    }
  }

  // Analytics and monitoring
  getAnalysisStats(): {
    totalAnalyses: number;
    cacheHitRate: number;
    averageAnalysisTime: number;
    mostAnalyzedTokens: Array<{ token: string; count: number }>;
  } {
    // This would be implemented with proper metrics collection
    return {
      totalAnalyses: this.analysisCache.size,
      cacheHitRate: 0.75, // Mock value
      averageAnalysisTime: 1200, // Mock value in ms
      mostAnalyzedTokens: [], // Mock value
    };
  }
}

export const marketAnalysisAgent = new MarketAnalysisAgent();