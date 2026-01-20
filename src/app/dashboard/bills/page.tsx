// src/app/dashboard/bills/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AddBillForm, { NewBillInput } from "@/components/bills/AddBillForm";
import EditBillForm from "@/components/bills/EditBillForm";

// Extended row type with linked transactions
interface BillsTableRow {
  bill: Bill;
  payment: BillPayment | null;
  linkedTransactions: Transaction[];
  computed: {
    paid: boolean;
    dueDay: number | null;
    expectedAmount: number | null;
    amountPaid: number | null;
    actualFromTxns: number;
    transactionCount: number;
  };
}
import {
  Bill,
  BillPayment,
  Transaction,
  createBill,
  updateBill,
  listBillPayments,
  listBills,
  listTransactions,
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [showAdd, setShowAdd] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [expandedBillId, setExpandedBillId] = useState<number | null>(null);
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
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [b, p, t] = await Promise.all([
        listBills({ userId }),
        listBillPayments({ userId, month }),
        listTransactions({ userId, month }),
      ]);
      setBills(b.filter((x) => x.active !== false));
      setPayments(p);
      setTransactions(t);
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

  // Group transactions by bill_id
  const transactionsByBillId = useMemo(() => {
    const map = new Map<number, Transaction[]>();
    for (const t of transactions) {
      if (t.bill_id) {
        const existing = map.get(t.bill_id) || [];
        existing.push(t);
        map.set(t.bill_id, existing);
      }
    }
    return map;
  }, [transactions]);

  const rows: BillsTableRow[] = useMemo(() => {
    return bills
      .slice()
      .sort((a, b) => (a.due_day ?? 99) - (b.due_day ?? 99))
      .map((bill) => {
        const p = paymentsByBillId.get(bill.id);
        const linkedTxns = transactionsByBillId.get(bill.id) || [];
        const paid = p?.paid ?? false;
        const expected = bill.amount_expected ?? null;
        const amountPaid = p?.amount_paid ?? null;

        // Calculate actual amount from linked transactions this month
        const actualFromTxns = linkedTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);

        return {
          bill,
          payment: p ?? null,
          linkedTransactions: linkedTxns,
          computed: {
            paid,
            dueDay: bill.due_day ?? null,
            expectedAmount: expected,
            amountPaid,
            actualFromTxns,
            transactionCount: linkedTxns.length,
          },
        };
      });
  }, [bills, paymentsByBillId, transactionsByBillId]);

  const summary = useMemo(() => {
    // Expected = sum of all monthly bill amounts (static amount_expected)
    const totalExpected = rows.reduce((sum, r) => sum + (r.bill.amount_expected ?? 0), 0);
    
    // Paid = sum of expected amounts for bills marked as paid this month
    const totalPaid = rows.reduce((sum, r) => {
      if (!r.computed.paid) return sum;
      // Use the bill's expected amount (monthly obligation)
      return sum + (r.bill.amount_expected ?? 0);
    }, 0);
    
    // From Transactions = actual amount paid this month based on linked transactions
    const totalFromTxns = rows.reduce((sum, r) => sum + (r.computed.actualFromTxns ?? 0), 0);
    const remaining = Math.max(0, totalExpected - totalPaid);
    const linkedTxnCount = rows.reduce((sum, r) => sum + r.computed.transactionCount, 0);
    return { totalExpected, totalPaid, totalFromTxns, remaining, linkedTxnCount };
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
      const linkedTxns = transactionsByBillId.get(billId) || [];

      // Use actual transaction total if available, otherwise use expected
      const actualAmount = linkedTxns.length > 0
        ? linkedTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0)
        : null;

      const amount_paid = nextPaid
        ? (existing?.amount_paid ?? actualAmount ?? bill?.amount_expected ?? 0)
        : 0;

      const paid_date = nextPaid
        ? (existing?.paid_date ?? new Date().toISOString().slice(0, 10))
        : "";

      await upsertBillPayment({
        user_id: userId,
        bill_id: billId,
        month,
        paid: nextPaid,
        paid_date,
        amount_paid,
        notes: existing?.notes ?? "",
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
        paid_date: patch.paid_date ?? existing?.paid_date ?? "",
        amount_paid: patch.amount_paid ?? existing?.amount_paid ?? 0,
        notes: patch.notes ?? existing?.notes ?? "",
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
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700 }}>📋 Monthly Bills</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Track recurring bills and mark them paid for <strong>{formatMonthLabel(month)}</strong>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={goToPrevMonth} style={navBtnStyle}>←</button>
            <button onClick={goToCurrentMonth} style={{ ...navBtnStyle, padding: "0 12px", width: "auto" }}>Today</button>
            <button onClick={goToNextMonth} style={navBtnStyle}>→</button>
          </div>

          <button
            onClick={() => router.push("/dashboard/transactions")}
            style={btnStyle}
          >
            💸 Transactions
          </button>

          <button onClick={() => setShowAdd(true)} style={btnStyle}>
            + Add bill
          </button>

          <button onClick={handleLogout} style={{ ...btnStyle, opacity: 0.7 }}>
            Logout
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Stat label="Expected" value={summary.totalExpected} />
        <Stat label="Paid" value={summary.totalPaid} />
        <Stat label="Remaining" value={summary.remaining} highlight={summary.remaining > 0} />
        <Stat label="From Transactions" value={summary.totalFromTxns} subtitle={`${summary.linkedTxnCount} linked`} />
      </div>

      {error ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#dc2626" }}>
          {error}
        </div>
      ) : null}

      {/* Bills List */}
      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", opacity: 0.7 }}>Loading bills...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 16 }}>
            <p style={{ margin: 0, opacity: 0.7 }}>No bills yet. Add a bill or import transactions to get started!</p>
          </div>
        ) : (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
            {rows.map((row, idx) => (
              <BillRow
                key={row.bill.id}
                row={row}
                isLast={idx === rows.length - 1}
                isExpanded={expandedBillId === row.bill.id}
                onToggleExpand={() => setExpandedBillId(expandedBillId === row.bill.id ? null : row.bill.id)}
                saving={savingPaymentIds.has(row.bill.id)}
                onTogglePaid={handleTogglePaid}
                onEdit={() => setEditingBill(row.bill)}
              />
            ))}
          </div>
        )}
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

// ============ COMPONENTS ============

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Stat({ label, value, subtitle, highlight }: { label: string; value: number; subtitle?: string; highlight?: boolean }) {
  return (
    <div style={{ 
      border: "1px solid #e2e8f0", 
      borderRadius: 14, 
      padding: 12, 
      minWidth: 140,
      background: highlight ? "#fef2f2" : "white"
    }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 18, marginTop: 4, fontWeight: 600, color: highlight ? "#dc2626" : "inherit" }}>
        ${formatCurrency(value)}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

function BillRow({
  row,
  isLast,
  isExpanded,
  onToggleExpand,
  saving,
  onTogglePaid,
  onEdit,
}: {
  row: BillsTableRow;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  saving: boolean;
  onTogglePaid: (billId: number, nextPaid: boolean) => void;
  onEdit: () => void;
}) {
  const { bill, payment, linkedTransactions, computed } = row;
  const isPaid = computed.paid;
  const hasLinkedTxns = linkedTransactions.length > 0;

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid #f1f5f9" }}>
      {/* Main Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 16px",
          background: isPaid ? "#f0fdf4" : "white",
        }}
      >
        {/* Checkbox */}
        <button
          onClick={() => onTogglePaid(bill.id, !isPaid)}
          disabled={saving}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: isPaid ? "2px solid #10b981" : "2px solid #d1d5db",
            background: isPaid ? "#10b981" : "white",
            cursor: saving ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {isPaid ? "✓" : ""}
        </button>

        {/* Bill Name & Due Day */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 500, textDecoration: isPaid ? "line-through" : "none", opacity: isPaid ? 0.6 : 1 }}>
              {bill.name}
            </span>
            {hasLinkedTxns && (
              <button
                onClick={onToggleExpand}
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  background: "#e0f2fe",
                  color: "#0369a1",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {linkedTransactions.length} txn{linkedTransactions.length > 1 ? "s" : ""} {isExpanded ? "▲" : "▼"}
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            Due day {bill.due_day ?? "—"}
            {bill.autopay && " • Autopay"}
            {bill.is_variable && " • Variable"}
          </div>
        </div>

        {/* Amounts */}
        <div style={{ textAlign: "right", minWidth: 100 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            ${formatCurrency(computed.expectedAmount ?? 0)}
          </div>
          {hasLinkedTxns && computed.actualFromTxns !== computed.expectedAmount && (
            <div style={{ fontSize: 11, color: "#6366f1" }}>
              Actual: ${formatCurrency(computed.actualFromTxns)}
            </div>
          )}
        </div>

        {/* Edit Button */}
        <button
          onClick={onEdit}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            background: "white",
            cursor: "pointer",
          }}
        >
          Edit
        </button>
      </div>

      {/* Expanded Transactions */}
      {isExpanded && hasLinkedTxns && (
        <div style={{ background: "#f8fafc", padding: "8px 16px 12px 56px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, marginBottom: 8 }}>LINKED TRANSACTIONS</div>
          {linkedTransactions.map((txn) => (
            <div
              key={txn.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                fontSize: 13,
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div>
                <span style={{ opacity: 0.6 }}>{new Date(txn.date).toLocaleDateString()}</span>
                <span style={{ marginLeft: 12 }}>{txn.merchant || txn.description.substring(0, 30)}</span>
              </div>
              <div style={{ fontWeight: 500, color: "#dc2626" }}>
                -${formatCurrency(Math.abs(txn.amount))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ STYLES ============

const navBtnStyle: React.CSSProperties = {
  height: 36,
  width: 36,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "white",
  cursor: "pointer",
  fontSize: 18,
};

const btnStyle: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "white",
  cursor: "pointer",
  fontSize: 14,
};
