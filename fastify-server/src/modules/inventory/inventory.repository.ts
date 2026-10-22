import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  InventoryQueryDto,
  MovementQueryDto,
  TransferQueryDto,
} from './inventory.types.js';

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class InventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: PrismaTransactionClient): PrismaTransactionClient {
    return tx ?? this.prisma;
  }

  // ============================================================================
  // Inventory Balance Operations
  // ============================================================================

  /**
   * Retrieves an inventory balance by store and variant.
   */
  async findBalance(storeId: string, variantId: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.inventoryBalance.findUnique({
      where: {
        uq_inventory_balances_store_variant: {
          storeId,
          variantId,
        },
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        },
        variant: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                categoryId: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Acquires a row-level lock (FOR UPDATE) on an inventory balance record in a transaction.
   * Parameterized via Prisma sql template tag for SQL injection safety.
   */
  async findBalanceForUpdate(storeId: string, variantId: string, tx: PrismaTransactionClient) {
    const results = await tx.$queryRaw<
      Array<{
        id: string;
        store_id: string;
        variant_id: string;
        quantity_on_hand: Prisma.Decimal;
        quantity_reserved: Prisma.Decimal;
        reorder_level: Prisma.Decimal;
      }>
    >`
      SELECT id, store_id, variant_id, quantity_on_hand, quantity_reserved, reorder_level
      FROM inventory_balances
      WHERE store_id = ${storeId}::uuid AND variant_id = ${variantId}::uuid
      FOR UPDATE
    `;

    return results[0] ?? null;
  }

  /**
   * Concurrency-safe balance initialization using atomic upsert.
   */
  async ensureBalanceExists(
    storeId: string,
    variantId: string,
    initialOnHand = new Prisma.Decimal('0.0000'),
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.inventoryBalance.upsert({
      where: {
        uq_inventory_balances_store_variant: {
          storeId,
          variantId,
        },
      },
      update: {},
      create: {
        storeId,
        variantId,
        quantityOnHand: initialOnHand,
        quantityReserved: new Prisma.Decimal('0.0000'),
        reorderLevel: new Prisma.Decimal('0.0000'),
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        variant: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Updates balance quantities.
   */
  async updateBalance(
    id: string,
    data: {
      quantityOnHand?: Prisma.Decimal;
      quantityReserved?: Prisma.Decimal;
      reorderLevel?: Prisma.Decimal;
    },
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.inventoryBalance.update({
      where: { id },
      data,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        variant: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Lists inventory balances with filtering and pagination.
   */
  async listBalances(
    storeId: string,
    query: InventoryQueryDto,
    skip: number,
    take: number,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    const where: Prisma.InventoryBalanceWhereInput = {
      storeId,
    };

    if (query.categoryId) {
      where.variant = {
        product: {
          categoryId: query.categoryId,
        },
      };
    }

    if (query.search) {
      where.variant = {
        ...where.variant,
        OR: [
          { sku: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
          { barcode: { contains: query.search, mode: 'insensitive' } },
          { product: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      };
    }

    // Prisma doesn't directly support comparing two columns (quantityOnHand <= reorderLevel) in where clause.
    // When lowStockOnly is true, we fetch candidates or use raw query / compute.
    // For general list:
    const [items, total] = await Promise.all([
      client.inventoryBalance.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          store: {
            select: { id: true, name: true, code: true },
          },
          variant: {
            include: {
              product: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      }),
      client.inventoryBalance.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Retrieves low stock balances where quantityOnHand <= reorderLevel.
   */
  async listLowStockBalances(
    storeId: string,
    categoryId: string | undefined,
    skip: number,
    take: number,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);

    let categoryFilter = Prisma.empty;
    if (categoryId) {
      categoryFilter = Prisma.sql`AND p.category_id = ${categoryId}::uuid`;
    }

    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT ib.id
      FROM inventory_balances ib
      JOIN product_variants pv ON ib.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE ib.store_id = ${storeId}::uuid
        AND ib.quantity_on_hand <= ib.reorder_level
        ${categoryFilter}
      ORDER BY ib.quantity_on_hand ASC
      OFFSET ${skip}
      LIMIT ${take}
    `;

    const countResult = await client.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM inventory_balances ib
      JOIN product_variants pv ON ib.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE ib.store_id = ${storeId}::uuid
        AND ib.quantity_on_hand <= ib.reorder_level
        ${categoryFilter}
    `;

    const total = Number(countResult[0]?.count ?? 0);
    const ids = rows.map(r => r.id);

    if (ids.length === 0) {
      return { items: [], total };
    }

    const items = await client.inventoryBalance.findMany({
      where: { id: { in: ids } },
      include: {
        store: { select: { id: true, name: true, code: true } },
        variant: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { quantityOnHand: 'asc' },
    });

    return { items, total };
  }

  // ============================================================================
  // Inventory Movement Operations
  // ============================================================================

  /**
   * Appends an immutable movement record.
   */
  async createMovement(
    data: Prisma.InventoryMovementUncheckedCreateInput,
    tx: PrismaTransactionClient
  ) {
    return tx.inventoryMovement.create({
      data,
      include: {
        performedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Finds movement by idempotency key and store.
   */
  async findMovementByIdempotencyKey(
    storeId: string,
    idempotencyKey: string,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.inventoryMovement.findFirst({
      where: {
        storeId,
        idempotencyKey,
      },
      include: {
        performedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Lists inventory movements with filtering and pagination.
   */
  async listMovements(
    storeId: string,
    query: MovementQueryDto,
    skip: number,
    take: number,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    const where: Prisma.InventoryMovementWhereInput = {
      storeId,
    };

    if (query.variantId) {
      where.variantId = query.variantId;
    }

    if (query.movementType) {
      where.movementType = query.movementType;
    }

    if (query.referenceType) {
      where.referenceType = query.referenceType;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [items, total] = await Promise.all([
      client.inventoryMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          performedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      client.inventoryMovement.count({ where }),
    ]);

    return { items, total };
  }

  // ============================================================================
  // Stock Reservation Operations
  // ============================================================================

  /**
   * Creates a stock reservation.
   */
  async createReservation(
    data: Prisma.StockReservationUncheckedCreateInput,
    tx: PrismaTransactionClient
  ) {
    return tx.stockReservation.create({
      data,
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Finds reservation by ID.
   */
  async findReservationById(id: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.stockReservation.findUnique({
      where: { id },
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Updates reservation status and metadata.
   */
  async updateReservation(
    id: string,
    data: Prisma.StockReservationUpdateInput,
    tx: PrismaTransactionClient
  ) {
    return tx.stockReservation.update({
      where: { id },
      data,
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  // ============================================================================
  // Inter-Store Inventory Transfer Operations
  // ============================================================================

  /**
   * Creates a new inter-store transfer with item lines in DRAFT status.
   */
  async createTransfer(
    data: Prisma.InventoryTransferUncheckedCreateInput,
    items: Array<{ variantId: string; quantityRequested: Prisma.Decimal; notes?: string }>,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.inventoryTransfer.create({
      data: {
        ...data,
        items: {
          create: items.map(item => ({
            variantId: item.variantId,
            quantityRequested: item.quantityRequested,
            notes: item.notes,
          })),
        },
      },
      include: {
        sourceStore: { select: { id: true, name: true, code: true } },
        destinationStore: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Finds a transfer by ID with all item lines.
   */
  async findTransferById(id: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.inventoryTransfer.findUnique({
      where: { id },
      include: {
        sourceStore: { select: { id: true, name: true, code: true, status: true } },
        destinationStore: { select: { id: true, name: true, code: true, status: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Updates transfer status and tracking timestamps.
   */
  async updateTransfer(
    id: string,
    data: Prisma.InventoryTransferUpdateInput,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.inventoryTransfer.update({
      where: { id },
      data,
      include: {
        sourceStore: { select: { id: true, name: true, code: true } },
        destinationStore: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Updates an item's shipped and received quantities in a transfer.
   */
  async updateTransferItem(
    id: string,
    data: {
      quantityShipped?: Prisma.Decimal;
      quantityReceived?: Prisma.Decimal;
      notes?: string;
    },
    tx: PrismaTransactionClient
  ) {
    return tx.inventoryTransferItem.update({
      where: { id },
      data,
    });
  }

  /**
   * Lists transfers with filtering and pagination.
   */
  async listTransfers(
    query: TransferQueryDto,
    skip: number,
    take: number,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    const where: Prisma.InventoryTransferWhereInput = {};

    if (query.sourceStoreId) {
      where.sourceStoreId = query.sourceStoreId;
    }

    if (query.destinationStoreId) {
      where.destinationStoreId = query.destinationStoreId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      client.inventoryTransfer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceStore: { select: { id: true, name: true, code: true } },
          destinationStore: { select: { id: true, name: true, code: true } },
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      }),
      client.inventoryTransfer.count({ where }),
    ]);

    return { items, total };
  }
}
