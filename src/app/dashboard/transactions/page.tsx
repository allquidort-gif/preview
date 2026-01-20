// src/app/dashboard/transactions/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Transaction,
  Bill,
  listTransactions,
  listBills,
  createBill,
  createTransactionsRaw,
  createImport,
  createTransactionsBulk,
  markTransactionRecurring,
} from "@/lib/xano/endpoints";

type AccountType = "checking" | "savings" | "high_yield";

interface ParsedTransaction {
  bank_account_id: string;
  bank_transaction_id: string;
  date: string;
  description: string;
  amount: number;
  balance: number;
  bank_category: string;
}

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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseBankAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/[$",]/g, "").trim();
  return parseFloat(cleaned) || 0;
}

function parseBankDate(dateStr: string): string {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const month = parts[0].padStart(2, "0");
    const day = parts[1].padStart(2, "0");
    let year = parts[2];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function parseCSV(csvText: string): ParsedTransaction[] {
  const lines = csvText.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 9) continue;

    const [accountId, transactionId, date, description, , category, , amount, balance] = fields;

    transactions.push({
      bank_account_id: accountId,
      bank_transaction_id: transactionId,
      date: parseBankDate(date),
      description: description,
      amount: parseBankAmount(amount),
      balance: parseBankAmount(balance),
      bank_category: category,
    });
  }

  return transactions;
}

function extractMerchant(description: string): string {
  const patterns = [
    /^(?:Withdrawal|Deposit|Recurring Withdrawal)?\s*(?:Debit Card|POS|ACH)?\s*(?:Debit Gold|#\d+)?\s*(.+?)\s+(?:\d{3,}|Date|Card|Entry)/i,
    /^(?:Withdrawal|Deposit)\s+(?:Online Banking )?Transfer\s+(To|From)\s+/i,
    /^(.+?)\s+(?:SEATTLE|PENNSVILLE|CUPERTINO|NEWARK|MARLTON|WOODSTOWN|HARRISBURG)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1].trim().substring(0, 50);
    }
  }

  return description.substring(0, 50);
}

function detectTransactionType(description: string, amount: number, bankCategory: string): string {
  const desc = description.toLowerCase();

  if (
    desc.includes("payroll") ||
    desc.includes("deposit ach") ||
    desc.includes("dividend") ||
    bankCategory === "Paychecks/Salary" ||
    bankCategory === "Investment Income"
  ) {
    return "income";
  }

  if (desc.includes("transfer") || bankCategory === "Transfers") {
    return "transfer";
  }

  if (
    desc.includes("apple.com/bill") ||
    desc.includes("godaddy") ||
    desc.includes("guardian life") ||
    desc.includes("firstmark") ||
    desc.includes("mr.cooper") ||
    desc.includes("nsm dbamr") ||
    desc.includes("ez pass") ||
    bankCategory === "Insurance" ||
    bankCategory === "Mortgages" ||
    bankCategory === "Loans" ||
    bankCategory === "Online Services"
  ) {
    return "recurring";
  }

  return "misc";
}

// Helper to find matching bill by merchant name
function findMatchingBill(merchant: string, bills: Bill[]): Bill | null {
  const merchantLower = merchant.toLowerCase();
  for (const bill of bills) {
    const billNameLower = bill.name.toLowerCase();
    // Check if merchant contains bill name or vice versa
    if (merchantLower.includes(billNameLower) || billNameLower.includes(merchantLower)) {
      return bill;
    }
  }
  return null;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [month, setMonth] = useState<string>(() => getMonthString(new Date()));

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [uploadingAccount, setUploadingAccount] = useState<AccountType | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const [viewMode, setViewMode] = useState<"all" | "recurring" | "misc" | "income">("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "type">("date");

  useEffect(() => {
    const token = getAuthToken();
    const id = getUserId();
    if (!token || !id) {
      router.push("/login");
      return;
    }
    setUserId(id);
  }, [router]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const [txns, billsList] = await Promise.all([
        listTransactions({ userId, month }),
        listBills({ userId }),
      ]);
      setTransactions(txns);
      setBills(billsList.filter((b) => b.active !== false));
    } catch (e: any) {
      setError(e?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [userId, month]);

  useEffect(() => {
    if (userId) refresh();
  }, [userId, month, refresh]);

  async function handleFileUpload(accountType: AccountType, file: File) {
    if (!userId) return;

    setUploadingAccount(accountType);
    setUploadProgress("Reading file...");
    setError("");

    try {
      const text = await file.text();
      setUploadProgress("Parsing CSV...");

      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        throw new Error("No valid transactions found in CSV");
      }

      setUploadProgress(`Found ${parsed.length} transactions. Creating import...`);

      // Create import record
      const importRecord = await createImport({
        user_id: userId,
        filename: file.name,
        account_type: accountType,
        status: "processing",
        record_count: parsed.length,
      });

      setUploadProgress("Storing raw transactions...");

      // Store raw transactions
      const rawTxns = parsed.map((p) => ({
        import_id: importRecord.id!,
        user_id: userId,
        date: p.date,
        description: p.description,
        amount: p.amount,
        currency: "USD",
        confidence: 1,
        raw_text_line: JSON.stringify(p),
        bank_account_id: p.bank_account_id,
        bank_transaction_id: p.bank_transaction_id,
        bank_category: p.bank_category,
        balance: p.balance,
      }));

      await createTransactionsRaw(rawTxns);

      setUploadProgress("Processing transactions and matching bills...");

      // Get current bills for matching
      const currentBills = await listBills({ userId });
      const activeBills = currentBills.filter((b) => b.active !== false);
      
      // Track bills we've created in this session to avoid duplicates
      const createdBillsByMerchant = new Map<string, Bill>();

      // Process transactions and create/match bills for recurring ones
      const txnData: any[] = [];
      
      for (const p of parsed) {
        const txnType = detectTransactionType(p.description, p.amount, p.bank_category);
        const merchant = extractMerchant(p.description);
        let billId: number | null = null;

        // For recurring transactions, try to match or create a bill
        if (txnType === "recurring" && p.amount < 0) {
          const merchantKey = merchant.toLowerCase();
          
          // First check if we already created a bill for this merchant in this upload
          const existingCreated = createdBillsByMerchant.get(merchantKey);
          if (existingCreated) {
            billId = existingCreated.id;
          } else {
            // Try to find a matching existing bill
            const matchedBill = findMatchingBill(merchant, activeBills);
            
            if (matchedBill) {
              billId = matchedBill.id;
            } else {
              // Create a new bill
              setUploadProgress(`Creating bill for ${merchant}...`);
              try {
                const newBill = await createBill({
                  user_id: userId,
                  name: merchant,
                  due_day: new Date(p.date).getDate(),
                  amount_expected: Math.abs(p.amount),
                  is_variable: false,
                  autopay: false,
                  active: true,
                });
                billId = newBill.id;
                // Add to our tracking maps
                createdBillsByMerchant.set(merchantKey, newBill);
                activeBills.push(newBill);
              } catch (billError) {
                console.error("Failed to create bill:", billError);
                // Continue without bill linkage
              }
            }
          }
        }

        txnData.push({
          user_id: parseInt(userId),
          date: p.date,
          merchant: merchant,
          description: p.description,
          amount: p.amount,
          category_id: 0,
          account_id: 0,
          import_id: importRecord.id!,
          is_split: false,
          notes: "",
          is_recurring: txnType === "recurring",
          bill_id: billId,
          transaction_type: txnType,
        });
      }

      setUploadProgress("Saving transactions...");
      await createTransactionsBulk({ user_id: parseInt(userId), transactions: txnData });

      const billsCreated = createdBillsByMerchant.size;
      setUploadProgress(`Imported ${parsed.length} transactions! Created ${billsCreated} new bills.`);
      await refresh();

      setTimeout(() => {
        setUploadingAccount(null);
        setUploadProgress("");
      }, 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to import transactions");
      setUploadingAccount(null);
      setUploadProgress("");
    }
  }

  async function handleMarkRecurring(txnId: number, isRecurring: boolean, billId: number | null) {
    try {
      await markTransactionRecurring(txnId, billId, isRecurring);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to update transaction");
    }
  }

  async function handleCreateBillFromTransaction(txn: Transaction) {
    if (!userId) return;

    try {
      const newBill = await createBill({
        user_id: userId,
        name: txn.merchant || txn.description.substring(0, 30),
        due_day: new Date(txn.date).getDate(),
        amount_expected: Math.abs(txn.amount),
        is_variable: false,
        autopay: false,
        active: true,
      });

      await markTransactionRecurring(txn.id!, newBill.id, true);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to create bill");
    }
  }

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    if (viewMode !== "all") {
      result = result.filter((t) => t.transaction_type === viewMode);
    }

    result = [...result].sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } else if (sortBy === "amount") {
        return Math.abs(b.amount) - Math.abs(a.amount);
      } else {
        const order = { recurring: 0, misc: 1, income: 2, transfer: 3 };
        return (order[a.transaction_type] ?? 4) - (order[b.transaction_type] ?? 4);
      }
    });

    return result;
  }, [transactions, viewMode, sortBy]);

  const summary = useMemo(() => {
    const income = transactions
      .filter((t) => t.transaction_type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const recurring = transactions
      .filter((t) => t.transaction_type === "recurring")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const misc = transactions
      .filter((t) => t.transaction_type === "misc")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      income,
      recurring,
      misc,
      remaining: income - recurring - misc,
    };
  }, [transactions]);

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

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_id");
    router.push("/login");
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0, fontWeight: 700 }}>💸 Budget Tracker</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.7 }}>
            Upload bank statements and track recurring vs. misc spending for <strong>{formatMonthLabel(month)}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={goToPrevMonth} style={navBtnStyle}>←</button>
            <button onClick={() => setMonth(getMonthString(new Date()))} style={{ ...navBtnStyle, padding: "0 12px", width: "auto" }}>Today</button>
            <button onClick={goToNextMonth} style={navBtnStyle}>→</button>
          </div>

          <button onClick={() => router.push("/dashboard/bills")} style={btnStyle}>📋 Bills</button>
          <button onClick={handleLogout} style={{ ...btnStyle, opacity: 0.7 }}>Logout</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Income" value={summary.income} color="#10b981" />
        <SummaryCard label="Recurring Bills" value={-summary.recurring} color="#f59e0b" />
        <SummaryCard label="Misc Spending" value={-summary.misc} color="#ef4444" />
        <SummaryCard label="Remaining" value={summary.remaining} color={summary.remaining >= 0 ? "#10b981" : "#ef4444"} />
      </div>

      {/* Upload Section */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>📤 Upload Bank Statements</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <UploadCard
            label="Checking"
            accountType="checking"
            isUploading={uploadingAccount === "checking"}
            progress={uploadingAccount === "checking" ? uploadProgress : ""}
            onUpload={(file) => handleFileUpload("checking", file)}
          />
          <UploadCard
            label="Savings"
            accountType="savings"
            isUploading={uploadingAccount === "savings"}
            progress={uploadingAccount === "savings" ? uploadProgress : ""}
            onUpload={(file) => handleFileUpload("savings", file)}
          />
          <UploadCard
            label="High Yield"
            accountType="high_yield"
            isUploading={uploadingAccount === "high_yield"}
            progress={uploadingAccount === "high_yield" ? uploadProgress : ""}
            onUpload={(file) => handleFileUpload("high_yield", file)}
          />
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, border: "1px solid #fca5a5", borderRadius: 12, background: "#fef2f2", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Filter Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
          {(["all", "recurring", "misc", "income"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
                background: viewMode === mode ? "white" : "transparent",
                boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {mode === "all" ? "All" : mode === "recurring" ? "🔄 Recurring" : mode === "misc" ? "🛒 Misc" : "💰 Income"}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white" }}
        >
          <option value="date">Sort by Date</option>
          <option value="amount">Sort by Amount</option>
          <option value="type">Sort by Type</option>
        </select>

        <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 14 }}>
          {filteredTransactions.length} transactions
        </span>
      </div>

      {/* Transactions List */}
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", opacity: 0.7 }}>Loading transactions...</div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 16 }}>
          <p style={{ margin: 0, opacity: 0.7 }}>No transactions found. Upload a bank statement to get started!</p>
        </div>
      ) : (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
          {filteredTransactions.map((txn, idx) => (
            <TransactionRow
              key={txn.id || idx}
              transaction={txn}
              bills={bills}
              onMarkRecurring={handleMarkRecurring}
              onCreateBill={() => handleCreateBillFromTransaction(txn)}
              isLast={idx === filteredTransactions.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTS ============

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>
        {value >= 0 ? "" : "-"}${Math.abs(value).toFixed(2)}
      </div>
    </div>
  );
}

function UploadCard({
  label,
  accountType,
  isUploading,
  progress,
  onUpload,
}: {
  label: string;
  accountType: AccountType;
  isUploading: boolean;
  progress: string;
  onUpload: (file: File) => void;
}) {
  const inputId = `upload-${accountType}`;

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
      {isUploading ? (
        <div style={{ fontSize: 13, color: "#6366f1" }}>{progress}</div>
      ) : (
        <label
          htmlFor={inputId}
          style={{
            display: "inline-block",
            padding: "8px 16px",
            background: "#f1f5f9",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Choose CSV
          <input
            id={inputId}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  bills,
  onMarkRecurring,
  onCreateBill,
  isLast,
}: {
  transaction: Transaction;
  bills: Bill[];
  onMarkRecurring: (txnId: number, isRecurring: boolean, billId: number | null) => void;
  onCreateBill: () => void;
  isLast: boolean;
}) {
  const [showBillSelect, setShowBillSelect] = useState(false);

  const typeColors: Record<string, string> = {
    recurring: "#f59e0b",
    misc: "#6366f1",
    income: "#10b981",
    transfer: "#8b5cf6",
  };

  const typeEmojis: Record<string, string> = {
    recurring: "🔄",
    misc: "🛒",
    income: "💰",
    transfer: "↔️",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 16px",
        borderBottom: isLast ? "none" : "1px solid #f1f5f9",
        background: transaction.is_recurring ? "#fffbeb" : "white",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: typeColors[transaction.transaction_type] + "20",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        {typeEmojis[transaction.transaction_type] || "📝"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {transaction.merchant || transaction.description.substring(0, 40)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
          {new Date(transaction.date).toLocaleDateString()} • {transaction.description.substring(0, 60)}
          {transaction.description.length > 60 ? "..." : ""}
        </div>
      </div>

      {transaction.bill_id && (
        <div style={{ fontSize: 12, padding: "4px 8px", background: "#fef3c7", borderRadius: 6, color: "#92400e" }}>
          Linked to bill
        </div>
      )}

      <div
        style={{
          fontWeight: 600,
          fontSize: 16,
          color: transaction.amount >= 0 ? "#10b981" : "#ef4444",
          minWidth: 90,
          textAlign: "right",
        }}
      >
        {transaction.amount >= 0 ? "+" : "-"}${Math.abs(transaction.amount).toFixed(2)}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!transaction.is_recurring && transaction.amount < 0 && (
          <button
            onClick={() => setShowBillSelect(!showBillSelect)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              background: "white",
              cursor: "pointer",
            }}
            title="Mark as recurring bill"
          >
            🔄 Recurring
          </button>
        )}

        {transaction.is_recurring && (
          <button
            onClick={() => onMarkRecurring(transaction.id!, false, null)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #fecaca",
              borderRadius: 6,
              background: "#fef2f2",
              cursor: "pointer",
              color: "#dc2626",
            }}
            title="Unmark as recurring"
          >
            ✕
          </button>
        )}
      </div>

      {showBillSelect && (
        <div
          style={{
            position: "absolute",
            right: 100,
            marginTop: 60,
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 10,
            minWidth: 200,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Link to Bill:</div>
          {bills.map((bill) => (
            <button
              key={bill.id}
              onClick={() => {
                onMarkRecurring(transaction.id!, true, bill.id);
                setShowBillSelect(false);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 10px",
                border: "none",
                background: "#f8fafc",
                borderRadius: 6,
                marginBottom: 4,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {bill.name} {bill.amount_expected ? `($${bill.amount_expected})` : ""}
            </button>
          ))}
          <button
            onClick={() => {
              onCreateBill();
              setShowBillSelect(false);
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 10px",
              border: "1px dashed #e2e8f0",
              background: "white",
              borderRadius: 6,
              cursor: "pointer",
              textAlign: "left",
              color: "#6366f1",
            }}
          >
            + Create New Bill
          </button>
          <button
            onClick={() => setShowBillSelect(false)}
            style={{
              display: "block",
              width: "100%",
              padding: "6px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              marginTop: 8,
              fontSize: 12,
              opacity: 0.6,
            }}
          >
            Cancel
          </button>
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
