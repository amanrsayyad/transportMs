"use client";

import React, { CSSProperties } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/lib/redux/store";
import { Invoice } from "@/lib/redux/slices/invoiceSlice";

interface InvoicePDFProps {
  invoice: Invoice;
}

export const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice }) => {
  // Balanced styles for 50% page height invoice - readable but compact
  const styles: { [key: string]: CSSProperties } = {
    container: {
      fontFamily: "Arial, sans-serif",
      backgroundColor: "#ffffff",
      padding: "8px 12px", // Minimal padding to maximize space for two per page
      width: "100%",
      maxWidth: "800px",
      height: "auto",
      // minHeight controlled by parent print CSS for bulk print
      boxSizing: "border-box",
      margin: "0 auto 8px auto", // Small bottom margins
      fontSize: "10px",
      lineHeight: "1.4",
      display: "flex",
      flexDirection: "column" as const,
      pageBreakInside: "avoid" as const, // Prevent breaking an invoice across pages
    },
    header: {
      border: "2px solid #000000",
      padding: "8px 10px",
      flex: 1,
      display: "flex",
      flexDirection: "column" as const,
    },
    headerFlex: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "4px",
    },
    companyName: {
      fontSize: "16px",
      fontWeight: "bold",
      color: "#dc2626",
      margin: "0 0 4px 0",
    },
    smallText: {
      fontSize: "9px",
      margin: "1px 0",
      lineHeight: "1.4",
    },
    rightAlign: {
      textAlign: "right" as const,
    },
    divider: {
      borderTop: "1px solid #000000",
      paddingTop: "4px",
      marginTop: "4px",
    },
    infoRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: "20px",
      fontSize: "9px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      border: "1px solid #000000",
      fontSize: "9px",
      marginTop: "8px",
    },
    tableHeader: {
      backgroundColor: "#f3f4f6",
    },
    tableCell: {
      border: "1px solid #000000",
      padding: "4px 6px",
      textAlign: "left" as const,
    },
    tableCellCenter: {
      border: "1px solid #000000",
      padding: "4px 5px",
      textAlign: "center" as const,
    },
    totalsRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "8px",
      paddingTop: "6px",
      borderTop: "1px solid #ccc",
      fontSize: "9px",
    },
    footer: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: "auto", // Push footer to bottom of container
      fontSize: "9px",
    },
  };

  // Select current app user and customers from Redux store
  const currentAppUser = useSelector((state: RootState) => state.appUsers.currentAppUser);
  const appUsersList = useSelector((state: RootState) => state.appUsers.appUsers);
  const customers = useSelector((state: RootState) => state.customers.customers);
  const banks = useSelector((state: RootState) => state.banks.banks);

  // Determine effective App User for this invoice
  const resolveId = (idLike: any): string | null => {
    if (!idLike) return null;
    if (typeof idLike === 'string') return idLike;
    if (typeof idLike === 'object' && idLike._id) return idLike._id as string;
    return null;
  };
  const invoiceUserId = resolveId((invoice as any).appUserId);
  const invoiceAppUser = invoiceUserId ? (appUsersList.find(u => u._id === invoiceUserId) ?? null) : null;
  const effectiveAppUser = invoiceAppUser ?? (currentAppUser ?? (appUsersList.find(u => u.status === "active") ?? appUsersList[0] ?? null));
  const displayCompanyOrUserName = effectiveAppUser?.name || "_________";

  const effectiveBank = banks.find(b => b._id === invoice.bankId) || banks.find(b => {
    const bId = typeof b.appUserId === 'string' ? b.appUserId : (b.appUserId as any)?._id;
    return bId === effectiveAppUser?._id;
  });

  const panNo = (effectiveAppUser as any)?.panNo || (effectiveAppUser?.gstin && effectiveAppUser.gstin.length >= 12 ? effectiveAppUser.gstin.substring(2, 12) : "_________");

  // Format date as dd-mm-yy
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  const currentDateTimeStr = (() => {
    const now = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} +05'30'`;
  })();

  const uniqueSigId = String(invoice._id || "").slice(-8).toUpperCase() || Math.random().toString(36).substring(2, 10).toUpperCase();

  const appUserName = effectiveAppUser?.name?.trim() || "";
  const isCompany = appUserName === "RDS Transport" || appUserName === "KGN Trading";
  const signatureName = isCompany ? "Riyaj Sayyad" : (appUserName || "_________");
  const nameParts = signatureName.split(" ");
  const signatureFirstName = nameParts[0] || "";
  const signatureLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  // Find matching customer
  const matchedCustomer = customers.find(
    (c) => c.customerName === invoice.customerName || c.companyName === invoice.customerName
  );

  // Calculate totals
  const baseTotal = (invoice.rows || []).reduce((sum, r) => sum + (r?.total || 0), 0);
  const totalWeight = (invoice.rows || []).reduce((sum, r) => sum + (Number(r?.weight) || 0), 0);
  const hasMultipleRows = (invoice.rows || []).length > 1;
  const percent = typeof (invoice as any).taxPercent === 'number' ? (invoice as any).taxPercent : 0;
  const taxAmount = Math.round(typeof invoice.taxAmount === 'number' ? invoice.taxAmount : (percent > 0 ? (baseTotal * percent) / 100 : 0));
  const totalWithTax = Math.round(typeof invoice.total === 'number' ? invoice.total : (baseTotal + taxAmount));
  const adv = Math.round(typeof invoice.advanceAmount === 'number' ? invoice.advanceAmount : 0);
  
  // For consolidated invoices: extract advance amounts from product names and calculate balance
  let totalAdvanceFromRows = 0;
  let isConsolidatedInvoice = false;
  
  (invoice.rows || []).forEach(row => {
    const productName = row.product || '';
    // Check if this is a consolidated invoice row (contains "Advance: ₹")
    if (productName.includes('Advance: ₹')) {
      isConsolidatedInvoice = true;
      // Extract advance amount from product name like "Invoice RS00001 (Advance: ₹3,000, Remaining: ₹7,000)"
      const advanceMatch = productName.match(/Advance:\s*₹([\d,]+)/);
      if (advanceMatch) {
        const advanceValue = parseFloat(advanceMatch[1].replace(/,/g, ''));
        totalAdvanceFromRows += advanceValue;
      }
    }
  });
  
  // Calculate balance and total remaining based on invoice type
  let bal, totalRemaining;
  if (isConsolidatedInvoice) {
    // For consolidated: Balance = Total Advance + Lumpsum Amount
    bal = totalAdvanceFromRows + adv;
    // Total Remaining = Total - Balance
    totalRemaining = Math.max(0, totalWithTax - bal);
  } else {
    // For regular invoices
    bal = Math.round(typeof invoice.remainingAmount === 'number' ? invoice.remainingAmount : Math.max(0, totalWithTax - adv));
    totalRemaining = totalWithTax;
  }

  return (
    <>
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
            }
            .invoice-pdf-content {
              page-break-inside: avoid !important;
            }
          }
        `}
      </style>
      <div id="invoice-pdf" className="invoice-pdf-content" style={styles.container}>
        <div style={styles.header}>
          {/* Header Row */}
          <div style={styles.headerFlex}>
            <div>
              <h1 style={styles.companyName}>{displayCompanyOrUserName}</h1>
              <p style={styles.smallText}>{!["Riyaj Sayyad", "Asif Sayyad", "Rahiman Sayyad", "Rehiman Sayyad"].includes((displayCompanyOrUserName || "").trim()) && (
                <>Transport Contractor,</>
              )}
                Commission Agent
              </p>
              <p style={styles.smallText}><strong>GSTIN:</strong> {effectiveAppUser?.gstin || "_________"}</p>
              <p style={styles.smallText}><strong>Address:</strong> {effectiveAppUser?.address || "Near Bombay Restaurant, Gorakhpur-Pirwadi, NH-4, Satara."}</p>
              <p style={styles.smallText}>Email: rdsTransport5192@gmail.com | Ph: 9604047861 / 9765000068</p>
            </div>
            <div style={{ ...styles.smallText, ...styles.rightAlign }}>
              <p style={{ fontSize: "11px", fontWeight: "bold" }}>Date: {formatDate(invoice.date)}</p>
              <p><strong>From:</strong> {invoice.from.split(' -> ')[0]}</p>
              <p><strong>To:</strong> {invoice.to}</p>

            </div>
          </div>

          {/* Customer Info */}
          <div style={styles.divider}>
            <div style={styles.infoRow}>
              <div>
                <p style={styles.smallText}><strong>Company:</strong> {invoice.customerName}</p>
                <p style={styles.smallText}><strong>Address:</strong> {matchedCustomer?.address || "_________"}</p>
                <p style={styles.smallText}><strong>Consignor:</strong> {invoice.consignor || "_"}</p>
              </div>
              <div style={styles.rightAlign}>
                <p style={styles.smallText}><strong>GSTIN:</strong> {matchedCustomer?.gstin || "_________"}</p>
                <p style={styles.smallText}><strong>L.R. No.:</strong> {invoice.lrNo}</p>
                <p style={styles.smallText}><strong>Consignee:</strong> {invoice.consignee || "_"}</p>
              </div>
            </div>
          </div>

          {/* Table */}
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.tableCell}>Product</th>
                <th style={styles.tableCellCenter}>Truck No.</th>
                <th style={styles.tableCellCenter}>Articles</th>
                <th style={styles.tableCellCenter}>Weight</th>
                <th style={styles.tableCellCenter}>Rate</th>
                <th style={styles.tableCellCenter}>Tax</th>
                <th style={styles.tableCellCenter}>Amount</th>
                <th style={styles.tableCell}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {invoice.rows.map((row, index) => {
                const rowTotal = Number(row?.total || 0);
                const perRowTax = percent > 0
                  ? (rowTotal * percent) / 100
                  : baseTotal > 0
                    ? (taxAmount * (rowTotal / baseTotal))
                    : 0;
                return (
                  <tr key={index}>
                    <td style={styles.tableCell}>{row.product}</td>
                    <td style={styles.tableCellCenter}>{row.truckNo}</td>
                    <td style={styles.tableCellCenter}>{row.articles}</td>
                    <td style={styles.tableCellCenter}>{row.weight} Kg</td>
                    <td style={styles.tableCellCenter}>₹{row.rate}</td>
                    <td style={styles.tableCellCenter}>₹{perRowTax.toFixed(0)}</td>
                    <td style={styles.tableCellCenter}>₹{rowTotal.toFixed(2)}</td>
                    <td style={styles.tableCell}>{row.remarks}</td>
                  </tr>
                );
              })}
            </tbody>
            {hasMultipleRows && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ borderBottom: "1px solid #000", borderRight: "1px solid #000", padding: "4px", fontSize: "10px", textAlign: 'right' }}><strong>Total Weight:</strong></td>
                  <td style={{ ...styles.tableCellCenter, fontWeight: 'bold' }}>{totalWeight} Kg</td>
                  <td colSpan={4} style={{ borderBottom: "1px solid #000", borderLeft: "1px solid #000", padding: "4px", fontSize: "10px" }}></td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Totals Row */}
          <div style={{ ...styles.totalsRow, marginTop: "8px", fontSize: "9px", lineHeight: "1.4" }}>
            <div>
              <span style={{ fontSize: "11px" }}><strong style={{ fontSize: "11px" }}>Tax ({percent}%):</strong> ₹{taxAmount}</span>
              {isConsolidatedInvoice && totalAdvanceFromRows > 0 && (
                <span style={{ marginLeft: "12px", fontSize: "11px" }}><strong>Total Advance:</strong> ₹{totalAdvanceFromRows.toFixed(0)}</span>
              )}
              {adv > 0 && (
                <span style={{ marginLeft: "12px", fontSize: "11px" }}><strong>Lumpsum Amount:</strong> ₹{adv}</span>
              )}
              <span style={{ marginLeft: "12px", fontSize: "11px" }}><strong>Balance:</strong> ₹{bal}</span>
            </div>
            <div>
              <strong style={{ fontSize: "12px", color: "#dc2626" }}>
                {isConsolidatedInvoice ? 'TOTAL REMAINING' : 'TOTAL'}: ₹{isConsolidatedInvoice ? totalRemaining : totalWithTax}
              </strong>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: "auto", fontSize: "9px", lineHeight: "1.3" }}>
            <div style={{ display: "flex", justifyContent: "flex-start", flexDirection: "column", marginBottom: "4px", borderTop: "1px dashed #ccc", paddingTop: "3px" }}>
              <p style={{ margin: "2px 0", fontWeight: "bold" }}>Bank Details:</p>
              <p style={{ margin: "1px 0" }}><strong>Bank Name:</strong> {effectiveBank?.bankName?.includes('-') ? effectiveBank.bankName.split('-').pop()?.trim() : effectiveBank?.bankName || "_________"}</p>
              <p style={{ margin: "1px 0" }}><strong>A/C No:</strong> {effectiveBank?.accountNumber || "_________"}</p>
              <p style={{ margin: "1px 0" }}><strong>IFSC Code:</strong> {effectiveBank?.ifscCode || "_________"}</p>
              <p style={{ margin: "1px 0" }}><strong>PAN No:</strong> {panNo}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ margin: "2px 0" }}>This is a Computer Generated Invoice</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: "2px 0", paddingBottom: "5px" }}>Subject to Satara Jurisdiction</p>
                <div style={{ display: "inline-block", textAlign: "center" }}>
                  <p style={{ fontWeight: "bold", margin: "0 0 5px 0" }}>for {displayCompanyOrUserName}</p>

                  <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", border: "1px solid #9ca3af", padding: "4px 8px", borderRadius: "4px" }}>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.15, pointerEvents: "none" }}>
                      <svg width="40" height="40" viewBox="0 0 100 100">
                        <path d="M 30 80 Q 50 10 80 50 Q 60 90 20 60 Q 10 30 50 20" fill="none" stroke="red" strokeWidth="4" />
                        <path d="M 40 40 L 60 40 L 50 60 Z" fill="red" />
                      </svg>
                    </div>

                    <div style={{ fontFamily: "'Times New Roman', serif", fontSize: "13px", lineHeight: "1", textAlign: "left" }}>
                      {signatureFirstName}{signatureLastName ? <><br />{signatureLastName}</> : null}
                    </div>
                    <div style={{ fontFamily: "sans-serif", fontSize: "6px", lineHeight: "1.2", textAlign: "left" }}>
                      Digitally signed by {signatureName}<br />
                      DN: cn={signatureName}<br />
                      Date: {currentDateTimeStr}<br />
                      Valid #{uniqueSigId}
                    </div>
                  </div>

                  <p style={{ margin: "3px 0 0 0" }}>Authorised Signatory</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const printInvoiceElement = () => {
  try {
    const el = document.getElementById("invoice-pdf");
    if (!el) return;
    const html = el.outerHTML;
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.width = "0";
    iframe.height = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.ownerDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title></head><body>${html}</body></html>`);
    doc.close();
    setTimeout(() => {
      const win = iframe.contentWindow;
      if (win) {
        win.focus();
        win.print();
      }
      document.body.removeChild(iframe);
    }, 300);
  } catch { }
};
