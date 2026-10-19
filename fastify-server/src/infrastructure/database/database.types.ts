import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * SystemSetting domain entity representation.
 */
export interface SystemSettingRecord {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  isReadOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for creating or updating a SystemSetting.
 */
export interface UpsertSystemSettingDto {
  key: string;
  value: unknown;
  description?: string;
  isReadOnly?: boolean;
}

/**
 * DTO for updating an existing SystemSetting.
 */
export interface UpdateSystemSettingDto {
  value?: unknown;
  description?: string;
}

/**
 * Database connection probe outcome.
 */
export interface DatabaseHealthResult {
  isConnected: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Database client abstraction supporting both top-level client and transactional client.
 */
export type DatabaseClient = PrismaClient;
export type DatabaseTransactionClient = Prisma.TransactionClient;

/**
 * Contract for SystemSetting persistence operations.
 */
export interface ISystemSettingRepository {
  findByKey(key: string, tx?: DatabaseTransactionClient): Promise<SystemSettingRecord | null>;
  findAll(tx?: DatabaseTransactionClient): Promise<SystemSettingRecord[]>;
  upsert(dto: UpsertSystemSettingDto, tx?: DatabaseTransactionClient): Promise<SystemSettingRecord>;
  deleteByKey(key: string, tx?: DatabaseTransactionClient): Promise<boolean>;
}
