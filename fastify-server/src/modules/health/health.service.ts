import type {
  ComponentHealthCheck,
  LivenessResponse,
  ReadinessResponse,
} from '../../common/types/index.js';

export type ReadinessCheckFn = () => Promise<ComponentHealthCheck> | ComponentHealthCheck;

export interface RegisteredCheck {
  checkFn: ReadinessCheckFn;
  isCritical: boolean;
}

/**
 * HealthService manages process liveness, extensible readiness probes,
 * and restricted operational diagnostics.
 */
export class HealthService {
  private readonly readinessChecks = new Map<string, RegisteredCheck>();

  constructor() {
    // Foundational readiness check: validates process runtime health
    this.registerReadinessCheck(
      'system',
      () => ({
        status: 'up',
        message: 'Core application system is healthy and ready to accept traffic',
      }),
      true
    );
  }

  /**
   * Registers a dependency check callback.
   * @param name Unique dependency identifier (e.g. 'database', 'redis')
   * @param checkFn Function returning ComponentHealthCheck
   * @param isCritical When true, dependency outage marks entire application unready (503).
   *                   When false (e.g. ephemeral Redis cache), failure is reported as degraded
   *                   without blocking core API readiness.
   */
  public registerReadinessCheck(
    name: string,
    checkFn: ReadinessCheckFn,
    isCritical = true
  ): void {
    this.readinessChecks.set(name, { checkFn, isCritical });
  }

  /**
   * Unregisters a readiness check (primarily for testing and dynamic modules).
   */
  public unregisterReadinessCheck(name: string): void {
    this.readinessChecks.delete(name);
  }

  /**
   * Returns process liveness. Lightweight and independent of external dependencies.
   */
  public getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Evaluates all registered component checks to determine overall traffic readiness.
   */
  public async getReadiness(): Promise<{ isReady: boolean; response: ReadinessResponse }> {
    const checks: Record<string, ComponentHealthCheck> = {};
    let isReady = true;

    for (const [name, entry] of this.readinessChecks.entries()) {
      try {
        const start = performance.now();
        const result = await entry.checkFn();
        const latencyMs = Math.round((performance.now() - start) * 100) / 100;

        checks[name] = {
          ...result,
          latencyMs,
        };

        if (result.status === 'down') {
          // Non-critical dependencies (e.g. Redis cache) degrade without taking down API readiness
          if (entry.isCritical) {
            isReady = false;
          } else {
            checks[name].status = 'degraded';
          }
        }
      } catch (error) {
        if (entry.isCritical) {
          isReady = false;
        }
        checks[name] = {
          status: entry.isCritical ? 'down' : 'degraded',
          message: error instanceof Error ? error.message : 'Component check failed',
        };
      }
    }

    return {
      isReady,
      response: {
        status: isReady ? 'ready' : 'unavailable',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        checks,
      },
    };
  }

  /**
   * Gathers non-sensitive runtime diagnostics for authorized administrative review.
   */
  public async getDiagnostics(additional?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const memory = process.memoryUsage();
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
          heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
          rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
        },
      },
      ...additional,
    };
  }
}

export const healthService = new HealthService();
