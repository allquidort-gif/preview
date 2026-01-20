// src/lib/xano/endpoints.ts
import { xanoFetch } from "@/lib/xano/client";

// ============ TYPES ============

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

export type TransactionRaw = {
  id?: number;
  import_id: number;
  user_id: string | number;
  date: string;
  description: string;
  amount: number;
  currency?: string;
  confidence?: number;
  raw_text_line: string;
  bank_account_id?: string;
  bank_transaction_id?: string;
  bank_category?: string;
  balance?: number;
  created_at?: string;
};

export type Transaction = {
  id?: number;
  user_id: string | number;
  date: string;
  merchant: string;
  description: string;
  amount: number;
  category_id: number;
  account_id: number;
  import_id: number;
  is_split: boolean;
  notes: string;
  is_recurring: boolean;
  bill_id: number | null;
  transaction_type: 'recurring' | 'misc' | 'income' | 'transfer';
  created_at?: string;
};

export type Import = {
  id?: number;
  user_id: string | number;
  filename: string;
  account_type: 'checking' | 'savings' | 'high_yield';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  record_count: number;
  created_at?: string;
};

export type Balance = {
  id?: number;
  user_id: string | number;
  name: string;
  amount: number;
  as_of_date: string;
  account_type: 'checking' | 'savings' | 'high_yield';
  created_at?: string;
};

export type Category = {
  id: number;
  user_id: string | number;
  name: string;
  parent_id: number;
  created_at?: string;
};

// ============ AUTH ============

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

// ============ BILLS ============

export async function listBills({ userId }: { userId: string }) {
  return xanoFetch<Bill[]>(`/bills?user_id=${encodeURIComponent(userId)}`);
}

export async function createBill(input: Omit<Bill, "id">) {
  return xanoFetch<Bill>(`/bills`, { method: "POST", body: input });
}

export async function updateBill(id: number, patch: Partial<Bill>) {
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

// ============ BILL PAYMENTS ============

export async function listBillPayments({
  userId,
  month,
}: {
  userId: string;
  month: string;
}) {
  const qs = new URLSearchParams({ user_id: userId, month });
  return xanoFetch<BillPayment[]>(`/bill-payments?${qs.toString()}`);
}

export async function upsertBillPayment(input: BillPayment) {
  return xanoFetch<BillPayment>(`/bill-payments/upsert`, {
    method: "POST",
    body: input,
  });
}

// ============ TRANSACTIONS RAW ============

export async function createTransactionsRaw(transactions: Omit<TransactionRaw, "id">[]) {
  return xanoFetch<{ inserted: number }>(`/transactions-raw`, {
    method: "POST",
    body: { transactions },
  });
}

export async function listTransactionsRaw({
  userId,
  importId,
}: {
  userId: string;
  importId?: number;
}) {
  const qs = new URLSearchParams({ user_id: userId });
  if (importId) qs.set("import_id", String(importId));
  return xanoFetch<TransactionRaw[]>(`/transactions-raw?${qs.toString()}`);
}

// ============ TRANSACTIONS ============

export async function listTransactions({
  userId,
  month,
  transactionType,
}: {
  userId: string;
  month?: string;
  transactionType?: string;
}) {
  const qs = new URLSearchParams({ user_id: userId });
  if (month) qs.set("month", month);
  if (transactionType) qs.set("transaction_type", transactionType);
  return xanoFetch<Transaction[]>(`/transactions?${qs.toString()}`);
}

export async function createTransaction(input: Omit<Transaction, "id">) {
  return xanoFetch<Transaction>(`/transactions`, { method: "POST", body: input });
}

export async function updateTransaction(id: number, patch: Partial<Transaction>) {
  return xanoFetch<Transaction>(`/transactions/${id}`, { method: "PUT", body: patch });
}

export async function markTransactionRecurring(
  id: number,
  billId: number | null,
  isRecurring: boolean
) {
  return xanoFetch<Transaction>(`/transactions/${id}`, {
    method: "PUT",
    body: {
      is_recurring: isRecurring,
      bill_id: billId,
      transaction_type: isRecurring ? "recurring" : "misc",
    },
  });
}

// ============ IMPORTS ============

export async function createImport(input: Omit<Import, "id">) {
  return xanoFetch<Import>(`/imports`, { method: "POST", body: input });
}

export async function listImports({ userId }: { userId: string }) {
  return xanoFetch<Import[]>(`/imports?user_id=${encodeURIComponent(userId)}`);
}

export async function updateImport(id: number, patch: Partial<Import>) {
  return xanoFetch<Import>(`/imports/${id}`, { method: "PUT", body: patch });
}

// ============ BALANCES ============

export async function listBalances({ userId }: { userId: string }) {
  return xanoFetch<Balance[]>(`/balances?user_id=${encodeURIComponent(userId)}`);
}

export async function createBalance(input: Omit<Balance, "id">) {
  return xanoFetch<Balance>(`/balances`, { method: "POST", body: input });
}

export async function updateBalance(id: number, patch: Partial<Balance>) {
  return xanoFetch<Balance>(`/balances/${id}`, { method: "PUT", body: patch });
}

// ============ CATEGORIES ============

export async function listCategories({ userId }: { userId: string }) {
  return xanoFetch<Category[]>(`/categories?user_id=${encodeURIComponent(userId)}`);
}

export async function createCategory(input: Omit<Category, "id">) {
  return xanoFetch<Category>(`/categories`, { method: "POST", body: input });
}

export async function createTransactionsBulk(input: { user_id: number; transactions: any[] }) {
  return xanoFetch<{ success: boolean; count: number }>(`/transactions/bulk`, {
    method: "POST",
    body: input,
  });
}

// ============ DASHBOARD ============

export async function getDashboardMonthly({ userId, month }: { userId: string; month: string }) {
  return xanoFetch<{
    total_income: number;
    total_recurring: number;
    total_misc: number;
    remaining: number;
    transactions_by_type: Record<string, number>;
  }>(`/dashboard/monthly?user_id=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`);
}
