"use client";

import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/lib/redux/store";
import {
  fetchInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  clearError as clearInvoiceError,
  InvoiceCreateData,
  InvoiceRow,
  bulkUpdateInvoiceStatus,
} from "@/lib/redux/slices/invoiceSlice";
import {
  fetchCustomers,
  Customer,
  Product,
  clearError as clearCustomerError,
} from "@/lib/redux/slices/customerSlice";
import { fetchVehicles } from "@/lib/redux/slices/vehicleSlice";
import { fetchBanks } from "@/lib/redux/slices/bankSlice";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Pagination from "@/components/common/Pagination";
import { InvoicePDF, printInvoiceElement } from "@/components/invoices/InvoicePDF";
import { generateInvoicePDF } from "@/lib/utils/pdfGenerator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, FileText, Download, Edit, Trash2, Eye, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { DownloadButton } from "@/components/common/DownloadButton";
import { fetchAppUsers } from "@/lib/redux/slices/appUserSlice";

interface InvoiceFormData extends InvoiceCreateData {
  id?: string;
}

const getLocalDateString = (d: Date | string) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const InvoicesPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { invoices, loading, error, pagination } = useSelector(
    (state: RootState) => state.invoices
  );
  const { customers } = useSelector((state: RootState) => state.customers);
  const { vehicles } = useSelector((state: RootState) => state.vehicles);
  const { banks } = useSelector((state: RootState) => state.banks);
  const { appUsers, currentAppUser } = useSelector(
    (state: RootState) => state.appUsers
  );

  const effectiveAppUser =
    currentAppUser ??
    (appUsers.find((u) => u.status === "active") ?? appUsers[0] ?? null);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const invoiceContentRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);
  useEffect(() => {
    const computeScale = () => {
      const c = previewContainerRef.current;
      const i = invoiceContentRef.current;
      if (!c || !i) return;
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      const iw = i.scrollWidth;
      const ih = i.scrollHeight;
      if (cw > 0 && ch > 0 && iw > 0 && ih > 0) {
        const s = Math.min(cw / iw, ch / ih, 1);
        setPreviewScale(s);
      }
    };
    if (isPreviewOpen) {
      computeScale();
      const onResize = () => computeScale();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
  }, [isPreviewOpen, previewInvoice]);
  const matchedCustomer = previewInvoice
    ? customers.find(
      (c) =>
        c.customerName === previewInvoice.customerName ||
        c.companyName === previewInvoice.customerName
    )
    : undefined;
  // Resolve App User specifically for the previewed invoice (prefer invoice.appUserId)
  const resolveId = (idLike: any): string | null => {
    if (!idLike) return null;
    if (typeof idLike === 'string') return idLike;
    if (typeof idLike === 'object' && idLike._id) return idLike._id as string;
    return null;
  };
  const previewAppUserId = resolveId(previewInvoice?.appUserId);
  const previewEffectiveAppUser = previewAppUserId
    ? (appUsers.find((u: any) => u._id === previewAppUserId) ?? effectiveAppUser)
    : effectiveAppUser;
  const shouldHideCommissionLine = ["Riyaj Sayyad", "Asif Sayyad", "Rehiman Sayyad", "Rahiman Sayyad"].includes((previewEffectiveAppUser?.name || "").trim());
  
  const previewEffectiveBank = previewInvoice?.bankId
    ? banks.find((b: any) => b._id === previewInvoice.bankId)
    : banks.find((b: any) => {
        const bId = typeof b.appUserId === 'string' ? b.appUserId : (b.appUserId as any)?._id;
        return bId === previewEffectiveAppUser?._id;
      });

  const previewPanNo = (previewEffectiveAppUser as any)?.panNo || (previewEffectiveAppUser?.gstin && previewEffectiveAppUser.gstin.length >= 12 ? previewEffectiveAppUser.gstin.substring(2, 12) : "_________");

  const currentDateTimeStr = (() => {
    const now = previewInvoice?.createdAt ? new Date(previewInvoice.createdAt) : new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} +05'30'`;
  })();

  const previewUniqueSigId = String(previewInvoice?._id || "").slice(-8).toUpperCase() || Math.random().toString(36).substring(2, 10).toUpperCase();

  const previewAppUserName = previewEffectiveAppUser?.name?.trim() || "";
  const previewIsCompany = previewAppUserName === "RDS Transport" || previewAppUserName === "KGN Trading";
  const previewSignatureName = previewIsCompany ? "Riyaj Sayyad" : (previewAppUserName || "_________");
  const previewNameParts = previewSignatureName.split(" ");
  const previewSignatureFirstName = previewNameParts[0] || "";
  const previewSignatureLastName = previewNameParts.length > 1 ? previewNameParts.slice(1).join(" ") : "";

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [customerProducts, setCustomerProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState({
    status: "all",
    customerName: "all",
    lrNo: "",
    fromDate: "",
    toDate: "",
    appUserId: "all",
    vehicleNo: "",
  });

  // Track selected invoices for row checkboxes and select-all
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [bulkPrintInvoices, setBulkPrintInvoices] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [selectedBulkAppUserId, setSelectedBulkAppUserId] = useState<string>("");
  const [lumpsumAmount, setLumpsumAmount] = useState<string>("");
  const [vehicleSearch, setVehicleSearch] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState<string>("");

  const printElementById = (elementId: string) => {
    try {
      const el = document.getElementById(elementId);
      if (!el) return;

      // Clone the element to modify styles for printing without affecting the DOM
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.position = 'static';
      clone.style.left = 'auto';
      clone.style.top = 'auto';
      clone.style.display = 'block';

      const html = clone.outerHTML;

      // Print CSS that forces exactly 2 invoices per A4 page
      // A4 = 297mm tall, with 10mm margins = 277mm usable.
      // Each invoice gets ~135mm, with 7mm gap between.
      const printStyles = `
        <style>
          @media print {
            @page {
              size: A4;
              margin: 10mm;
            }
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; }
            .bulk-invoice-item {
              height: 135mm;
              max-height: 135mm;
              overflow: visible;
              page-break-inside: avoid;
              break-inside: avoid;
              margin-bottom: 4mm;
              border-bottom: 1px dashed #ccc;
              padding-bottom: 2mm;
            }
            .bulk-invoice-item:nth-child(2n) {
              page-break-after: always;
              break-after: page;
              margin-bottom: 0;
            }
            .bulk-invoice-item:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .invoice-pdf-content {
              min-height: unset !important;
              height: auto !important;
              max-height: 128mm !important;
              overflow: visible !important;
              page-break-inside: avoid !important;
            }
          }
        </style>
      `;

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
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print</title>${printStyles}</head><body>${html}</body></html>`);
      doc.close();
      setTimeout(() => {
        const win = iframe.contentWindow;
        if (win) {
          win.focus();
          win.print();
        }
        document.body.removeChild(iframe);
      }, 500);
    } catch (e) {
      console.error("Print error:", e);
      toast.error("Failed to print");
    }
  };

  const [formData, setFormData] = useState<InvoiceFormData>({
    date: getLocalDateString(new Date()),
    from: "",
    to: "",
    taluka: "",
    dist: "",
    customerName: "",
    consignor: "",
    consignee: "",
    lrNo: "",
    remarks: "",
    taxPercent: undefined,
    advanceAmount: undefined,
    advanceAmounts: [],
    appUserId: undefined,
    bankId: undefined,
    status: "Unpaid",
    rows: [
      {
        product: "",
        truckNo: "",
        articles: "",
        weight: 0,
        rate: 0,
        total: 0,
        remarks: "",
      },
    ],
  });

  useEffect(() => {
    dispatch(fetchInvoices({ page: 1, limit: 10 }));
    dispatch(fetchCustomers());
    dispatch(fetchVehicles());
    dispatch(fetchBanks());
    // Ensure app users are available for InvoicePDF rendering
    dispatch(fetchAppUsers());
  }, [dispatch]);

  const handlePageChange = (page: number) => {
    dispatch(fetchInvoices({ page, limit: pagination.limit, ...filters }));
  };

  const handleLimitChange = (limit: number) => {
    dispatch(fetchInvoices({ page: 1, limit, ...filters }));
  };

  // Toggle selection for a single invoice row
  const handleToggleSelectRow = (id: string, checked: boolean) => {
    setSelectedInvoiceIds((prev) => {
      const exists = prev.includes(id);
      if (checked) {
        return exists ? prev : [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  };

  // Toggle selection for all visible invoices
  const handleToggleSelectAll = (checked: boolean) => {
    const visibleIds = invoices.map((i: any) => i._id);
    setSelectedInvoiceIds((prev) => {
      if (checked) {
        const merged = new Set(prev);
        visibleIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      }
      // Uncheck removes only visible ones, keeps other selections
      return prev.filter((id) => !visibleIds.includes(id));
    });
  };

  // Default/validated bank selection bound to selected App User
  useEffect(() => {
    const forUser = (banks || []).filter(
      (b: any) => b?.appUserId?._id === selectedBulkAppUserId
    );
    // If user not selected, clear bank selection
    if (!selectedBulkAppUserId) {
      if (selectedBankId) setSelectedBankId("");
      return;
    }
    // Keep current bank if it belongs to the selected user
    if (selectedBankId && forUser.some((b) => b._id === selectedBankId)) {
      return;
    }
    if (forUser.length > 0) {
      const active = forUser.find((b: any) => b.isActive);
      setSelectedBankId(active?._id || forUser[0]._id);
    } else {
      setSelectedBankId("");
    }
  }, [banks, selectedBulkAppUserId, selectedBankId]);

  const handleBulkSetStatus = async (newStatus: "Paid" | "Unpaid") => {
    if (selectedInvoiceIds.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }
    try {
      if (
        newStatus === "Paid" && (!selectedBulkAppUserId || !selectedBankId)
      ) {
        toast.error("Select an App User and a bank to credit income");
        return;
      }
      
      const appUserId = selectedBulkAppUserId || effectiveAppUser?._id;
      const lumpsumValue = lumpsumAmount ? parseFloat(lumpsumAmount) : undefined;
      
      const res = await dispatch(
        bulkUpdateInvoiceStatus({
          invoiceIds: selectedInvoiceIds,
          status: newStatus,
          bankId: newStatus === "Paid" ? selectedBankId : undefined,
          appUserId: newStatus === "Paid" ? appUserId : undefined,
          category: "Invoice Payment",
          description: undefined,
          date: new Date().toISOString(),
          lumpsumAmount: lumpsumValue,
        })
      ).unwrap();
      
      // Show success message with details
      if (res.consolidatedInvoice) {
        toast.success(
          `Updated ${res.updatedCount} invoice(s) to ${newStatus}. ` +
          `Consolidated invoice ${res.consolidatedInvoice.lrNo} created with remaining amount: ₹${res.lumpsumDetails.remainingAmount}`
        );
      } else {
        toast.success(`Updated ${res.updatedCount} invoice(s) to ${newStatus}`);
      }
      
      setSelectedInvoiceIds([]);
      setLumpsumAmount("");
      dispatch(fetchInvoices({ page: pagination.page, limit: pagination.limit, ...filters }));
    } catch (err: any) {
      toast.error(err?.message || "Failed to update invoice statuses");
    }
  };

  const handleBulkPrint = () => {
    if (selectedInvoiceIds.length === 0) {
      toast.error("Select invoices to print");
      return;
    }
    // Find the full invoice objects for selected IDs
    // Note: This relies on invoices being in the current view state.
    // If pagination is involved, we might only print what's loaded.
    // Assuming for now user selects from visible list.
    const selected = invoices.filter((inv: any) => selectedInvoiceIds.includes(inv._id));
    if (selected.length === 0) {
      toast.error("No valid invoices selected");
      return;
    }
    setBulkPrintInvoices(selected);

    // Give time for React to render the hidden container
    setTimeout(() => {
      printElementById("bulk-invoice-pdf");
      // Optional: clear selection or bulk print state after print
      // setBulkPrintInvoices([]); 
    }, 500);
  };

  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch(clearInvoiceError());
    }
  }, [error, dispatch]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // When customer is selected, fetch their products
    if (name === "customerName") {
      console.log("Customer selected:", value);
      const customer = customers.find((c) => c.companyName === value);
      console.log("Found customer:", customer);
      if (customer) {
        setSelectedCustomer(customer);
        setCustomerProducts(customer.products || []);
        console.log("Set customer products:", customer.products || []);
      } else {
        setSelectedCustomer(null);
        setCustomerProducts([]);
      }
    }

    if (name === "appUserId") {
      // Auto-generate LR if empty
      if (!formData.lrNo) {
        // We need to use the new value, not formData.appUserId which is stale here
        // But generateLRNumber relies on formData or effectiveAppUser.
        // Let's call the API directly here or simpler: update formData then call logic?
        // React state update is async.
        // Better: Fetch directly here.
        fetch(`/api/invoices/next-lr?appUserId=${value}`)
          .then(res => res.json())
          .then(data => {
            if (data.nextLr) {
              setFormData(prev => ({ ...prev, lrNo: data.nextLr }));
            }
          })
          .catch(err => console.error("Auto-generate LR failed", err));
      }
    }
  };

  const handleProductSelect = (index: number, productName: string) => {
    const product = customerProducts.find((p) => p.productName === productName);
    if (product) {
      setFormData((prev) => {
        const updatedRows = [...prev.rows];
        updatedRows[index] = {
          ...updatedRows[index],
          product: productName,
          rate: product.productRate,
          // Recalculate total immediately
          total: (updatedRows[index].weight || 0) * product.productRate
        };
        return {
          ...prev,
          rows: updatedRows,
        };
      });
    } else {
      // If no product found (e.g. manual entry or error), still allow selection?
      // For now just update product name if no rate found, or do nothing? 
      // The original code only updated if product found.
      // Let's assume we should at least set the name.
      handleRowChange(index, "product", productName);
    }
  };

  const handleRowChange = (
    index: number,
    field: string,
    value: string | number
  ) => {
    setFormData((prev) => {
      const updatedRows = [...prev.rows];
      const currentRow = { ...updatedRows[index], [field]: value };

      // Auto-calculate total
      if (field === "weight" || field === "rate") {
        const weight = field === "weight" ? Number(value) : currentRow.weight || 0;
        const rate = field === "rate" ? Number(value) : currentRow.rate || 0;
        currentRow.total = weight * rate;
      }

      updatedRows[index] = currentRow;
      return {
        ...prev,
        rows: updatedRows,
      };
    });
  };

  const addRow = () => {
    setFormData((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        {
          product: "",
          truckNo: "",
          articles: "",
          weight: 0,
          rate: 0,
          total: 0,
          remarks: "",
        },
      ],
    }));
  };

  const removeRow = (index: number) => {
    if (formData.rows.length > 1) {
      setFormData((prev) => ({
        ...prev,
        rows: prev.rows.filter((_, i) => i !== index),
      }));
    }
  };

  const generateLRNumber = async () => {
    const userId = formData.appUserId || effectiveAppUser?._id;
    if (!userId) {
      toast.error("Please select an App User first");
      return;
    }

    try {
      const res = await fetch(`/api/invoices/next-lr?appUserId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.nextLr) {
          setFormData((prev) => ({ ...prev, lrNo: data.nextLr }));
        }
      } else {
        console.error("Failed to fetch next LR");
        // Fallback or just notify? fallback to random not desired if user wants sequential
        toast.error("Failed to generate sequential LR. Please check connection.");
      }
    } catch (e) {
      console.error("Error generating LR:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (
      !formData.date ||
      !formData.from ||
      !formData.to ||
      !formData.customerName
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (formData.rows.length === 0) {
      toast.error("At least one row is required");
      return;
    }

    for (const row of formData.rows) {
      if (!row.product || !row.truckNo) {
        toast.error("Product and truck number are required for each row");
        return;
      }
    }

    try {
      // Prepare payload; coerce taxPercent to number if provided
      const payload: any = { ...formData };
      if (payload.taxPercent === "" || payload.taxPercent === undefined || payload.taxPercent === null) {
        delete payload.taxPercent;
      } else {
        payload.taxPercent = Number(payload.taxPercent);
      }
      // Handle advanceAmounts array
      if (Array.isArray(payload.advanceAmounts) && payload.advanceAmounts.length > 0) {
        payload.advanceAmounts = payload.advanceAmounts.map((a: any) => ({
          label: String(a?.label || ''),
          amount: Number(a?.amount || 0),
          paymentType: String(a?.paymentType || 'Cash'),
          paymentReceived: String(a?.paymentReceived || 'appuser'),
        }));
        payload.advanceAmount = payload.advanceAmounts.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);
      } else if (payload.advanceAmount === "" || payload.advanceAmount === undefined || payload.advanceAmount === null) {
        delete payload.advanceAmount;
      } else {
        payload.advanceAmount = Number(payload.advanceAmount);
      }
      if (editingInvoice) {
        await dispatch(
          updateInvoice({
            id: editingInvoice._id,
            invoiceData: payload,
          })
        ).unwrap();
        toast.success("Invoice updated successfully");
      } else {
        await dispatch(createInvoice(payload)).unwrap();
        toast.success("Invoice created successfully");
      }

      handleSheetClose();
      dispatch(fetchInvoices({ page: pagination.page, limit: pagination.limit, ...filters }));
    } catch (error: any) {
      toast.error(error.message || "Failed to save invoice");
    }
  };

  const handleEdit = (invoice: any) => {
    setEditingInvoice(invoice);
    setFormData({
      ...invoice,
      date: invoice.date ? getLocalDateString(invoice.date) : "",
      bankId: invoice.bankId || undefined,
      advanceAmounts: Array.isArray(invoice.advanceAmounts) && invoice.advanceAmounts.length > 0
        ? invoice.advanceAmounts.map((a: any) => ({
            label: a.label || '',
            amount: Number(a.amount || 0),
            paymentType: a.paymentType || 'Cash',
            paymentReceived: a.paymentReceived || 'appuser',
          }))
        : (Number(invoice.advanceAmount || 0) > 0 ? [{ label: 'Advance 1', amount: Number(invoice.advanceAmount || 0), paymentType: 'Cash', paymentReceived: 'appuser' }] : []),
    });

    // Set selected customer and products when editing
    // Try to find customer by companyName OR customerName, case-insensitive
    const normalize = (s: string) => (s || "").toLowerCase().trim();
    const invoiceCustName = normalize(invoice.customerName);

    const customer = customers.find(
      (c) =>
        normalize(c.companyName) === invoiceCustName ||
        normalize(c.customerName) === invoiceCustName
    );

    if (customer) {
      setSelectedCustomer(customer);
      // Initialize with existing products from list
      setCustomerProducts(customer.products || []);

      // Fetch latest products to be sure
      fetch(`/api/customers/${customer._id}/products`)
        .then(res => res.json())
        .then(products => {
          if (Array.isArray(products)) {
            setCustomerProducts(products);
          }
        })
        .catch(err => console.error("Failed to fetch customer products", err));
    } else {
      // Fallback: If customer not found in list, we might want to alert or try fetching all customers?
      // For now, clear products to avoid confusion
      setSelectedCustomer(null);
      setCustomerProducts([]);
    }

    setIsSheetOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this invoice?")) {
      try {
        await dispatch(deleteInvoice(id)).unwrap();
        toast.success("Invoice deleted successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete invoice");
      }
    }
  };

  const handlePreview = (invoice: any) => {
    setPreviewInvoice(invoice);
    setIsPreviewOpen(true);
  };

  const handleDownloadPDF = async () => {
    if (previewInvoice) {
      toast.info("Preparing PDF for download...");
      try {
        // Get the invoice element
        const invoiceElement = document.getElementById("invoice-pdf");
        if (!invoiceElement) {
          throw new Error("Invoice element not found. Please try again.");
        }

        // Generate a filename based on invoice details
        const lrNo = previewInvoice.lrNo || 'INV';
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${lrNo}_${dateStr}`;

        // Generate and download the PDF
        await generateInvoicePDF(invoiceElement, filename);
        toast.success("PDF downloaded successfully");
      } catch (error: any) {
        console.error("PDF generation error:", error);

        // Provide more user-friendly error messages
        if (error.message && error.message.includes("unsupported color function")) {
          toast.error("PDF generation failed due to color formatting issues. Our team has been notified.");
        } else if (error.message && error.message.includes("Tainted canvases")) {
          toast.error("PDF generation failed due to security restrictions. Please ensure all content is from the same domain.");
        } else if (error.message && error.message.includes("Maximum call stack")) {
          toast.error("PDF generation failed due to complexity. Please try again with a simpler invoice.");
        } else {
          toast.error(error.message || "Failed to generate PDF. Please try again later.");
        }
      }
    } else {
      toast.error("No invoice selected for download");
    }
  };

  const handlePrintInvoice = async () => {
    try {
      printInvoiceElement();
    } catch (e: any) {
      toast.error(e?.message || "Failed to print invoice");
    }
  };

  const handleSheetClose = () => {
    setIsSheetOpen(false);
    setEditingInvoice(null);
    setSelectedCustomer(null);
    setCustomerProducts([]);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      from: "",
      to: "",
      taluka: "",
      dist: "",
      customerName: "",
      consignor: "",
      consignee: "",
      lrNo: "",
      remarks: "",
      bankId: undefined,
      status: "Unpaid",
      rows: [
        {
          product: "",
          truckNo: "",
          articles: "",
          weight: 0,
          rate: 0,
          total: 0,
          remarks: "",
        },
      ],
    });
  };

  const handleFilterChange = (field: string, value: string) => {
    const next = { ...filters, [field]: value } as any;
    setFilters(next);
    dispatch(fetchInvoices(next));
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      status: "all",
      customerName: "all",
      lrNo: "",
      fromDate: "",
      toDate: "",
      appUserId: "all",
      vehicleNo: "",
    };
    setFilters(defaultFilters);
    dispatch(
      fetchInvoices({
        page: 1,
        limit: pagination.limit,
        ...defaultFilters,
      })
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  // Format date as dd-mm-yy
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "default";
      case "Pending":
        return "secondary";
      case "Unpaid":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const totalInvoiceAmount = invoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0
  );
  const paidInvoices = invoices.filter(
    (invoice) => invoice.status === "Paid"
  ).length;
  const unpaidInvoices = invoices.filter(
    (invoice) => invoice.status === "Unpaid"
  ).length;

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-gray-600">Manage your transport invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadButton module="invoices" data={invoices} filters={filters} />
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button onClick={() => {
                setEditingInvoice(null);
                setSelectedCustomer(null);
                setCustomerProducts([]);
                setFormData({
                  date: new Date().toISOString().split("T")[0],
                  from: "",
                  to: "",
                  taluka: "",
                  dist: "",
                  customerName: "",
                  consignor: "",
                  consignee: "",
                  lrNo: "",
                  remarks: "",
                  bankId: undefined,
                  status: "Unpaid",
                  rows: [
                    {
                      product: "",
                      truckNo: "",
                      articles: "",
                      weight: 0,
                      rate: 0,
                      total: 0,
                      remarks: "",
                    },
                  ],
                });
                setIsSheetOpen(true);
              }}>
                <Plus className="w-4 h-4" />
                Create Invoice
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85%] overflow-y-auto p-6">
              <SheetHeader>
                <SheetTitle>
                  {editingInvoice ? "Edit Invoice" : "Create New Invoice"}
                </SheetTitle>
              </SheetHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="from">From *</Label>
                    <Input
                      id="from"
                      name="from"
                      value={formData.from}
                      onChange={handleInputChange}
                      placeholder="Origin location"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="to">To *</Label>
                    <Input
                      id="to"
                      name="to"
                      value={formData.to}
                      onChange={handleInputChange}
                      placeholder="Destination location"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="taluka">Taluka</Label>
                    <Input
                      id="taluka"
                      name="taluka"
                      value={formData.taluka}
                      onChange={handleInputChange}
                      placeholder="Taluka"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dist">District</Label>
                    <Input
                      id="dist"
                      name="dist"
                      value={formData.dist}
                      onChange={handleInputChange}
                      placeholder="District"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerName">Customer Name *</Label>
                    <Select
                      value={formData.customerName}
                      onValueChange={(value) =>
                        handleSelectChange("customerName", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2 sticky top-0 bg-white z-10" onPointerDown={(e) => e.stopPropagation()}>
                          <Input
                            placeholder="Search customer..."
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="h-8"
                          />
                        </div>
                        {customers
                          .filter((customer) => {
                            const query = customerSearch.toLowerCase();
                            if (!query) return true;
                            return (
                              customer.companyName.toLowerCase().includes(query) ||
                              customer.customerName?.toLowerCase().includes(query) ||
                              customer.mobileNo?.toLowerCase().includes(query)
                            );
                          })
                          .map((customer) => (
                            <SelectItem
                              key={customer._id}
                              value={customer.companyName}
                            >
                              {customer.companyName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) =>
                        handleSelectChange("status", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Unpaid">Unpaid</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="appUserId">App User</Label>
                    <Select
                      value={formData.appUserId || ""}
                      onValueChange={(value) => handleSelectChange("appUserId", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select app user" />
                      </SelectTrigger>
                      <SelectContent>
                        {appUsers?.map((u: any) => (
                          <SelectItem key={u._id} value={u._id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bankId">Bank</Label>
                    <Select
                      value={formData.bankId || ""}
                      onValueChange={(value) => handleSelectChange("bankId", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {banks
                          ?.filter((b: any) => !formData.appUserId || (typeof b.appUserId === 'string' ? b.appUserId : b.appUserId?._id) === formData.appUserId)
                          .map((b: any) => (
                          <SelectItem key={b._id} value={b._id}>
                            {b.bankName} - {b.accountNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="taxPercent">Tax Percent (%)</Label>
                    <Input
                      id="taxPercent"
                      name="taxPercent"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.taxPercent ?? ""}
                      onChange={handleInputChange}
                      placeholder="e.g., 18"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label>Advance Amounts</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const current = Array.isArray(formData.advanceAmounts) ? [...formData.advanceAmounts] : [];
                          current.push({ label: `Advance ${current.length + 1}`, amount: 0, paymentType: 'Cash', paymentReceived: 'appuser' });
                          setFormData(prev => ({
                            ...prev,
                            advanceAmounts: current,
                            advanceAmount: current.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
                          }));
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {Array.isArray(formData.advanceAmounts) && formData.advanceAmounts.length > 0 ? (
                      <div className="space-y-3">
                        {formData.advanceAmounts.map((adv, advIdx) => (
                          <div key={advIdx} className="p-3 border rounded-lg bg-gray-50 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-500 min-w-[20px]">#{advIdx + 1}</span>
                              <Input
                                className="flex-1"
                                placeholder="Label"
                                value={adv.label || ''}
                                onChange={(e) => {
                                  const current = [...(formData.advanceAmounts || [])];
                                  current[advIdx] = { ...current[advIdx], label: e.target.value };
                                  setFormData(prev => ({ ...prev, advanceAmounts: current }));
                                }}
                              />
                              <Input
                                type="number"
                                className="w-32"
                                placeholder="Amount"
                                min="0"
                                value={adv.amount || 0}
                                onChange={(e) => {
                                  const current = [...(formData.advanceAmounts || [])];
                                  current[advIdx] = { ...current[advIdx], amount: Number(e.target.value) || 0 };
                                  const total = current.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                                  setFormData(prev => ({ ...prev, advanceAmounts: current, advanceAmount: total }));
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                onClick={() => {
                                  const current = [...(formData.advanceAmounts || [])];
                                  current.splice(advIdx, 1);
                                  const total = current.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                                  setFormData(prev => ({ ...prev, advanceAmounts: current, advanceAmount: total || undefined }));
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                            <div>
                              <Label className="text-xs">Payment Type</Label>
                              <Select
                                value={adv.paymentType || 'Cash'}
                                onValueChange={(value) => {
                                  const current = [...(formData.advanceAmounts || [])];
                                  current[advIdx] = { ...current[advIdx], paymentType: value };
                                  setFormData(prev => ({ ...prev, advanceAmounts: current }));
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Payment type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Cash">Cash</SelectItem>
                                  <SelectItem value="UPI">UPI</SelectItem>
                                  <SelectItem value="Net Banking">Net Banking</SelectItem>
                                  <SelectItem value="Credit Card">Credit Card</SelectItem>
                                  <SelectItem value="Debit Card">Debit Card</SelectItem>
                                  <SelectItem value="Cheque">Cheque</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground font-medium">
                          Total Advance: ₹{formData.advanceAmounts.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No advance amounts. Click Add to add one.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="consignor">Consignor</Label>
                    <Input
                      id="consignor"
                      name="consignor"
                      value={formData.consignor}
                      onChange={handleInputChange}
                      placeholder="Consignor name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="consignee">Consignee</Label>
                    <Input
                      id="consignee"
                      name="consignee"
                      value={formData.consignee}
                      onChange={handleInputChange}
                      placeholder="Consignee name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lrNo">LR Number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="lrNo"
                        name="lrNo"
                        value={formData.lrNo}
                        onChange={handleInputChange}
                        placeholder="LR Number"
                      />
                      <Button
                        type="button"
                        onClick={generateLRNumber}
                        variant="outline"
                      >
                        Generate
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="remarks">Remarks</Label>
                    <Input
                      id="remarks"
                      name="remarks"
                      value={formData.remarks}
                      onChange={handleInputChange}
                      placeholder="Additional remarks"
                    />
                  </div>
                </div>

                {/* Invoice Rows */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <Label className="text-lg font-semibold">Invoice Items</Label>
                    <Button
                      type="button"
                      onClick={addRow}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Row
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product *</TableHead>
                          <TableHead>Truck No *</TableHead>
                          <TableHead>Chalan No.</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.rows.map((row, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Select
                                value={row.product}
                                onValueChange={(value) =>
                                  handleProductSelect(index, value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {customerProducts.map((product) => (
                                    <SelectItem
                                      key={product._id}
                                      value={product.productName}
                                    >
                                      {product.productName}
                                    </SelectItem>
                                  ))}
                                  {customerProducts.length === 0 && (
                                    <SelectItem value="no-products" disabled>
                                      {selectedCustomer
                                        ? "No products available"
                                        : "Select customer first"}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={row.truckNo}
                                onValueChange={(value) =>
                                  handleRowChange(index, "truckNo", value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                                <SelectContent>
                                  <div className="p-2 sticky top-0 bg-white z-10" onPointerDown={(e) => e.stopPropagation()}>
                                    <Input
                                      placeholder="Search vehicle..."
                                      value={vehicleSearch}
                                      onChange={(e) => setVehicleSearch(e.target.value)}
                                      onKeyDown={(e) => e.stopPropagation()}
                                      className="h-8"
                                    />
                                  </div>
                                  {vehicles
                                    .filter((vehicle) => {
                                      const query = vehicleSearch.toLowerCase();
                                      if (!query) return true;
                                      return (
                                        vehicle.registrationNumber.toLowerCase().includes(query) ||
                                        vehicle.vehicleType?.toLowerCase().includes(query)
                                      );
                                    })
                                    .map((vehicle) => (
                                      <SelectItem
                                        key={vehicle._id}
                                        value={vehicle.registrationNumber}
                                      >
                                        {vehicle.registrationNumber}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.articles}
                                onChange={(e) =>
                                  handleRowChange(
                                    index,
                                    "articles",
                                    e.target.value
                                  )
                                }
                                placeholder="Chalan No."
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={row.weight}
                                onChange={(e) =>
                                  handleRowChange(
                                    index,
                                    "weight",
                                    Number(e.target.value)
                                  )
                                }
                                placeholder="Weight"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={row.rate?.toString() || ""}
                                onValueChange={(value) =>
                                  handleRowChange(index, "rate", Number(value))
                                }>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select rate" />
                                </SelectTrigger>
                                <SelectContent>
                                  {customerProducts.map((product) => (
                                    <SelectItem
                                      key={product._id}
                                      value={product.productRate.toString()}
                                    >
                                      ₹{product.productRate}
                                    </SelectItem>
                                  ))}
                                  {customerProducts.length === 0 && (
                                    <SelectItem value="no-rate" disabled>
                                      {selectedCustomer
                                        ? "No rates available"
                                        : "Select customer first"}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={row.total}
                                readOnly
                                className="bg-gray-50"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.remarks}
                                onChange={(e) =>
                                  handleRowChange(
                                    index,
                                    "remarks",
                                    e.target.value
                                  )
                                }
                                placeholder="Remarks"
                              />
                            </TableCell>
                            <TableCell>
                              {formData.rows.length > 1 && (
                                <Button
                                  type="button"
                                  onClick={() => removeRow(index)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Tax Percentage (Optional) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="taxPercent">Tax Percentage (%)</Label>
                    <Input
                      id="taxPercent"
                      name="taxPercent"
                      type="number"
                      value={(formData as any).taxPercent ?? ""}
                      onChange={handleInputChange}
                      placeholder="e.g. 18"
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSheetClose}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading
                      ? "Saving..."
                      : editingInvoice
                        ? "Update Invoice"
                        : "Create Invoice"}
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Invoices
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoices.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalInvoiceAmount)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {paidInvoices}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Unpaid Invoices
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {unpaidInvoices}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="statusFilter">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => handleFilterChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Unpaid">Unpaid</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="customerFilter">Customer</Label>
              <Select
                value={filters.customerName}
                onValueChange={(value) =>
                  handleFilterChange("customerName", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 sticky top-0 bg-white z-10">
                    <Input
                      placeholder="Search customer..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers
                    .filter((customer) =>
                      customer.companyName.toLowerCase().includes(customerSearch.toLowerCase())
                    )
                    .map((customer) => (
                      <SelectItem key={customer._id} value={customer.companyName}>
                        {customer.companyName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="lrNoFilter">LR Number</Label>
              <Input
                id="lrNoFilter"
                value={filters.lrNo}
                onChange={(e) => handleFilterChange("lrNo", e.target.value)}
                placeholder="Search by LR number"
              />
            </div>

            <div>
              <Label htmlFor="fromDateFilter">From Date</Label>
              <Input
                id="fromDateFilter"
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="toDateFilter">To Date</Label>
              <Input
                id="toDateFilter"
                type="date"
                value={filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="appUserFilter">App User</Label>
              <Select
                value={filters.appUserId}
                onValueChange={(value) => handleFilterChange("appUserId", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All App Users</SelectItem>
                  {appUsers?.map((u: any) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="vehicleNoFilter">Vehicle No</Label>
              <Select
                value={filters.vehicleNo}
                onValueChange={(value) => handleFilterChange("vehicleNo", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 sticky top-0 bg-white z-10">
                    <Input
                      placeholder="Search vehicle..."
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {vehicles
                    .filter((v: any) =>
                      v.registrationNumber &&
                      v.registrationNumber.toLowerCase().includes(vehicleSearch.toLowerCase())
                    )
                    .map((vehicle: any) => (
                      <SelectItem key={vehicle._id} value={vehicle.registrationNumber}>
                        {vehicle.registrationNumber}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="secondary" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No invoices found. Create your first invoice.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Bulk Actions Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="text-sm text-muted-foreground flex items-center gap-4">
                  <span>Selected: {selectedInvoiceIds.length}</span>
                  {selectedInvoiceIds.length > 0 && (
                    <span className="font-medium text-black">
                      Total Amount: {formatCurrency(
                        invoices
                          .filter((inv: any) => selectedInvoiceIds.includes(inv._id))
                          .reduce((sum: number, invoice: any) => {
                            return sum + (typeof invoice.remainingAmount === "number"
                              ? invoice.remainingAmount
                              : Math.max(0, (invoice.total || 0) - (invoice.advanceAmount || 0)));
                          }, 0)
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="bulkAppUser">App User</Label>
                    <Select
                      value={selectedBulkAppUserId}
                      onValueChange={(v) => setSelectedBulkAppUserId(v)}
                    >
                      <SelectTrigger id="bulkAppUser" className="w-56">
                        <SelectValue placeholder="Select app user" />
                      </SelectTrigger>
                      <SelectContent>
                        {appUsers?.map((u: any) => (
                          <SelectItem key={u._id} value={u._id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="bulkBank">Bank</Label>
                    <Select
                      value={selectedBankId}
                      onValueChange={(v) => setSelectedBankId(v)}
                      disabled={!selectedBulkAppUserId}
                    >
                      <SelectTrigger id="bulkBank" className="w-56">
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {banks
                          ?.filter(
                            (b: any) => b?.appUserId?._id === selectedBulkAppUserId
                          )
                          .map((b: any) => (
                            <SelectItem key={b._id} value={b._id}>
                              {b.bankName} ({b.accountNumber})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="lumpsumAmount">Lumpsum Amount</Label>
                    <Input
                      id="lumpsumAmount"
                      type="number"
                      placeholder="Optional"
                      value={lumpsumAmount}
                      onChange={(e) => setLumpsumAmount(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={selectedInvoiceIds.length === 0}
                      onClick={() => handleBulkSetStatus("Unpaid")}
                    >
                      Set Unpaid
                    </Button>
                    <Button
                      variant="default"
                      disabled={
                        selectedInvoiceIds.length === 0 ||
                        !selectedBulkAppUserId ||
                        !selectedBankId
                      }
                      onClick={() => handleBulkSetStatus("Paid")}
                    >
                      Set Paid
                    </Button>
                    <Button
                      variant="outline"
                      disabled={selectedInvoiceIds.length === 0}
                      onClick={handleBulkPrint}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print Selected
                    </Button>
                    <Button
                      variant="outline"
                      disabled={selectedInvoiceIds.length === 0}
                      onClick={() => setSelectedInvoiceIds([])}
                    >
                      Clear Selection
                    </Button>
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={
                          invoices.length === 0
                            ? false
                            : invoices.every((i: any) => selectedInvoiceIds.includes(i._id))
                              ? true
                              : invoices.some((i: any) => selectedInvoiceIds.includes(i._id))
                                ? "indeterminate"
                                : false
                        }
                        onCheckedChange={(checked) =>
                          handleToggleSelectAll(Boolean(checked))
                        }
                        aria-label="Select all invoices"
                      />
                    </TableHead>
                    <TableHead>LR No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Truck No</TableHead>
                    <TableHead>From - To</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice._id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedInvoiceIds.includes(invoice._id)}
                          onCheckedChange={(checked) =>
                            handleToggleSelectRow(invoice._id, Boolean(checked))
                          }
                          aria-label={`Select invoice ${invoice.lrNo}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {invoice.lrNo}
                      </TableCell>
                      <TableCell>
                        {formatDate(invoice.date)}
                      </TableCell>
                      <TableCell>{invoice.customerName}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {invoice.rows?.[0]?.truckNo || "-"}
                          {invoice.rows?.length > 1 && (
                            <span className="text-gray-400"> +{invoice.rows.length - 1}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{invoice.from.split(' -> ')[0]}</div>
                          <div className="text-gray-500">to {invoice.to}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {formatCurrency(invoice.total)}
                          </div>
                          <div className="text-gray-500">
                            Adv: {formatCurrency(
                              typeof invoice.advanceAmount === "number"
                                ? invoice.advanceAmount
                                : 0
                            )}
                          </div>
                          <div className="text-gray-500">
                            Remaining: {formatCurrency(
                              typeof invoice.remainingAmount === "number"
                                ? invoice.remainingAmount
                                : Math.max(
                                  0,
                                  (invoice.total || 0) -
                                  (invoice.advanceAmount || 0)
                                )
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(invoice)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(invoice)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(invoice._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invoices.length > 0 && (
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.pages}
                  totalItems={pagination.total}
                  itemsPerPage={pagination.limit}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleLimitChange}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="w-[60vw] h-[100vh] max-w-[calc(60vw-2rem)] sm:max-w-[calc(60vw-2rem)] md:max-w-[calc(100vw-2rem)] lg:max-w-[calc(100vw-2rem)] xl:max-w-[calc(100vw-2rem)] 2xl:max-w-[calc(100vw-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Review your invoice before downloading
            </DialogDescription>
          </DialogHeader>
          {previewInvoice && (
            <div className="relative w-full h-[calc(100vh-120px)]" ref={previewContainerRef}>
              <div
                className="inline-block p-2 bg-white border rounded-lg"
                ref={invoiceContentRef}
                style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", minHeight: "100%", marginBottom: "8px" }}
              >
                {/* Invoice Header */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-red-600">
                      {previewEffectiveAppUser?.name || "_________"}
                    </h2>
                    <p className="text-sm">
                      {!shouldHideCommissionLine && (
                        <>Transport Contractor,</>
                      )}
                      Commission Agent
                    </p>
                    <p className="text-sm">
                      <strong>GSTIN:</strong> {previewEffectiveAppUser?.gstin || "_________"}
                    </p>
                    <p className="text-sm">
                      <strong>Address:</strong>{" "}
                      {previewEffectiveAppUser?.address
                        ? previewEffectiveAppUser.address
                        : "Near Bombay Restaurant, Gorakhpur-Pirwadi, NH-4, Satara."}
                    </p>
                    <p className="text-sm">Email: rdsTransport5192@gmail.com</p>
                    <p className="text-sm">9604047861 / 9765000068</p>
                  </div>
                  <div className="text-right">
                    <p>
                      <strong>Date:</strong>{" "}
                      {formatDate(previewInvoice.date)}
                    </p>
                    <p>
                      <strong>From:</strong> {previewInvoice.from.split(' -> ')[0]}
                    </p>
                    <p>
                      <strong>To:</strong> {previewInvoice.to}
                    </p>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="mb-6">
                  <p>
                    <strong>Company Name:</strong> {previewInvoice.customerName}
                  </p>
                  <p>
                    <strong>Customer GSTIN:</strong> {matchedCustomer?.gstin || "_________"}
                  </p>
                  <p>
                    <strong>Customer Address:</strong> {matchedCustomer?.address || "_________"}
                  </p>
                  <p>
                    <strong>Consignor:</strong> {previewInvoice.consignor}
                  </p>
                  <p>
                    <strong>Consignee:</strong> {previewInvoice.consignee}
                  </p>
                  <p>
                    <strong>L.R. No.:</strong> {previewInvoice.lrNo}
                  </p>
                </div>

                {/* Items Table */}
                <Table className="mb-6">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product said to Contain</TableHead>
                      <TableHead>Truck No.</TableHead>
                      <TableHead>Chalan No.</TableHead>
                      <TableHead>Weight/M.T.</TableHead>
                      <TableHead>Rate/PMT ₹</TableHead>
                      <TableHead>CGST/SGST</TableHead>
                      <TableHead>₹</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const baseTotal = (previewInvoice.rows || []).reduce(
                        (sum: number, r: any) => sum + (r?.total || 0),
                        0
                      );
                      const percent =
                        typeof previewInvoice.taxPercent === "number"
                          ? previewInvoice.taxPercent
                          : 0;
                      const invoiceTaxAmount =
                        typeof previewInvoice.taxAmount === "number"
                          ? previewInvoice.taxAmount
                          : percent > 0
                            ? (baseTotal * percent) / 100
                            : 0;

                      return previewInvoice.rows.map((row: any, index: number) => {
                        const rowTotal = Number(row?.total || 0);
                        const perRowTax = percent > 0
                          ? (rowTotal * percent) / 100
                          : baseTotal > 0
                            ? (invoiceTaxAmount * (rowTotal / baseTotal))
                            : 0;
                        return (
                          <TableRow key={index}>
                            <TableCell>{row.product}</TableCell>
                            <TableCell>{row.truckNo}</TableCell>
                            <TableCell>{row.articles}</TableCell>
                            <TableCell>{row.weight}</TableCell>
                            <TableCell>{row.rate}</TableCell>
                            <TableCell>₹{perRowTax.toFixed(2)}</TableCell>
                            <TableCell>₹{rowTotal.toFixed(2)}</TableCell>
                            <TableCell>{row.remarks}</TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>

                {/* Total */}
                <div className="mb-6">
                  {(() => {
                    const baseTotal = (previewInvoice.rows || []).reduce(
                      (sum: number, row: any) => sum + (row?.total || 0),
                      0
                    );
                    const percent =
                      typeof previewInvoice.taxPercent === "number"
                        ? previewInvoice.taxPercent
                        : 0;
                    const taxAmount =
                      typeof previewInvoice.taxAmount === "number"
                        ? previewInvoice.taxAmount
                        : percent > 0
                          ? (baseTotal * percent) / 100
                          : 0;
                    
                    // Check if this is a consolidated invoice and calculate total advance from rows
                    let totalAdvanceFromRows = 0;
                    let isConsolidatedInvoice = false;
                    
                    (previewInvoice.rows || []).forEach((row: any) => {
                      const productName = row.product || '';
                      if (productName.includes('Advance: ₹')) {
                        isConsolidatedInvoice = true;
                        const advanceMatch = productName.match(/Advance:\s*₹([\d,]+)/);
                        if (advanceMatch) {
                          const advanceValue = parseFloat(advanceMatch[1].replace(/,/g, ''));
                          totalAdvanceFromRows += advanceValue;
                        }
                      }
                    });
                    
                    const advanceAmount = typeof previewInvoice.advanceAmount === "number" ? previewInvoice.advanceAmount : 0;
                    const totalWithTax = typeof previewInvoice.total === "number" ? previewInvoice.total : (baseTotal + taxAmount);
                    
                    // Calculate balance and total remaining
                    let balance, totalRemaining;
                    if (isConsolidatedInvoice) {
                      // For consolidated: Balance = Total Advance + Lumpsum Amount
                      balance = totalAdvanceFromRows + advanceAmount;
                      // Total Remaining = Total - Balance
                      totalRemaining = Math.max(0, totalWithTax - balance);
                    } else {
                      // For regular invoices
                      balance = typeof previewInvoice.remainingAmount === "number"
                        ? previewInvoice.remainingAmount
                        : Math.max(0, totalWithTax - advanceAmount);
                      totalRemaining = totalWithTax;
                    }
                    
                    return (
                      <div className="mb-2">
                        <p className="text-sm text-gray-600">
                          TAX PERCENTAGE: {percent}%
                        </p>
                        <p className="text-sm text-gray-600">
                          TAX AMOUNT: ₹ {taxAmount}
                        </p>
                      </div>
                    );
                  })()}
                  <p>
                    <strong>TOTAL: ₹ {previewInvoice.total}</strong>
                  </p>
                  {(() => {
                    // Calculate for display
                    let totalAdvanceFromRows = 0;
                    let isConsolidatedInvoice = false;
                    
                    (previewInvoice.rows || []).forEach((row: any) => {
                      const productName = row.product || '';
                      if (productName.includes('Advance: ₹')) {
                        isConsolidatedInvoice = true;
                        const advanceMatch = productName.match(/Advance:\s*₹([\d,]+)/);
                        if (advanceMatch) {
                          const advanceValue = parseFloat(advanceMatch[1].replace(/,/g, ''));
                          totalAdvanceFromRows += advanceValue;
                        }
                      }
                    });
                    
                    const advanceAmount = typeof previewInvoice.advanceAmount === "number" ? previewInvoice.advanceAmount : 0;
                    const totalWithTax = typeof previewInvoice.total === "number" ? previewInvoice.total : 0;
                    
                    let balance, totalRemaining;
                    if (isConsolidatedInvoice) {
                      balance = totalAdvanceFromRows + advanceAmount;
                      totalRemaining = Math.max(0, totalWithTax - balance);
                    } else {
                      balance = typeof previewInvoice.remainingAmount === "number"
                        ? previewInvoice.remainingAmount
                        : Math.max(0, totalWithTax - advanceAmount);
                      totalRemaining = totalWithTax;
                    }
                    
                    return (
                      <>
                        {isConsolidatedInvoice && totalAdvanceFromRows > 0 && (
                          <p className="text-sm text-gray-600">
                            TOTAL ADVANCE: ₹ {totalAdvanceFromRows.toFixed(0)}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          {isConsolidatedInvoice ? 'LUMPSUM AMOUNT' : 'ADVANCE'}: ₹ {advanceAmount}
                        </p>
                        <p className="text-sm text-gray-600">
                          BALANCE: ₹ {balance}
                        </p>
                        {isConsolidatedInvoice && (
                          <p className="text-sm text-gray-600 font-semibold">
                            TOTAL REMAINING: ₹ {totalRemaining}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t border-dashed border-gray-300">
                  <div className="mb-4">
                    <p className="text-sm font-bold mb-1">Bank Details:</p>
                    <p className="text-xs"><strong>Bank Name:</strong> {previewEffectiveBank?.bankName?.includes('-') ? previewEffectiveBank.bankName.split('-').pop()?.trim() : previewEffectiveBank?.bankName || "_________"}</p>
                    <p className="text-xs"><strong>A/C No:</strong> {previewEffectiveBank?.accountNumber || "_________"}</p>
                    <p className="text-xs"><strong>IFSC Code:</strong> {previewEffectiveBank?.ifscCode || "_________"}</p>
                    <p className="text-xs"><strong>PAN No:</strong> {previewPanNo}</p>
                  </div>
                  <div className="flex justify-between items-end mt-5">
                    <div>
                      <p className="text-xs">This is a Computer Generated Invoice</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="text-xs mb-1">Subject to Satara Jurisdiction</p>
                      <div className="inline-block text-center mt-1">
                        <p className="text-[10px] font-bold mb-1">for {previewEffectiveAppUser?.name || "_________"}</p>
                        
                        <div className="relative flex items-center justify-center gap-2 border border-gray-400 rounded p-1.5 px-3">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
                            <svg width="60" height="60" viewBox="0 0 100 100">
                              <path d="M 30 80 Q 50 10 80 50 Q 60 90 20 60 Q 10 30 50 20" fill="none" stroke="red" strokeWidth="4" />
                              <path d="M 40 40 L 60 40 L 50 60 Z" fill="red" />
                            </svg>
                          </div>
                          
                          <div className="font-serif text-base leading-none text-left">
                            {previewSignatureFirstName}{previewSignatureLastName ? <><br />{previewSignatureLastName}</> : null}
                          </div>
                          <div className="font-sans text-[7px] leading-tight text-left">
                            Digitally signed by {previewSignatureName}<br />
                            DN: cn={previewSignatureName}<br />
                            Date: {currentDateTimeStr}<br />
                            Valid #{previewUniqueSigId}
                          </div>
                        </div>
                        
                        <p className="text-[9px] mt-1">Authorised Signatory</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={handlePrintInvoice}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Invoice
                  </Button>
                  <Button onClick={handleDownloadPDF}>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>

              {/* Hidden PDF component for generation */}
              <div
                style={{
                  position: "absolute",
                  left: "-9999px",
                  top: "-9999px",
                }}
              >
                <InvoicePDF invoice={previewInvoice} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Bulk Print Container */}
      <div
        id="bulk-invoice-pdf"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
        }}
      >
        {bulkPrintInvoices.map((inv, index) => (
          <div key={inv._id} className="bulk-invoice-item" style={{ 
            marginBottom: "15px", 
            borderBottom: "1px dashed #ccc", 
            paddingBottom: "15px"
          }}>
            <InvoicePDF invoice={inv} />
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default InvoicesPage;
