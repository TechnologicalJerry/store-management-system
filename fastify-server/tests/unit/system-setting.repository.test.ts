import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SystemSettingRepository } from '../../src/infrastructure/database/repositories/system-setting.repository.js';
import type { DatabaseTransactionClient } from '../../src/infrastructure/database/database.types.js';

describe('SystemSettingRepository (Unit)', () => {
  let mockPrisma: PrismaClient;
  let repository: SystemSettingRepository;

  const mockDate = new Date('2026-10-19T12:00:00Z');
  const sampleDbRecord = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    key: 'system.app_name',
    value: 'Store Management System',
    description: 'Application display name',
    isReadOnly: false,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  beforeEach(() => {
    mockPrisma = {
      systemSetting: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as PrismaClient;

    repository = new SystemSettingRepository(mockPrisma);
  });

  it('findByKey should return mapped entity when record exists', async () => {
    vi.mocked(mockPrisma.systemSetting.findUnique).mockResolvedValue(sampleDbRecord);

    const result = await repository.findByKey('system.app_name');
    expect(result).toBeDefined();
    expect(result?.key).toBe('system.app_name');
    expect(result?.value).toBe('Store Management System');
    expect(mockPrisma.systemSetting.findUnique).toHaveBeenCalledWith({
      where: { key: 'system.app_name' },
    });
  });

  it('findByKey should return null when record does not exist', async () => {
    vi.mocked(mockPrisma.systemSetting.findUnique).mockResolvedValue(null);

    const result = await repository.findByKey('non.existent.key');
    expect(result).toBeNull();
  });

  it('findAll should return array of mapped records', async () => {
    vi.mocked(mockPrisma.systemSetting.findMany).mockResolvedValue([sampleDbRecord]);

    const results = await repository.findAll();
    expect(results).toHaveLength(1);
    expect(results[0]?.key).toBe('system.app_name');
  });

  it('upsert should persist and return the updated entity', async () => {
    vi.mocked(mockPrisma.systemSetting.upsert).mockResolvedValue(sampleDbRecord);

    const dto = {
      key: 'system.app_name',
      value: 'Store Management System',
      description: 'Application display name',
      isReadOnly: false,
    };

    const result = await repository.upsert(dto);
    expect(result.key).toBe('system.app_name');
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'system.app_name' },
      create: {
        key: dto.key,
        value: dto.value,
        description: dto.description,
        isReadOnly: dto.isReadOnly,
      },
      update: {
        value: dto.value,
        description: dto.description,
        isReadOnly: dto.isReadOnly,
      },
    });
  });

  it('deleteByKey should return true on successful deletion', async () => {
    vi.mocked(mockPrisma.systemSetting.delete).mockResolvedValue(sampleDbRecord);

    const result = await repository.deleteByKey('system.app_name');
    expect(result).toBe(true);
    expect(mockPrisma.systemSetting.delete).toHaveBeenCalledWith({
      where: { key: 'system.app_name' },
    });
  });

  it('deleteByKey should return false when record to delete was not found (P2025)', async () => {
    vi.mocked(mockPrisma.systemSetting.delete).mockRejectedValue({
      code: 'P2025',
      message: 'Record to delete does not exist.',
    });

    const result = await repository.deleteByKey('missing.key');
    expect(result).toBe(false);
  });

  it('should use transaction client when provided', async () => {
    const mockTx = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(sampleDbRecord),
      },
    } as unknown as DatabaseTransactionClient;

    const result = await repository.findByKey('system.app_name', mockTx);
    expect(result?.key).toBe('system.app_name');
    expect(mockTx.systemSetting.findUnique).toHaveBeenCalledOnce();
    expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });
});
