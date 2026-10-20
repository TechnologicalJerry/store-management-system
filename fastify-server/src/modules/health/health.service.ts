import type {
  ComponentHealthCheck,
  LivenessResponse,
  ReadinessResponse,
} from '../../common/types/index.js';

export type ReadinessCheckFn = () => Promise<ComponentHealthCheck> | ComponentHealthCheck;

/**
 * HealthService manages process liveness and extensible readiness probes.
 */
export class HealthService {
  private readonly readinessChecks = new Map<string, ReadinessCheckFn>();

  constructor() {
    // Foundational readiness check: validates process runtime health
    this.registerReadinessCheck('system', () => ({
      status: 'up',
      message: 'Core application system is healthy and ready to accept traffic',
    }));
  }

  /**
   * Registers a dependency check callback (e.g. PostgreSQL, Redis, external APIs).
   * Future stages will leverage this method without modifying the core health architecture.
   */
  public registerReadinessCheck(name: string, checkFn: ReadinessCheckFn): void {
    this.readinessChecks.set(name, checkFn);
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

    for (const [name, checkFn] of this.readinessChecks.entries()) {
      try {
        const start = performance.now();
        const result = await checkFn();
        const latencyMs = Math.round((performance.now() - start) * 100) / 100;

        checks[name] = {
          ...result,
          latencyMs,
        };

        if (result.status === 'down') {
          isReady = false;
        }
      } catch (error) {
        isReady = false;
        checks[name] = {
          status: 'down',
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
}

export const healthService = new HealthService();
