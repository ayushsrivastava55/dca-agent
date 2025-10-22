import { z } from 'zod';
import { eventSystem } from '../events/event-system';

export type ArtifactType =
  | 'dca_plan'
  | 'risk_assessment'
  | 'market_analysis'
  | 'execution_report'
  | 'optimization_result'
  | 'session_summary'
  | 'user_preferences'
  | 'delegation_data';

export interface BaseArtifact {
  id: string;
  type: ArtifactType;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  data: Record<string, unknown>;
  metadata: {
    source: string;
    tags?: string[];
    description?: string;
    parentId?: string;
    childIds?: string[];
  };
  expiresAt?: number;
}

export interface ArtifactQuery {
  sessionId?: string;
  type?: ArtifactType;
  source?: string;
  tags?: string[];
  since?: number;
  until?: number;
  includeExpired?: boolean;
  limit?: number;
}

export const BaseArtifactSchema = z.object({
  id: z.string(),
  type: z.enum([
    'dca_plan',
    'risk_assessment',
    'market_analysis',
    'execution_report',
    'optimization_result',
    'session_summary',
    'user_preferences',
    'delegation_data',
  ]),
  sessionId: z.string(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  version: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()),
  metadata: z.object({
    source: z.string(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
    parentId: z.string().optional(),
    childIds: z.array(z.string()).optional(),
  }),
  expiresAt: z.number().int().positive().optional(),
});

export class ArtifactsManager {
  private artifacts = new Map<string, BaseArtifact>();
  private sessionArtifacts = new Map<string, Set<string>>(); // sessionId -> artifactIds
  private typeIndex = new Map<ArtifactType, Set<string>>(); // type -> artifactIds
  private tagIndex = new Map<string, Set<string>>(); // tag -> artifactIds
  private readonly cleanupInterval = 300000; // 5 minutes

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanup(), this.cleanupInterval);

    // Subscribe to session events
    eventSystem.subscribe(['session_expired'], (event) => {
      if (event.sessionId) {
        this.deleteSessionArtifacts(event.sessionId);
      }
    });
  }

  async create(
    type: ArtifactType,
    sessionId: string,
    data: Record<string, unknown>,
    metadata: Omit<BaseArtifact['metadata'], 'source'> & { source: string },
    options: {
      expiresAt?: number;
      parentId?: string;
    } = {}
  ): Promise<string> {
    const artifactId = this.generateId();
    const now = Date.now();

    const artifact: BaseArtifact = {
      id: artifactId,
      type,
      sessionId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      data,
      metadata: {
        ...metadata,
        childIds: [],
      },
      expiresAt: options.expiresAt,
    };

    // Handle parent-child relationship
    if (options.parentId) {
      const parent = this.artifacts.get(options.parentId);
      if (parent && parent.sessionId === sessionId) {
        artifact.metadata.parentId = options.parentId;
        parent.metadata.childIds = parent.metadata.childIds || [];
        parent.metadata.childIds.push(artifactId);
        parent.updatedAt = now;
      }
    }

    // Store artifact
    this.artifacts.set(artifactId, artifact);

    // Update indexes
    this.updateIndexes(artifact);

    console.log(`[Artifacts] Created ${type} artifact ${artifactId} for session ${sessionId}`);

    // Emit event
    await eventSystem.emit({
      type: 'dca_plan_created', // Will be updated based on artifact type
      sessionId,
      source: 'artifacts_manager',
      data: {
        artifactId,
        artifactType: type,
        dataSize: Object.keys(data).length,
      },
    });

    return artifactId;
  }

  get(artifactId: string): BaseArtifact | null {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return null;

    // Check if expired
    if (artifact.expiresAt && Date.now() > artifact.expiresAt) {
      this.delete(artifactId);
      return null;
    }

    return artifact;
  }

  update(
    artifactId: string,
    updates: {
      data?: Partial<Record<string, unknown>>;
      metadata?: Partial<BaseArtifact['metadata']>;
      expiresAt?: number;
    }
  ): boolean {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return false;

    const now = Date.now();

    // Update data
    if (updates.data) {
      artifact.data = { ...artifact.data, ...updates.data };
    }

    // Update metadata
    if (updates.metadata) {
      artifact.metadata = { ...artifact.metadata, ...updates.metadata };
    }

    // Update expiry
    if (updates.expiresAt !== undefined) {
      artifact.expiresAt = updates.expiresAt;
    }

    artifact.updatedAt = now;
    artifact.version += 1;

    // Update indexes (tags might have changed)
    this.updateIndexes(artifact);

    console.log(`[Artifacts] Updated artifact ${artifactId} to version ${artifact.version}`);
    return true;
  }

  delete(artifactId: string): boolean {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return false;

    // Remove from indexes
    this.removeFromIndexes(artifact);

    // Delete artifact
    this.artifacts.delete(artifactId);

    // Handle child artifacts
    if (artifact.metadata.childIds && artifact.metadata.childIds.length > 0) {
      artifact.metadata.childIds.forEach(childId => this.delete(childId));
    }

    // Update parent
    if (artifact.metadata.parentId) {
      const parent = this.artifacts.get(artifact.metadata.parentId);
      if (parent && parent.metadata.childIds) {
        parent.metadata.childIds = parent.metadata.childIds.filter(id => id !== artifactId);
        parent.updatedAt = Date.now();
      }
    }

    console.log(`[Artifacts] Deleted artifact ${artifactId}`);
    return true;
  }

  query(query: ArtifactQuery): BaseArtifact[] {
    let candidateIds = new Set<string>();

    // Start with type filter if specified
    if (query.type) {
      candidateIds = new Set(this.typeIndex.get(query.type) || []);
    } else {
      candidateIds = new Set(this.artifacts.keys());
    }

    // Apply session filter
    if (query.sessionId) {
      const sessionIds = this.sessionArtifacts.get(query.sessionId) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => sessionIds.has(id)));
    }

    // Apply tag filters
    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        const tagIds = this.tagIndex.get(tag) || new Set();
        candidateIds = new Set([...candidateIds].filter(id => tagIds.has(id)));
      }
    }

    // Get artifacts and apply remaining filters
    let results = [...candidateIds]
      .map(id => this.artifacts.get(id))
      .filter((artifact): artifact is BaseArtifact => artifact !== undefined);

    // Filter by source
    if (query.source) {
      results = results.filter(artifact => artifact.metadata.source === query.source);
    }

    // Filter by time range
    if (query.since) {
      results = results.filter(artifact => artifact.createdAt >= query.since!);
    }

    if (query.until) {
      results = results.filter(artifact => artifact.createdAt <= query.until!);
    }

    // Filter expired artifacts
    if (!query.includeExpired) {
      const now = Date.now();
      results = results.filter(artifact => !artifact.expiresAt || artifact.expiresAt > now);
    }

    // Sort by creation time (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  // Type-specific helpers
  async createDcaPlan(
    sessionId: string,
    plan: Array<{ index: number; amount: number; atISO: string; reasoning?: string }>,
    metadata: {
      budget: number;
      tokenIn: string;
      tokenOut: string;
      riskLevel: string;
      strategy?: string;
    }
  ): Promise<string> {
    return this.create(
      'dca_plan',
      sessionId,
      { plan, ...metadata },
      {
        source: 'dca_agent',
        description: `DCA plan for ${metadata.tokenOut}: ${plan.length} legs, $${metadata.budget} budget`,
        tags: ['dca', 'trading', metadata.riskLevel, metadata.tokenOut],
      }
    );
  }

  async createRiskAssessment(
    sessionId: string,
    assessment: {
      overallRisk: string;
      riskScore: number;
      factors: Record<string, number>;
      recommendations: string[];
      warnings: string[];
    },
    tokenAddress: string
  ): Promise<string> {
    return this.create(
      'risk_assessment',
      sessionId,
      assessment,
      {
        source: 'risk_analysis_tool',
        description: `Risk assessment for ${tokenAddress}: ${assessment.overallRisk} risk`,
        tags: ['risk', 'analysis', assessment.overallRisk, tokenAddress],
      }
    );
  }

  async createMarketAnalysis(
    sessionId: string,
    analysis: {
      tokenAddress: string;
      marketData: Record<string, unknown>;
      volatilityMetrics: Record<string, unknown>;
      marketTrend: Record<string, unknown>;
    }
  ): Promise<string> {
    return this.create(
      'market_analysis',
      sessionId,
      analysis,
      {
        source: 'market_data_tool',
        description: `Market analysis for ${analysis.tokenAddress}`,
        tags: ['market', 'analysis', analysis.tokenAddress],
      }
    );
  }

  async createExecutionReport(
    sessionId: string,
    execution: {
      executionId: string;
      status: string;
      completedLegs: number;
      totalLegs: number;
      totalAmountExecuted: number;
      errors?: string[];
    },
    dcaPlanId: string
  ): Promise<string> {
    return this.create(
      'execution_report',
      sessionId,
      execution,
      {
        source: 'dca_executor',
        description: `Execution report: ${execution.completedLegs}/${execution.totalLegs} legs completed`,
        tags: ['execution', 'report', execution.status],
      },
      { parentId: dcaPlanId }
    );
  }

  // Session management
  getSessionArtifacts(sessionId: string, type?: ArtifactType): BaseArtifact[] {
    return this.query({ sessionId, type });
  }

  deleteSessionArtifacts(sessionId: string): number {
    const sessionArtifactIds = this.sessionArtifacts.get(sessionId) || new Set();
    let deletedCount = 0;

    for (const artifactId of sessionArtifactIds) {
      if (this.delete(artifactId)) {
        deletedCount++;
      }
    }

    this.sessionArtifacts.delete(sessionId);
    console.log(`[Artifacts] Deleted ${deletedCount} artifacts for session ${sessionId}`);
    return deletedCount;
  }

  // Analytics
  getStats(): {
    totalArtifacts: number;
    artifactsByType: Record<ArtifactType, number>;
    artifactsBySession: Record<string, number>;
    expiredArtifacts: number;
    averageArtifactSize: number;
  } {
    const now = Date.now();
    const artifacts = Array.from(this.artifacts.values());

    const artifactsByType = {} as Record<ArtifactType, number>;
    const artifactsBySession = {} as Record<string, number>;
    let expiredCount = 0;
    let totalSize = 0;

    artifacts.forEach(artifact => {
      artifactsByType[artifact.type] = (artifactsByType[artifact.type] || 0) + 1;
      artifactsBySession[artifact.sessionId] = (artifactsBySession[artifact.sessionId] || 0) + 1;

      if (artifact.expiresAt && artifact.expiresAt <= now) {
        expiredCount++;
      }

      totalSize += JSON.stringify(artifact.data).length;
    });

    return {
      totalArtifacts: artifacts.length,
      artifactsByType,
      artifactsBySession,
      expiredArtifacts: expiredCount,
      averageArtifactSize: artifacts.length > 0 ? Math.round(totalSize / artifacts.length) : 0,
    };
  }

  // Export/Import
  exportArtifacts(sessionId?: string): string {
    const artifactsToExport = sessionId
      ? this.getSessionArtifacts(sessionId)
      : Array.from(this.artifacts.values());

    return JSON.stringify(artifactsToExport, null, 2);
  }

  importArtifacts(artifactsJson: string): number {
    try {
      const artifacts = JSON.parse(artifactsJson) as BaseArtifact[];
      let importedCount = 0;

      for (const artifact of artifacts) {
        try {
          const validated = BaseArtifactSchema.parse(artifact);
          this.artifacts.set(validated.id, validated);
          this.updateIndexes(validated);
          importedCount++;
        } catch (error) {
          console.error('[Artifacts] Failed to import artifact:', error);
        }
      }

      console.log(`[Artifacts] Imported ${importedCount} artifacts`);
      return importedCount;
    } catch (error) {
      console.error('[Artifacts] Failed to parse artifacts JSON:', error);
      return 0;
    }
  }

  private updateIndexes(artifact: BaseArtifact): void {
    // Update session index
    let sessionArtifacts = this.sessionArtifacts.get(artifact.sessionId);
    if (!sessionArtifacts) {
      sessionArtifacts = new Set();
      this.sessionArtifacts.set(artifact.sessionId, sessionArtifacts);
    }
    sessionArtifacts.add(artifact.id);

    // Update type index
    let typeArtifacts = this.typeIndex.get(artifact.type);
    if (!typeArtifacts) {
      typeArtifacts = new Set();
      this.typeIndex.set(artifact.type, typeArtifacts);
    }
    typeArtifacts.add(artifact.id);

    // Update tag index
    if (artifact.metadata.tags) {
      for (const tag of artifact.metadata.tags) {
        let tagArtifacts = this.tagIndex.get(tag);
        if (!tagArtifacts) {
          tagArtifacts = new Set();
          this.tagIndex.set(tag, tagArtifacts);
        }
        tagArtifacts.add(artifact.id);
      }
    }
  }

  private removeFromIndexes(artifact: BaseArtifact): void {
    // Remove from session index
    const sessionArtifacts = this.sessionArtifacts.get(artifact.sessionId);
    if (sessionArtifacts) {
      sessionArtifacts.delete(artifact.id);
      if (sessionArtifacts.size === 0) {
        this.sessionArtifacts.delete(artifact.sessionId);
      }
    }

    // Remove from type index
    const typeArtifacts = this.typeIndex.get(artifact.type);
    if (typeArtifacts) {
      typeArtifacts.delete(artifact.id);
      if (typeArtifacts.size === 0) {
        this.typeIndex.delete(artifact.type);
      }
    }

    // Remove from tag index
    if (artifact.metadata.tags) {
      for (const tag of artifact.metadata.tags) {
        const tagArtifacts = this.tagIndex.get(tag);
        if (tagArtifacts) {
          tagArtifacts.delete(artifact.id);
          if (tagArtifacts.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, artifact] of this.artifacts.entries()) {
      if (artifact.expiresAt && artifact.expiresAt <= now) {
        expiredIds.push(id);
      }
    }

    let deletedCount = 0;
    for (const id of expiredIds) {
      if (this.delete(id)) {
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Artifacts] Cleaned up ${deletedCount} expired artifacts`);
    }
  }

  private generateId(): string {
    return `art_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const artifactsManager = new ArtifactsManager();