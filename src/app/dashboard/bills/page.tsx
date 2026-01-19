// src/app/dashboard/bills/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import BillsTable, { BillsTableRow } from "@/components/bills/BillsTable";
import AddBillForm, { NewBillInput } from "@/components/bills/AddBillForm";
import {
  Bill,
  BillPayment,
  createBill,
  listBillPayments,
  listBills,
  upsertBillPayment,
} from "@/lib/xano/endpoints";
import { useMonth } from "@/hooks/useMonth";

function getUserId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("user_id") ?? "";
}

export default function BillsPage() {
  const { month, setMonth, monthLabel } = useMonth();
  const [userId, setUserId] = useState<string>("");

  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [showAdd, setShowAdd] = useState(false);
  const [savingPaymentIds, setSavingPaymentIds] = useState<Set<number>>(new Set());
  const [savingNewBill, setSavingNewBill] = useState(false);

  useEffect(() => {
    setUserId(getUserId());
  }, []);

  async function refresh() {
    if (!userId) {
      setBills([]);
      setPayments([]);
      setLoading(false);
      setError("Missing user_id. Set localStorage user_id to your Xano user id.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Monthly Bills</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Track recurring bills and mark them paid for <strong>{monthLabel}</strong>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, opacity: 0.8 }}>
            Month
            <input
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="YYYY-MM"
              style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #ddd", width: 120 }}
            />
          </label>

          <button
            onClick={() => setShowAdd(true)}
            style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
          >
            + Add bill
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
        />
      </div>

      <AddBillForm
        open={showAdd}
        saving={savingNewBill}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAddBill}
      />
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
