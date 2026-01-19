// src/components/bills/BillsTable.tsx
"use client";

import React from "react";
import type { Bill, BillPayment } from "@/lib/xano/endpoints";

export type BillsTableRow = {
  bill: Bill;
  payment: BillPayment | null;
  computed: {
    paid: boolean;
    dueDay: number | null;
    expectedAmount: number | null;
    amountPaid: number | null;
  };
};

export default function BillsTable({
  rows,
  loading,
  savingPaymentIds,
  onTogglePaid,
  onUpdatePaymentField,
  onEditBill,
}: {
  rows: BillsTableRow[];
  loading: boolean;
  savingPaymentIds: Set<number>;
  onTogglePaid: (billId: number, nextPaid: boolean) => void;
  onUpdatePaymentField: (
    billId: number,
    patch: Partial<Pick<BillPayment, "paid_date" | "amount_paid" | "notes">>
  ) => void;
  onEditBill: (bill: Bill) => void;
}) {
  if (loading) {
    return (
      <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
        Loading bills…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
        No bills yet. Click <strong>"Add bill"</strong> to create your first recurring bill.
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fafafa" }}>
            <Th>Bill</Th>
            <Th>Due</Th>
            <Th>Expected</Th>
            <Th>Autopay</Th>
            <Th>Paid</Th>
            <Th>Paid date</Th>
            <Th>Amount paid</Th>
            <Th>Notes</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <BillRow
              key={row.bill.id}
              row={row}
              saving={savingPaymentIds.has(row.bill.id)}
              onTogglePaid={onTogglePaid}
              onUpdatePaymentField={onUpdatePaymentField}
              onEditBill={onEditBill}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillRow({
  row,
  saving,
  onTogglePaid,
  onUpdatePaymentField,
  onEditBill,
}: {
  row: BillsTableRow;
  saving: boolean;
  onTogglePaid: (billId: number, nextPaid: boolean) => void;
  onUpdatePaymentField: (
    billId: number,
    patch: Partial<Pick<BillPayment, "paid_date" | "amount_paid" | "notes">>
  ) => void;
  onEditBill: (bill: Bill) => void;
}) {
  const { bill, payment } = row;

  const paid = row.computed.paid;
  const dueText = bill.due_day ? `Day ${bill.due_day}` : "—";
  const expectedText =
    bill.is_variable ? "Variable" : bill.amount_expected != null ? `$${bill.amount_expected.toFixed(2)}` : "—";

  const paidDate = payment?.paid_date ?? "";
  const amountPaid = payment?.amount_paid != null ? String(payment.amount_paid) : "";
  const notes = payment?.notes ?? "";

  return (
    <tr style={{ borderTop: "1px solid #eee" }}>
      <Td>
        <div style={{ fontWeight: 600 }}>{bill.name}</div>
      </Td>
      <Td>{dueText}</Td>
      <Td>{expectedText}</Td>
      <Td>{bill.autopay ? "Yes" : "No"}</Td>

      <Td>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={paid}
            disabled={saving}
            onChange={(e) => onTogglePaid(bill.id, e.target.checked)}
          />
          {saving ? <span style={{ fontSize: 12, opacity: 0.7 }}>Saving…</span> : null}
        </label>
      </Td>

      <Td>
        <input
          type="date"
          value={paidDate}
          disabled={!paid || saving}
          onChange={(e) => onUpdatePaymentField(bill.id, { paid_date: e.target.value || null })}
          style={inputStyle}
        />
      </Td>

      <Td>
        <input
          inputMode="decimal"
          value={amountPaid}
          placeholder="0.00"
          disabled={!paid || saving}
          onChange={(e) => {
            const v = e.target.value.trim();
            const num = v === "" ? null : Number(v);
            onUpdatePaymentField(bill.id, { amount_paid: Number.isFinite(num as number) ? num : null });
          }}
          style={inputStyle}
        />
      </Td>

      <Td>
        <input
          value={notes}
          placeholder="Optional"
          disabled={saving}
          onChange={(e) => onUpdatePaymentField(bill.id, { notes: e.target.value || null })}
          style={{ ...inputStyle, width: "100%" }}
        />
      </Td>

      <Td>
        <button
          onClick={() => onEditBill(bill)}
          style={{
            background: "none",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Edit
        </button>
      </Td>
    </tr>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, opacity: 0.75 }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 12px", verticalAlign: "top" }}>{children}</td>;
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  width: 140,
};
