// src/app/dashboard/bills/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BillsTable, { BillsTableRow } from "@/components/bills/BillsTable";
import AddBillForm, { NewBillInput } from "@/components/bills/AddBillForm";
import EditBillForm from "@/components/bills/EditBillForm";
import {
  Bill,
  BillPayment,
  createBill,
  updateBill,
  listBillPayments,
  listBills,
  upsertBillPayment,
} from "@/lib/xano/endpoints";

function getUserId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("user_id") ?? "";
}

function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("auth_token") ?? "";
}

function getMonthString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function parseMonth(month: string): Date {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1);
}

function formatMonthLabel(month: string): string {
  const d = parseMonth(month);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export default function BillsPage() {
  const router = useRouter();
  const [month, setMonth] = useState<string>(() => getMonthString(new Date()));
  const [userId, setUserId] = useState<string>("");

  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [showAdd, setShowAdd] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [savingPaymentIds, setSavingPaymentIds] = useState<Set<number>>(new Set());
  const [savingNewBill, setSavingNewBill] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    const id = getUserId();
    if (!token || !id) {
      router.push("/login");
      return;
    }
    setUserId(id);
  }, [router]);

  async function refresh() {
    if (!userId) {
      setBills([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [b, p] = await Promise.all([listBills({ userId }), listBillPayments({ userId, month })]);
      setBills(b.filter((x) => x.active !== false));
      setPayments(p);
    } catch (e: any) {
      setError(e?.message || "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    void refresh();
  }, [userId, month]);

  const paymentsByBillId = useMemo(() => {
    const map = new Map<number, BillPayment>();
    for (const p of payments) map.set(p.bill_id, p);
    return map;
  }, [payments]);

  const rows: BillsTableRow[] = useMemo(() => {
    return bills
      .slice()
      .sort((a, b) => (a.due_day ?? 99) - (b.due_day ?? 99))
      .map((bill) => {
        const p = paymentsByBillId.get(bill.id);
        const paid = p?.paid ?? false;
        const expected = bill.amount_expected ?? null;
        const amountPaid = p?.amount_paid ?? null;

        return {
          bill,
          payment: p ?? null,
          computed: {
            paid,
            dueDay: bill.due_day ?? null,
            expectedAmount: expected,
            amountPaid,
          },
        };
      });
  }, [bills, paymentsByBillId]);

  const summary = useMemo(() => {
    const totalExpected = rows.reduce((sum, r) => sum + (r.bill.amount_expected ?? 0), 0);
    const totalPaid = rows.reduce((sum, r) => sum + (r.payment?.amount_paid ?? (r.payment?.paid ? (r.bill.amount_expected ?? 0) : 0)), 0);
    const remaining = Math.max(0, totalExpected - totalPaid);
    return { totalExpected, totalPaid, remaining };
  }, [rows]);

  function goToPrevMonth() {
    const d = parseMonth(month);
    d.setMonth(d.getMonth() - 1);
    setMonth(getMonthString(d));
  }

  function goToNextMonth() {
    const d = parseMonth(month);
    d.setMonth(d.getMonth() + 1);
    setMonth(getMonthString(d));
  }

  function goToCurrentMonth() {
    setMonth(getMonthString(new Date()));
  }

  async function handleAddBill(input: NewBillInput) {
    if (!userId) return;

    setSavingNewBill(true);
    setError("");
    try {
      await createBill({
        user_id: userId,
        name: input.name.trim(),
        due_day: input.due_day,
        amount_expected: input.amount_expected,
        is_variable: input.is_variable,
        autopay: input.autopay,
        active: true,
      });
      setShowAdd(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to create bill.");
    } finally {
      setSavingNewBill(false);
    }
  }

  async function handleEditBill(id: number, input: NewBillInput) {
    if (!userId) return;

    setError("");
    try {
      await updateBill(id, {
        name: input.name.trim(),
        due_day: input.due_day,
        amount_expected: input.amount_expected,
        is_variable: input.is_variable,
        autopay: input.autopay,
      });
      setEditingBill(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to update bill.");
    }
  }

  async function handleDeleteBill(id: number) {
    if (!userId) return;
    if (!confirm("Are you sure you want to delete this bill?")) return;

    setError("");
    try {
      await updateBill(id, { active: false });
      setEditingBill(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to delete bill.");
    }
  }

  async function handleTogglePaid(billId: number, nextPaid: boolean) {
    if (!userId) return;

    setSavingPaymentIds((prev) => new Set(prev).add(billId));
    setError("");

    try {
      const bill = bills.find((b) => b.id === billId);
      const existing = paymentsByBillId.get(billId);

      const amount_paid = nextPaid
        ? (existing?.amount_paid ?? bill?.amount_expected ?? null)
        : null;

      const paid_date = nextPaid
        ? (existing?.paid_date ?? new Date().toISOString().slice(0, 10))
        : null;

      await upsertBillPayment({
        user_id: userId,
        bill_id: billId,
        month,
        paid: nextPaid,
        paid_date,
        amount_paid,
        notes: existing?.notes ?? null,
      });

      const p = await listBillPayments({ userId, month });
      setPayments(p);
    } catch (e: any) {
      setError(e?.message || "Failed to update payment.");
    } finally {
      setSavingPaymentIds((prev) => {
        const copy = new Set(prev);
        copy.delete(billId);
        return copy;
      });
    }
  }

  async function handleUpdatePaymentField(billId: number, patch: Partial<Pick<BillPayment, "paid_date" | "amount_paid" | "notes">>) {
    if (!userId) return;

    setSavingPaymentIds((prev) => new Set(prev).add(billId));
    setError("");

    try {
      const existing = paymentsByBillId.get(billId);
      const paid = existing?.paid ?? false;

      await upsertBillPayment({
        user_id: userId,
        bill_id: billId,
        month,
        paid,
        paid_date: patch.paid_date ?? existing?.paid_date ?? null,
        amount_paid: patch.amount_paid ?? existing?.amount_paid ?? null,
        notes: patch.notes ?? existing?.notes ?? null,
      });

      const p = await listBillPayments({ userId, month });
      setPayments(p);
    } catch (e: any) {
      setError(e?.message || "Failed to update payment details.");
    } finally {
      setSavingPaymentIds((prev) => {
        const copy = new Set(prev);
        copy.delete(billId);
        return copy;
      });
    }
  }

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_id");
    router.push("/login");
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Monthly Bills</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Track recurring bills and mark them paid for <strong>{formatMonthLabel(month)}</strong>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={goToPrevMonth}
              style={{ height: 36, width: 36, borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: 18 }}
            >
              ←
            </button>
            <button
              onClick={goToCurrentMonth}
              style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: 13 }}
            >
              Today
            </button>
            <button
              onClick={goToNextMonth}
              style={{ height: 36, width: 36, borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: 18 }}
            >
              →
            </button>
          </div>
<button
  onClick={() => router.push("/dashboard/transactions")}
  style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
>
  💸 Transactions
</button>
          <button
            onClick={() => setShowAdd(true)}
            style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
          >
            + Add bill
          </button>

          <button
            onClick={handleLogout}
            style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", opacity: 0.7 }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Stat label="Expected" value={summary.totalExpected} />
        <Stat label="Paid" value={summary.totalPaid} />
        <Stat label="Remaining" value={summary.remaining} />
      </div>

      {error ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #f1c0c0", borderRadius: 10, background: "#fff7f7" }}>
          <div style={{ fontWeight: 600 }}>Heads up</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{error}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <BillsTable
          rows={rows}
          loading={loading}
          savingPaymentIds={savingPaymentIds}
          onTogglePaid={handleTogglePaid}
          onUpdatePaymentField={handleUpdatePaymentField}
          onEditBill={(bill) => setEditingBill(bill)}
        />
      </div>

      <AddBillForm
        open={showAdd}
        saving={savingNewBill}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAddBill}
      />

      {editingBill && (
        <EditBillForm
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onSubmit={(input) => handleEditBill(editingBill.id, input)}
          onDelete={() => handleDeleteBill(editingBill.id)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, minWidth: 160 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 18, marginTop: 4 }}>${value.toFixed(2)}</div>
    </div>
  );
}
