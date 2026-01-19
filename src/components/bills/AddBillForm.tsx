// src/components/bills/AddBillForm.tsx
"use client";

import { useMemo, useState } from "react";

export type NewBillInput = {
  name: string;
  due_day: number | null;
  amount_expected: number | null;
  is_variable: boolean;
  autopay: boolean;
};

export default function AddBillForm({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: NewBillInput) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dueDay, setDueDay] = useState<string>("1");
  const [amountExpected, setAmountExpected] = useState<string>("");
  const [isVariable, setIsVariable] = useState<boolean>(false);
  const [autopay, setAutopay] = useState<boolean>(false);

  const dueDayNum = useMemo(() => {
    const n = Number(dueDay);
    if (!Number.isFinite(n) || n < 1 || n > 31) return null;
    return Math.floor(n);
  }, [dueDay]);

  if (!open) return null;

  function resetAndClose() {
    setName("");
    setDueDay("1");
    setAmountExpected("");
    setIsVariable(false);
    setAutopay(false);
    onClose();
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const amt =
      isVariable
        ? null
        : amountExpected.trim() === ""
          ? null
          : Number(amountExpected);

    onSubmit({
      name: trimmed,
      due_day: dueDayNum,
      amount_expected: Number.isFinite(amt as number) ? (amt as number) : null,
      is_variable: isVariable,
      autopay,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onMouseDown={(e) => {
        // click outside to close
        if (e.target === e.currentTarget) resetAndClose();
      }}
    >
      <div style={{ width: "100%", maxWidth: 520, background: "white", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add recurring bill</div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>This bill will appear every month.</div>
          </div>
          <button
            onClick={resetAndClose}
            style={{ border: "1px solid #ddd", background: "white", borderRadius: 10, height: 34, padding: "0 10px", cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mortgage"
              style={inputStyle}
            />
          </Field>

          <Field label="Due day (1–31)">
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              inputMode="numeric"
              style={inputStyle}
            />
          </Field>

          <Field label="Expected amount">
            <input
              value={amountExpected}
              onChange={(e) => setAmountExpected(e.target.value)}
              inputMode="decimal"
              placeholder={isVariable ? "—" : "e.g., 699.92"}
              disabled={isVariable}
              style={inputStyle}
            />
          </Field>

          <Field label="Options">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} type="checkbox" />
                Variable amount
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input checked={autopay} onChange={(e) => setAutopay(e.target.checked)} type="checkbox" />
                Autopay
              </label>
            </div>
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            onClick={resetAndClose}
            style={{ border: "1px solid #ddd", background: "white", borderRadius: 12, height: 38, padding: "0 14px", cursor: "pointer" }}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{ border: "1px solid #111", background: "#111", color: "white", borderRadius: 12, height: 38, padding: "0 14px", cursor: "pointer" }}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Create bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, opacity: 0.9 }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  width: "100%",
};
