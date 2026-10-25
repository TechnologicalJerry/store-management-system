import type { Store } from '@prisma/client';
import type { StoreRepository } from './store.repository.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination.js';
import { getCacheService } from '../../infrastructure/redis/cache.service.js';
import type {
  CreateStoreDto,
  PaginatedStoresResponse,
  StoreQueryDto,
  StoreResponseDto,
  StoreStatus,
  UpdateStoreDto,
} from './store.types.js';

export class StoreService {
  constructor(private readonly storeRepo: StoreRepository) {}

  public formatStore(store: Store): StoreResponseDto {
    return {
      id: store.id,
      name: store.name,
      code: store.code,
      description: store.description,
      email: store.email,
      phone: store.phone,
      addressLine1: store.addressLine1,
      addressLine2: store.addressLine2,
      city: store.city,
      state: store.state,
      postalCode: store.postalCode,
      countryCode: store.countryCode,
      timezone: store.timezone,
      status: store.status as StoreStatus,
      createdAt: store.createdAt.toISOString(),
      updatedAt: store.updatedAt.toISOString(),
    };
  }

  public async createStore(input: CreateStoreDto): Promise<StoreResponseDto> {
    const normalizedCode = input.code.toUpperCase().trim();

    // Check code uniqueness
    const existing = await this.storeRepo.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Store with code '${normalizedCode}' already exists.`);
    }

    const store = await this.storeRepo.create({
      name: input.name.trim(),
      code: normalizedCode,
      description: input.description?.trim(),
      email: input.email?.trim().toLowerCase(),
      phone: input.phone?.trim(),
      addressLine1: input.addressLine1?.trim(),
      addressLine2: input.addressLine2?.trim(),
      city: input.city?.trim(),
      state: input.state?.trim(),
      postalCode: input.postalCode?.trim(),
      countryCode: input.countryCode?.trim().toUpperCase(),
      timezone: input.timezone?.trim() || 'UTC',
    });

    return this.formatStore(store);
  }

  public async getStoreById(storeId: string): Promise<StoreResponseDto> {
    const cache = getCacheService();
    const cacheKey = cache.buildKey('store:meta', storeId);
    return cache.getOrSet(
      cacheKey,
      async () => {
        const store = await this.storeRepo.findById(storeId);
        if (!store) {
          throw new NotFoundError(`Store with ID '${storeId}' not found.`);
        }
        return this.formatStore(store);
      },
      { ttlSeconds: cache.getStoreTtl() }
    );
  }

  public async listStores(query: StoreQueryDto): Promise<PaginatedStoresResponse> {
    const { page, limit, skip, take, sortBy, sortOrder } = parsePagination(query, {
      defaultLimit: 20,
      defaultSortBy: 'createdAt',
      defaultSortOrder: 'desc',
    });

    const [stores, totalItems] = await Promise.all([
      this.storeRepo.findMany({
        skip,
        take,
        status: query.status,
        search: query.search?.trim(),
        sortBy,
        sortOrder,
      }),
      this.storeRepo.count({
        status: query.status,
        search: query.search?.trim(),
      }),
    ]);

    const formattedStores = stores.map(store => this.formatStore(store));
    return buildPaginatedResponse(formattedStores, totalItems, page, limit);
  }

  public async updateStore(storeId: string, input: UpdateStoreDto): Promise<StoreResponseDto> {
    const existing = await this.storeRepo.findById(storeId);
    if (!existing) {
      throw new NotFoundError(`Store with ID '${storeId}' not found.`);
    }

    const updated = await this.storeRepo.update(storeId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1.trim() } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2.trim() } : {}),
      ...(input.city !== undefined ? { city: input.city.trim() } : {}),
      ...(input.state !== undefined ? { state: input.state.trim() } : {}),
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode.trim() } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode.trim().toUpperCase() } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
    });

    // Invalidate store cache after update
    void getCacheService().invalidateStore(storeId).catch(() => {});

    return this.formatStore(updated);
  }

  public async updateStoreStatus(storeId: string, status: StoreStatus): Promise<StoreResponseDto> {
    const existing = await this.storeRepo.findById(storeId);
    if (!existing) {
      throw new NotFoundError(`Store with ID '${storeId}' not found.`);
    }

    const updated = await this.storeRepo.update(storeId, { status });

    // Invalidate store cache after status change
    void getCacheService().invalidateStore(storeId).catch(() => {});

    return this.formatStore(updated);
  }
}
