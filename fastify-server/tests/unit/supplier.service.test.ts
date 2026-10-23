import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SupplierService } from '../../src/modules/suppliers/supplier.service.js';
import {
  DuplicateSupplierCodeError,
  DuplicateSupplierProductError,
  InactiveSupplierError,
  SupplierHasOrdersError,
  SupplierNotFoundError,
  SupplierProductNotFoundError,
} from '../../src/modules/suppliers/supplier.errors.js';
import { BadRequestError, NotFoundError } from '../../src/common/errors/app-error.js';

describe('SupplierService (Unit)', () => {
  let mockPrisma: any;
  let supplierService: SupplierService;

  const supplierId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';
  const supplierProductId = '33333333-3333-4333-a333-333333333333';
  const mockDate = new Date('2026-10-23T10:00:00Z');

  const sampleSupplier = {
    id: supplierId,
    name: 'Acme Hardware Distributors',
    code: 'ACME-01',
    email: 'vendor@acme.com',
    phone: '+1-555-0199',
    website: 'https://acme.com',
    taxIdentifier: 'TAX-998877',
    addressLine1: '123 Industrial Way',
    addressLine2: null,
    city: 'Metropolis',
    state: 'NY',
    postalCode: '10001',
    countryCode: 'US',
    status: 'ACTIVE' as const,
    notes: 'Primary hardware supplier',
    createdAt: mockDate,
    updatedAt: mockDate,
    deletedAt: null,
    _count: { products: 5, purchaseOrders: 2 },
  };

  const sampleSupplierProduct = {
    id: supplierProductId,
    supplierId,
    variantId,
    supplierSku: 'ACME-SKU-100',
    supplierProductName: 'Industrial Hex Bolt 10mm',
    purchasePrice: new Prisma.Decimal('12.50'),
    currencyCode: 'USD',
    minimumOrderQuantity: new Prisma.Decimal('10.0000'),
    leadTimeDays: 7,
    isPreferred: true,
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    variant: {
      id: variantId,
      name: 'Hex Bolt 10mm',
      sku: 'BOLT-10MM',
      barcode: '123456789012',
      status: 'ACTIVE',
      product: {
        id: 'prod-1',
        name: 'Industrial Bolts',
        slug: 'industrial-bolts',
        status: 'ACTIVE',
      },
    },
  };

  beforeEach(() => {
    mockPrisma = {
      supplier: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      supplierProduct: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
      },
      purchaseOrder: {
        count: vi.fn(),
      },
      $transaction: vi.fn((callback: any) => callback(mockPrisma)),
    };

    supplierService = new SupplierService(mockPrisma);
  });

  describe('createSupplier', () => {
    it('creates supplier with uppercase normalized code', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(null);
      mockPrisma.supplier.create.mockResolvedValue(sampleSupplier);

      const result = await supplierService.createSupplier({
        name: 'Acme Hardware Distributors',
        code: 'acme-01',
        email: 'vendor@acme.com',
      });

      expect(result.id).toBe(supplierId);
      expect(result.code).toBe('ACME-01');
      expect(mockPrisma.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'ACME-01',
          }),
        })
      );
    });

    it('throws DuplicateSupplierCodeError when code is already taken', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);

      await expect(
        supplierService.createSupplier({
          name: 'Another Vendor',
          code: 'ACME-01',
        })
      ).rejects.toThrow(DuplicateSupplierCodeError);
    });
  });

  describe('getSupplierById', () => {
    it('returns serialized supplier details', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);

      const result = await supplierService.getSupplierById(supplierId);

      expect(result.id).toBe(supplierId);
      expect(result.name).toBe('Acme Hardware Distributors');
      expect(result.productsCount).toBe(5);
    });

    it('throws SupplierNotFoundError when supplier does not exist', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(null);

      await expect(supplierService.getSupplierById('unknown-id')).rejects.toThrow(
        SupplierNotFoundError
      );
    });
  });

  describe('updateSupplier & updateSupplierStatus', () => {
    it('updates supplier profile successfully', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.supplier.update.mockResolvedValue({
        ...sampleSupplier,
        name: 'Acme Global Supplies',
      });

      const result = await supplierService.updateSupplier(supplierId, {
        name: 'Acme Global Supplies',
      });

      expect(result.name).toBe('Acme Global Supplies');
    });

    it('updates supplier status to SUSPENDED', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.supplier.update.mockResolvedValue({
        ...sampleSupplier,
        status: 'SUSPENDED',
      });

      const result = await supplierService.updateSupplierStatus(supplierId, {
        status: 'SUSPENDED',
      });

      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('deleteSupplier', () => {
    it('soft-deletes supplier when no purchase orders exist', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.purchaseOrder.count.mockResolvedValue(0);
      mockPrisma.supplier.update.mockResolvedValue({
        ...sampleSupplier,
        deletedAt: new Date(),
        status: 'INACTIVE',
      });

      const result = await supplierService.deleteSupplier(supplierId);

      expect(result.success).toBe(true);
      expect(mockPrisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: supplierId },
          data: expect.objectContaining({ status: 'INACTIVE' }),
        })
      );
    });

    it('rejects deletion with SupplierHasOrdersError if purchase orders exist', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.purchaseOrder.count.mockResolvedValue(3);

      await expect(supplierService.deleteSupplier(supplierId)).rejects.toThrow(
        SupplierHasOrdersError
      );
    });
  });

  describe('addSupplierProduct', () => {
    it('links product variant to supplier with exact decimal pricing and MOQ', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        id: variantId,
        name: 'Hex Bolt 10mm',
        status: 'ACTIVE',
      });
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(null);
      mockPrisma.supplierProduct.create.mockResolvedValue(sampleSupplierProduct);

      const result = await supplierService.addSupplierProduct(supplierId, {
        variantId,
        purchasePrice: '12.50',
        minimumOrderQuantity: '10.0000',
        leadTimeDays: 7,
      });

      expect(result.id).toBe(supplierProductId);
      expect(result.purchasePrice).toBe('12.50');
      expect(result.minimumOrderQuantity).toBe('10.0000');
    });

    it('rejects adding product to inactive supplier', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue({
        ...sampleSupplier,
        status: 'INACTIVE',
      });

      await expect(
        supplierService.addSupplierProduct(supplierId, {
          variantId,
          purchasePrice: '12.50',
        })
      ).rejects.toThrow(InactiveSupplierError);
    });

    it('rejects duplicate supplier-product offering', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        id: variantId,
        status: 'ACTIVE',
      });
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(sampleSupplierProduct);

      await expect(
        supplierService.addSupplierProduct(supplierId, {
          variantId,
          purchasePrice: '12.50',
        })
      ).rejects.toThrow(DuplicateSupplierProductError);
    });

    it('rejects negative purchase price', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        id: variantId,
        status: 'ACTIVE',
      });
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(null);

      await expect(
        supplierService.addSupplierProduct(supplierId, {
          variantId,
          purchasePrice: '-5.00',
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('updateSupplierProduct & removeSupplierProduct', () => {
    it('updates supplier product pricing', async () => {
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(sampleSupplierProduct);
      mockPrisma.supplierProduct.update.mockResolvedValue({
        ...sampleSupplierProduct,
        purchasePrice: new Prisma.Decimal('14.00'),
      });

      const result = await supplierService.updateSupplierProduct(supplierId, supplierProductId, {
        purchasePrice: '14.00',
      });

      expect(result.purchasePrice).toBe('14.00');
    });

    it('removes supplier product relationship', async () => {
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(sampleSupplierProduct);
      mockPrisma.supplierProduct.delete.mockResolvedValue(sampleSupplierProduct);

      const result = await supplierService.removeSupplierProduct(supplierId, supplierProductId);

      expect(result.success).toBe(true);
      expect(mockPrisma.supplierProduct.delete).toHaveBeenCalledWith({
        where: { id: supplierProductId },
      });
    });
  });
});
