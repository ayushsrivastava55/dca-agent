import { z } from 'zod';
import type { MarketDataPoint, VolatilityMetrics } from './market-data';

export interface RiskProfile {
  level: 'conservative' | 'moderate' | 'aggressive';
  maxVolatilityTolerance: number;
  maxSingleLegPercent: number;
  minLegs: number;
  maxLegs: number;
  preferredIntervalRange: [number, number]; // [min, max] in minutes
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'extreme';
  riskScore: number; // 0-1 scale
  factors: {
    volatilityRisk: number;
    liquidityRisk: number;
    timingRisk: number;
    concentrationRisk: number;
  };
  recommendations: string[];
  warnings: string[];
}

export interface PositionSizing {
  maxPositionSize: number;
  recommendedLegSize: number;
  safetyMargin: number;
  reasoning: string;
}

export const RiskProfileSchema = z.object({
  level: z.enum(['conservative', 'moderate', 'aggressive']),
  maxVolatilityTolerance: z.number().min(0).max(100),
  maxSingleLegPercent: z.number().min(0).max(100),
  minLegs: z.number().int().min(1),
  maxLegs: z.number().int().min(1),
  preferredIntervalRange: z.tuple([z.number().min(1), z.number().min(1)]),
});

export const RiskAssessmentSchema = z.object({
  overallRisk: z.enum(['low', 'medium', 'high', 'extreme']),
  riskScore: z.number().min(0).max(1),
  factors: z.object({
    volatilityRisk: z.number().min(0).max(1),
    liquidityRisk: z.number().min(0).max(1),
    timingRisk: z.number().min(0).max(1),
    concentrationRisk: z.number().min(0).max(1),
  }),
  recommendations: z.array(z.string()),
  warnings: z.array(z.string()),
});

export class RiskAnalysisTool {
  private riskProfiles: Record<string, RiskProfile> = {
    conservative: {
      level: 'conservative',
      maxVolatilityTolerance: 10,
      maxSingleLegPercent: 8,
      minLegs: 8,
      maxLegs: 20,
      preferredIntervalRange: [60, 240], // 1-4 hours
    },
    moderate: {
      level: 'moderate',
      maxVolatilityTolerance: 20,
      maxSingleLegPercent: 15,
      minLegs: 6,
      maxLegs: 15,
      preferredIntervalRange: [30, 180], // 30min-3hours
    },
    aggressive: {
      level: 'aggressive',
      maxVolatilityTolerance: 40,
      maxSingleLegPercent: 25,
      minLegs: 4,
      maxLegs: 12,
      preferredIntervalRange: [15, 120], // 15min-2hours
    },
  };

  getRiskProfile(level: 'conservative' | 'moderate' | 'aggressive'): RiskProfile {
    return this.riskProfiles[level];
  }

  async assessMarketRisk(
    marketData: MarketDataPoint,
    volatilityMetrics: VolatilityMetrics,
    userRiskLevel: 'conservative' | 'moderate' | 'aggressive'
  ): Promise<RiskAssessment> {
    const profile = this.getRiskProfile(userRiskLevel);

    // Calculate individual risk factors
    const volatilityRisk = Math.min(volatilityMetrics.current / profile.maxVolatilityTolerance, 1);

    const liquidityRisk = marketData.volume < 1000000 ? 0.8 :
                         marketData.volume < 10000000 ? 0.4 : 0.1;

    const timingRisk = this.calculateTimingRisk(marketData);

    const concentrationRisk = 0.2; // Base concentration risk

    const factors = {
      volatilityRisk,
      liquidityRisk,
      timingRisk,
      concentrationRisk,
    };

    // Calculate overall risk score (weighted average)
    const riskScore = (
      volatilityRisk * 0.4 +
      liquidityRisk * 0.3 +
      timingRisk * 0.2 +
      concentrationRisk * 0.1
    );

    // Determine overall risk level
    let overallRisk: 'low' | 'medium' | 'high' | 'extreme';
    if (riskScore < 0.3) overallRisk = 'low';
    else if (riskScore < 0.6) overallRisk = 'medium';
    else if (riskScore < 0.85) overallRisk = 'high';
    else overallRisk = 'extreme';

    // Generate recommendations and warnings
    const recommendations = this.generateRecommendations(factors, profile, marketData);
    const warnings = this.generateWarnings(factors, overallRisk, marketData);

    return {
      overallRisk,
      riskScore,
      factors,
      recommendations,
      warnings,
    };
  }

  private calculateTimingRisk(marketData: MarketDataPoint): number {
    // Simple timing risk based on recent price action
    const priceVolatility = Math.abs(marketData.changePercent24h) / 100;
    const hourOfDay = new Date().getHours();

    // Higher risk during low activity hours (2-6 AM UTC)
    const timeRisk = (hourOfDay >= 2 && hourOfDay <= 6) ? 0.3 : 0.1;

    return Math.min(priceVolatility + timeRisk, 1);
  }

  private generateRecommendations(
    factors: RiskAssessment['factors'],
    profile: RiskProfile,
    marketData: MarketDataPoint
  ): string[] {
    const recommendations: string[] = [];

    if (factors.volatilityRisk > 0.7) {
      recommendations.push(`High volatility detected (${(factors.volatilityRisk * 100).toFixed(1)}%). Consider increasing number of legs to ${profile.maxLegs} for better averaging.`);
    }

    if (factors.liquidityRisk > 0.5) {
      recommendations.push("Low liquidity detected. Consider smaller position sizes and longer intervals between trades.");
    }

    if (factors.timingRisk > 0.6) {
      recommendations.push("Suboptimal timing conditions. Consider delaying execution or using longer intervals.");
    }

    if (marketData.changePercent24h > 10) {
      recommendations.push("Strong upward movement detected. Consider adjusting entry strategy to avoid FOMO buying.");
    } else if (marketData.changePercent24h < -10) {
      recommendations.push("Strong downward movement detected. This may present a good DCA opportunity.");
    }

    if (recommendations.length === 0) {
      recommendations.push("Market conditions are favorable for standard DCA execution.");
    }

    return recommendations;
  }

  private generateWarnings(
    factors: RiskAssessment['factors'],
    overallRisk: 'low' | 'medium' | 'high' | 'extreme',
    marketData: MarketDataPoint
  ): string[] {
    const warnings: string[] = [];

    if (overallRisk === 'extreme') {
      warnings.push("EXTREME RISK: Consider postponing DCA execution until market conditions stabilize.");
    }

    if (factors.volatilityRisk > 0.8) {
      warnings.push(`VOLATILITY WARNING: Current volatility (${(factors.volatilityRisk * 100).toFixed(1)}%) exceeds safe thresholds.`);
    }

    if (factors.liquidityRisk > 0.7) {
      warnings.push("LIQUIDITY WARNING: Low trading volume may result in poor execution prices.");
    }

    if (Math.abs(marketData.changePercent24h) > 20) {
      warnings.push(`PRICE MOVEMENT WARNING: Extreme 24h price change (${marketData.changePercent24h.toFixed(1)}%) detected.`);
    }

    return warnings;
  }

  calculatePositionSizing(
    totalBudget: number,
    riskAssessment: RiskAssessment,
    userRiskLevel: 'conservative' | 'moderate' | 'aggressive',
    numberOfLegs: number
  ): PositionSizing {
    const profile = this.getRiskProfile(userRiskLevel);

    // Calculate base leg size
    const baseLegSize = totalBudget / numberOfLegs;

    // Apply risk adjustments
    const riskAdjustment = 1 - (riskAssessment.riskScore * 0.3); // Reduce size by up to 30%
    const adjustedLegSize = baseLegSize * riskAdjustment;

    // Ensure we don't exceed max single leg percentage
    const maxLegSize = (totalBudget * profile.maxSingleLegPercent) / 100;
    const recommendedLegSize = Math.min(adjustedLegSize, maxLegSize);

    // Calculate safety margin
    const safetyMargin = (baseLegSize - recommendedLegSize) / baseLegSize;

    const reasoning = `Adjusted leg size from $${baseLegSize.toFixed(2)} to $${recommendedLegSize.toFixed(2)} based on ${riskAssessment.overallRisk} risk assessment (${(riskAssessment.riskScore * 100).toFixed(1)}% risk score).`;

    return {
      maxPositionSize: totalBudget,
      recommendedLegSize,
      safetyMargin,
      reasoning,
    };
  }

  validateDcaPlan(
    plan: Array<{ index: number; amount: number; atISO: string }> | undefined,
    totalBudget: number,
    riskAssessment: RiskAssessment,
    userRiskLevel: 'conservative' | 'moderate' | 'aggressive'
  ): {
    isValid: boolean;
    issues: string[];
    adjustments: string[];
  } {
    const issues: string[] = [];
    const adjustments: string[] = [];
    const profile = this.getRiskProfile(userRiskLevel);

    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      return { isValid: false, issues: ['Plan empty or invalid'], adjustments };
    }

    // Check total amount
    const totalAmount = plan.reduce((sum, leg) => sum + (Number(leg.amount) || 0), 0);
    if (Math.abs(totalAmount - totalBudget) > 0.01) {
      issues.push(`Total plan amount ($${totalAmount}) doesn't match budget ($${totalBudget})`);
    }

    // Check leg count
    if (plan.length < profile.minLegs) {
      issues.push(`Too few legs (${plan.length}), minimum for ${userRiskLevel} is ${profile.minLegs}`);
      adjustments.push(`Increase to at least ${profile.minLegs} legs`);
    } else if (plan.length > profile.maxLegs) {
      issues.push(`Too many legs (${plan.length}), maximum for ${userRiskLevel} is ${profile.maxLegs}`);
      adjustments.push(`Reduce to maximum ${profile.maxLegs} legs`);
    }

    // Check individual leg sizes
    const maxLegSize = (totalBudget * profile.maxSingleLegPercent) / 100;
    plan.forEach((leg, i) => {
      if (leg.amount > maxLegSize) {
        issues.push(`Leg ${i + 1} amount ($${leg.amount}) exceeds ${profile.maxSingleLegPercent}% limit ($${maxLegSize})`);
        adjustments.push(`Reduce leg ${i + 1} to maximum $${maxLegSize}`);
      }
    });

    // Check timing intervals
    if (plan.length > 1) {
      for (let i = 1; i < plan.length; i++) {
        const prevTime = new Date(plan[i - 1].atISO).getTime();
        const currTime = new Date(plan[i].atISO).getTime();
        const intervalMins = (currTime - prevTime) / (1000 * 60);

        if (intervalMins < profile.preferredIntervalRange[0]) {
          issues.push(`Interval between legs ${i} and ${i + 1} (${intervalMins}min) is too short`);
          adjustments.push(`Increase intervals to at least ${profile.preferredIntervalRange[0]} minutes`);
        } else if (intervalMins > profile.preferredIntervalRange[1]) {
          issues.push(`Interval between legs ${i} and ${i + 1} (${intervalMins}min) is too long`);
          adjustments.push(`Reduce intervals to maximum ${profile.preferredIntervalRange[1]} minutes`);
        }
      }
    }

    // Risk-based adjustments
    if (riskAssessment.overallRisk === 'high' || riskAssessment.overallRisk === 'extreme') {
      adjustments.push("Consider increasing number of legs due to high market risk");
      adjustments.push("Consider reducing individual leg sizes for better risk distribution");
    }

    return {
      isValid: issues.length === 0,
      issues,
      adjustments,
    };
  }
}

export const riskAnalysisTool = new RiskAnalysisTool();