// src/lib/xano/endpoints.ts
import { xanoFetch } from "@/lib/xano/client";

/**
 * Types (shape these to match your Xano table fields / API responses)
 */
export type Bill = {
  id: number;
  user_id: string | number;
  name: string;
  due_day: number | null;
  amount_expected: number | null;
  is_variable: boolean;
  autopay: boolean;
  active: boolean;
  created_at?: string;
};

export type BillPayment = {
  id?: number;
  user_id: string | number;
  bill_id: number;
  month: string; // "YYYY-MM"
  paid: boolean;
  paid_date: string | null; // "YYYY-MM-DD"
  amount_paid: number | null;
  notes: string | null;
  updated_at?: string;
};

export async function listBills({ userId }: { userId: string }) {
  // Assumes you built GET /bills?user_id=...
  return xanoFetch<Bill[]>(`/bills?user_id=${encodeURIComponent(userId)}`);
}

export async function createBill(input: Omit<Bill, "id">) {
  // Assumes POST /bills
  return xanoFetch<Bill>(`/bills`, { method: "POST", body: input });
}

export async function updateBill(id: number, patch: Partial<Bill>) {
  // Assumes PATCH /bills/{id}
  return xanoFetch<Bill>(`/bills/${id}`, { method: "PATCH", body: patch });
}

export async function listBillPayments({
  userId,
  month,
}: {
  userId: string;
  month: string;
}) {
  // Assumes GET /bill-payments?user_id=...&month=YYYY-MM
  const qs = new URLSearchParams({
    user_id: userId,
    month,
  });
  return xanoFetch<BillPayment[]>(`/bill-payments?${qs.toString()}`);
}

export async function upsertBillPayment(input: BillPayment) {
  /**
   * Assumes POST /bill-payments/upsert
   * Body: { user_id, bill_id, month, paid, paid_date, amount_paid, notes }
   */
  return xanoFetch<BillPayment>(`/bill-payments/upsert`, {
    method: "POST",
    body: input,
  });
}
