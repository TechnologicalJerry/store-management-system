import type { PrismaClient } from '@prisma/client';
import type {
  DatabaseTransactionClient,
  ISystemSettingRepository,
  SystemSettingRecord,
  UpsertSystemSettingDto,
} from '../database.types.js';
import { mapPrismaError } from '../database.errors.js';

/**
 * SystemSettingRepository provides a domain-isolated persistence boundary
 * for managing foundational system configuration parameters.
 */
export class SystemSettingRepository implements ISystemSettingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Helper to resolve either a transaction client or the default Prisma client.
   */
  private getClient(tx?: DatabaseTransactionClient) {
    return tx ?? this.prisma;
  }

  /**
   * Maps a raw database row to a domain SystemSettingRecord.
   */
  private mapToRecord(entity: {
    id: string;
    key: string;
    value: unknown;
    description: string | null;
    isReadOnly: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SystemSettingRecord {
    return {
      id: entity.id,
      key: entity.key,
      value: entity.value,
      description: entity.description,
      isReadOnly: entity.isReadOnly,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Retrieves a setting record by its unique key.
   */
  public async findByKey(
    key: string,
    tx?: DatabaseTransactionClient
  ): Promise<SystemSettingRecord | null> {
    try {
      const client = this.getClient(tx);
      const record = await client.systemSetting.findUnique({
        where: { key },
      });

      if (!record) {
        return null;
      }

      return this.mapToRecord(record);
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  /**
   * Retrieves all system settings.
   */
  public async findAll(tx?: DatabaseTransactionClient): Promise<SystemSettingRecord[]> {
    try {
      const client = this.getClient(tx);
      const records = await client.systemSetting.findMany({
        orderBy: { key: 'asc' },
      });

      return records.map(record => this.mapToRecord(record));
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  /**
   * Inserts or updates a setting record atomically.
   */
  public async upsert(
    dto: UpsertSystemSettingDto,
    tx?: DatabaseTransactionClient
  ): Promise<SystemSettingRecord> {
    try {
      const client = this.getClient(tx);
      const record = await client.systemSetting.upsert({
        where: { key: dto.key },
        create: {
          key: dto.key,
          value: dto.value as object,
          description: dto.description ?? null,
          isReadOnly: dto.isReadOnly ?? false,
        },
        update: {
          value: dto.value as object,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.isReadOnly !== undefined ? { isReadOnly: dto.isReadOnly } : {}),
        },
      });

      return this.mapToRecord(record);
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  /**
   * Deletes a setting record by key. Returns true if removed, false if not found.
   */
  public async deleteByKey(key: string, tx?: DatabaseTransactionClient): Promise<boolean> {
    try {
      const client = this.getClient(tx);
      await client.systemSetting.delete({
        where: { key },
      });
      return true;
    } catch (error) {
      // If record to delete was not found, return false instead of throwing
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2025'
      ) {
        return false;
      }
      throw mapPrismaError(error);
    }
  }
}
