// src/lib/xano/endpoints.ts
import { xanoFetch } from "@/lib/xano/client";

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
  month: string;
  paid: boolean;
  paid_date: string | null;
  amount_paid: number | null;
  notes: string | null;
  updated_at?: string;
};

export type User = {
  id: number;
  email: string;
  created_at?: string;
};

export type AuthResponse = {
  authToken?: string;
  token?: string;
  auth_token?: string;
  user_id?: number;
  user?: User;
};

export async function listBills({ userId }: { userId: string }) {
  return xanoFetch<Bill[]>(`/bills?user_id=${encodeURIComponent(userId)}`);
}

export async function createBill(input: Omit<Bill, "id">) {
  return xanoFetch<Bill>(`/bills`, { method: "POST", body: input });
}

/**
 * Update a bill with partial data.
 * The Xano endpoint now accepts nullable fields and uses null-coalescing
 * to preserve existing values when null is passed.
 */
export async function updateBill(id: number, patch: Partial<Bill>) {
  // Send all fields with null for any not provided
  // The backend uses ?? to fall back to existing values for null fields
  const body = {
    name: patch.name ?? null,
    due_day: patch.due_day ?? null,
    amount_expected: patch.amount_expected ?? null,
    is_variable: patch.is_variable ?? null,
    autopay: patch.autopay ?? null,
    active: patch.active ?? null,
  };
  
  return xanoFetch<Bill>(`/bills/${id}`, { method: "PATCH", body });
}

export async function listBillPayments({
  userId,
  month,
}: {
  userId: string;
  month: string;
}) {
  const qs = new URLSearchParams({
    user_id: userId,
    month,
  });
  return xanoFetch<BillPayment[]>(`/bill-payments?${qs.toString()}`);
}

export async function upsertBillPayment(input: BillPayment) {
  return xanoFetch<BillPayment>(`/bill-payments/upsert`, {
    method: "POST",
    body: input,
  });
}

export async function login(email: string, password: string) {
  return xanoFetch<AuthResponse>(`/auth/login`, {
    method: "POST",
    body: { email, password },
  });
}

export async function register(email: string, password: string) {
  return xanoFetch<AuthResponse>(`/auth/register`, {
    method: "POST",
    body: { email, password },
  });
}
