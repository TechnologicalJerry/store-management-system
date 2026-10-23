import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PO_TRANSITIONS,
  CANCELLABLE_PO_STATES,
  EDITABLE_PO_STATES,
  RECEIVABLE_PO_STATES,
} from '../../src/modules/procurement/procurement.constants.js';
import type { PurchaseOrderStatus } from '../../src/modules/procurement/procurement.types.js';

describe('Procurement State Machine & Transition Rules (Unit)', () => {
  it('defines valid lifecycle transitions from DRAFT', () => {
    const draftTransitions = ALLOWED_PO_TRANSITIONS.DRAFT;
    expect(draftTransitions).toContain('PENDING_APPROVAL');
    expect(draftTransitions).toContain('CANCELLED');
    expect(draftTransitions).not.toContain('ORDERED');
    expect(draftTransitions).not.toContain('RECEIVED');
  });

  it('defines valid lifecycle transitions from PENDING_APPROVAL', () => {
    const pendingTransitions = ALLOWED_PO_TRANSITIONS.PENDING_APPROVAL;
    expect(pendingTransitions).toContain('APPROVED');
    expect(pendingTransitions).toContain('DRAFT'); // rejected back for revisions
    expect(pendingTransitions).toContain('CANCELLED');
    expect(pendingTransitions).not.toContain('RECEIVED');
  });

  it('defines valid lifecycle transitions from APPROVED', () => {
    const approvedTransitions = ALLOWED_PO_TRANSITIONS.APPROVED;
    expect(approvedTransitions).toContain('ORDERED');
    expect(approvedTransitions).toContain('CANCELLED');
    expect(approvedTransitions).not.toContain('PARTIALLY_RECEIVED');
  });

  it('defines valid lifecycle transitions from ORDERED', () => {
    const orderedTransitions = ALLOWED_PO_TRANSITIONS.ORDERED;
    expect(orderedTransitions).toContain('PARTIALLY_RECEIVED');
    expect(orderedTransitions).toContain('RECEIVED');
    expect(orderedTransitions).toContain('CANCELLED');
  });

  it('defines valid lifecycle transitions from PARTIALLY_RECEIVED', () => {
    const partialTransitions = ALLOWED_PO_TRANSITIONS.PARTIALLY_RECEIVED;
    expect(partialTransitions).toContain('RECEIVED');
    expect(partialTransitions).not.toContain('CANCELLED'); // Cannot cancel once receiving starts
  });

  it('defines terminal statuses with no further transitions', () => {
    expect(ALLOWED_PO_TRANSITIONS.RECEIVED).toEqual([]);
    expect(ALLOWED_PO_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('strictly limits order modifications to EDITABLE_PO_STATES', () => {
    expect(EDITABLE_PO_STATES).toEqual(['DRAFT']);
    const nonDraftStates: PurchaseOrderStatus[] = [
      'PENDING_APPROVAL',
      'APPROVED',
      'ORDERED',
      'PARTIALLY_RECEIVED',
      'RECEIVED',
      'CANCELLED',
    ];
    for (const state of nonDraftStates) {
      expect(EDITABLE_PO_STATES).not.toContain(state);
    }
  });

  it('identifies cancellable states', () => {
    expect(CANCELLABLE_PO_STATES).toContain('DRAFT');
    expect(CANCELLABLE_PO_STATES).toContain('PENDING_APPROVAL');
    expect(CANCELLABLE_PO_STATES).toContain('APPROVED');
    expect(CANCELLABLE_PO_STATES).toContain('ORDERED');
    expect(CANCELLABLE_PO_STATES).not.toContain('PARTIALLY_RECEIVED');
    expect(CANCELLABLE_PO_STATES).not.toContain('RECEIVED');
    expect(CANCELLABLE_PO_STATES).not.toContain('CANCELLED');
  });

  it('identifies receivable states', () => {
    expect(RECEIVABLE_PO_STATES).toEqual(['ORDERED', 'PARTIALLY_RECEIVED']);
  });
});
