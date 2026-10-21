import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreService } from '../../src/modules/stores/store.service.js';
import type { StoreRepository } from '../../src/modules/stores/store.repository.js';
import { ConflictError, NotFoundError } from '../../src/common/errors/app-error.js';

describe('StoreService (Unit)', () => {
  let mockStoreRepo: StoreRepository;
  let storeService: StoreService;

  const mockDate = new Date('2026-10-21T10:00:00Z');
  const sampleStore = {
    id: '11111111-1111-4111-a111-111111111111',
    name: 'Downtown Flagship',
    code: 'STORE-001',
    description: 'Central location',
    email: 'downtown@store.local',
    phone: '+1-555-0100',
    addressLine1: '100 Main St',
    addressLine2: 'Suite 200',
    city: 'Metropolis',
    state: 'NY',
    postalCode: '10001',
    countryCode: 'USA',
    timezone: 'America/New_York',
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    deletedAt: null,
  };

  beforeEach(() => {
    mockStoreRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    } as unknown as StoreRepository;

    storeService = new StoreService(mockStoreRepo);
  });

  describe('createStore', () => {
    it('should create a store with uppercase normalized code', async () => {
      vi.mocked(mockStoreRepo.findByCode).mockResolvedValue(null);
      vi.mocked(mockStoreRepo.create).mockResolvedValue(sampleStore);

      const result = await storeService.createStore({
        name: 'Downtown Flagship',
        code: 'store-001', // lowercase input
        timezone: 'America/New_York',
      });

      expect(mockStoreRepo.findByCode).toHaveBeenCalledWith('STORE-001');
      expect(mockStoreRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'STORE-001',
          name: 'Downtown Flagship',
        })
      );
      expect(result.code).toBe('STORE-001');
    });

    it('should throw ConflictError when store code already exists', async () => {
      vi.mocked(mockStoreRepo.findByCode).mockResolvedValue(sampleStore);

      await expect(
        storeService.createStore({
          name: 'Another Store',
          code: 'STORE-001',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getStoreById', () => {
    it('should return formatted store when found', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue(sampleStore);

      const result = await storeService.getStoreById(sampleStore.id);
      expect(result.id).toBe(sampleStore.id);
      expect(result.name).toBe(sampleStore.name);
    });

    it('should throw NotFoundError when store is not found', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue(null);

      await expect(storeService.getStoreById('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listStores', () => {
    it('should return paginated stores', async () => {
      vi.mocked(mockStoreRepo.findMany).mockResolvedValue([sampleStore]);
      vi.mocked(mockStoreRepo.count).mockResolvedValue(1);

      const result = await storeService.listStores({ page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(result.pagination.page).toBe(1);
    });
  });

  describe('updateStoreStatus', () => {
    it('should update status when store exists', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue(sampleStore);
      vi.mocked(mockStoreRepo.update).mockResolvedValue({
        ...sampleStore,
        status: 'SUSPENDED',
      });

      const result = await storeService.updateStoreStatus(sampleStore.id, 'SUSPENDED');
      expect(mockStoreRepo.update).toHaveBeenCalledWith(sampleStore.id, { status: 'SUSPENDED' });
      expect(result.status).toBe('SUSPENDED');
    });

    it('should throw NotFoundError when updating status of non-existent store', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue(null);

      await expect(
        storeService.updateStoreStatus('non-existent-id', 'SUSPENDED')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
