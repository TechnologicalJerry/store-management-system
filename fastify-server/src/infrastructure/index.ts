/**
 * Infrastructure Layer Boundary
 *
 * This layer is reserved for external client adapters, including:
 * - PostgreSQL / Database client (Stage 2: Implemented)
 * - Redis / Cache client (Stage 4)
 * - Message broker / Event bus adapters (Future Stages)
 */

export * from './database/index.js';

export interface InfrastructureModule {
  name: string;
  isReady: () => Promise<boolean>;
  close: () => Promise<void>;
}
