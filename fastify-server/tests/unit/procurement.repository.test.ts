import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcurementRepository } from '../../src/modules/procurement/procurement.repository.js';

describe('ProcurementRepository (Unit)', () => {
  let mockPrisma: any;
  let repo: ProcurementRepository;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
      purchaseOrder: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      goodsReceipt: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      purchaseOrderItem: {
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      purchaseOrderStatusHistory: {
        create: vi.fn(),
      },
    };

    repo = new ProcurementRepository(mockPrisma);
  });

  describe('generatePoNumber', () => {
    it('generates formatted PO number from sequence when available', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ nextval: 1042 }]);

      const poNum = await repo.generatePoNumber();

      expect(poNum).toMatch(/^PO-\d{8}-1042$/);
    });

    it('falls back to date and random sequence when $queryRaw throws', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Sequence not found'));

      const poNum = await repo.generatePoNumber();

      expect(poNum).toMatch(/^PO-\d{8}-\d{4}$/);
    });
  });

  describe('generateReceiptNumber', () => {
    it('generates formatted Goods Receipt number from sequence when available', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ nextval: 2055 }]);

      const receiptNum = await repo.generateReceiptNumber();

      expect(receiptNum).toMatch(/^GR-\d{8}-2055$/);
    });

    it('falls back to date and random sequence when query throws', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Sequence not found'));

      const receiptNum = await repo.generateReceiptNumber();

      expect(receiptNum).toMatch(/^GR-\d{8}-\d{4}$/);
    });
  });
});
