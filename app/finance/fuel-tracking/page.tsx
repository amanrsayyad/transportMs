"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as z from "zod";
import { RootState, AppDispatch } from '@/lib/redux/store';
import {
  fetchFuelTrackings,
  createFuelTracking,
  createFuelQuickAdd,
  updateFuelTracking,
  deleteFuelTracking,
  clearError,
  FuelTrackingCreateData,
  FuelTracking
} from '@/lib/redux/slices/operationsSlice';
import { fetchBanks } from '@/lib/redux/slices/bankSlice';
import { fetchAppUsers } from '@/lib/redux/slices/appUserSlice';
import { fetchVehicles } from '@/lib/redux/slices/vehicleSlice';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import Pagination from '@/components/common/Pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Plus, Fuel, TrendingUp, Calendar, DollarSign, Edit, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { DownloadButton } from '@/components/common/DownloadButton';
import { FormDialog } from '@/components/common/FormDialog';
import { ViewDialog } from '@/components/common/ViewDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Zod schema for fuel tracking validation
const fuelTrackingSchema = z.object({
  appUserId: z.string().min(1, "App user is required"),
  bankId: z.string().min(1, "Bank account is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  startKm: z.number().min(0, "Start KM must be positive"),
  endKm: z.number().min(0, "End KM must be positive"),
  fuelQuantity: z.number().min(0.1, "Fuel quantity must be greater than 0"),
  // Helper field to track incremental fuel added; optional and non-negative
  addFuelQuantity: z.number().min(0, "Add fuel quantity cannot be negative").optional(),
  // Helper field for remaining/previous fuel
  remainingFuelQuantity: z.number().optional(),
  fuelRate: z.number().min(0.1, "Fuel rate must be greater than 0"),
  totalAmount: z.number().min(0, "Total amount must be positive").optional(),
  truckAverage: z.number().optional(),
  date: z.string().min(1, "Date is required"),
  description: z.string().optional(),
  paymentType: z.string().min(1, "Payment type is required"),
});

// Field configuration for FormDialog
const fuelTrackingFields = [
  {
    name: "appUserId",
    label: "App User",
    type: "select" as const,
    placeholder: "Select app user",
    required: true,
  },
  {
    name: "bankId",
    label: "Bank Account",
    type: "select" as const,
    placeholder: "Select bank account",
    required: true,
  },
  {
    name: "vehicleId",
    label: "Vehicle",
    type: "select" as const,
    placeholder: "Select vehicle",
    required: true,
  },
  {
    name: "startKm",
    label: "Start KM",
    type: "number" as const,
    placeholder: "Enter start KM",
    required: true,
  },
  {
    name: "endKm",
    label: "End KM",
    type: "number" as const,
    placeholder: "Enter end KM",
    required: true,
  },
  {
    name: "fuelQuantity",
    label: "Fuel Quantity (L)",
    type: "number" as const,
    placeholder: "Enter fuel quantity",
    required: true,
  },
  {
    name: "fuelRate",
    label: "Fuel Rate (per L)",
    type: "number" as const,
    placeholder: "Enter fuel rate",
    required: true,
  },
  {
    name: "date",
    label: "Date",
    type: "date" as const,
    placeholder: "Select date",
    required: true,
  },
  {
    name: "paymentType",
    label: "Payment Type",
    type: "select" as const,
    placeholder: "Select payment type",
    options: [
      { value: "Cash", label: "Cash" },
      { value: "UPI", label: "UPI" },
      { value: "Net Banking", label: "Net Banking" },
      { value: "Credit Card", label: "Credit Card" },
      { value: "Debit Card", label: "Debit Card" },
      { value: "Cheque", label: "Cheque" },
    ],
    required: true,
  },
  {
    name: "description",
    label: "Description",
    type: "textarea" as const,
    placeholder: "Enter description (optional)",
    required: false,
  },
];

// Default values for the form
const defaultValues = {
  appUserId: "",
  bankId: "",
  vehicleId: "",
  startKm: 0,
  endKm: 0,
  fuelQuantity: 0,
  addFuelQuantity: 0,
  fuelRate: 0,
  date: new Date().toISOString().split('T')[0],
  description: "",
  paymentType: "",
};

// FuelTrackingFormData interface removed - FormDialog uses Zod schema types

const FuelTrackingManagement = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { fuelTrackings, fuelTrackingsPagination, loading, error } = useSelector((state: RootState) => state.operations);
  const { banks } = useSelector((state: RootState) => state.banks);
  const { appUsers } = useSelector((state: RootState) => state.appUsers);
  const { vehicles } = useSelector((state: RootState) => state.vehicles);

  // State for dynamic field management
  const [selectedAppUserId, setSelectedAppUserId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [dynamicStartKm, setDynamicStartKm] = useState<number>(0);
  const [previousFuelQuantity, setPreviousFuelQuantity] = useState<number>(0);
  const [previousFuelRecordQuantity, setPreviousFuelRecordQuantity] = useState<number>(0);
  const [quickAddFuelQuantity, setQuickAddFuelQuantity] = useState<number>(0);
  // Ref to give onChangeEffect closures access to latest quickAddFuelQuantity without stale closure
  const quickAddFuelQuantityRef = useRef<number>(0);
  const [startKmSource, setStartKmSource] = useState<'fuel' | 'trip' | null>(null);
  const [computedAverage, setComputedAverage] = useState<number | null>(null);
  const [computedTotalAmount, setComputedTotalAmount] = useState<number | null>(null);
  const [computedQuickTotalAmount, setComputedQuickTotalAmount] = useState<number | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState<string>("");

  // State for editing functionality
  const [editingRecord, setEditingRecord] = useState<FuelTracking | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [quickAddRecordsByVehicle, setQuickAddRecordsByVehicle] = useState<Record<string, { fuelQuantity: number; date: string }[]>>({});

  // FormDialog will handle its own state management

  // Payment types array
  const paymentTypes = ['Cash', 'UPI', 'Net Banking', 'Credit Card', 'Debit Card', 'Cheque'];

  // Quick Fuel Add schema and fields (vehicle + quantity only)
  const quickFuelAddSchema = z.object({
    appUserId: z.string().min(1, 'App user is required'),
    bankId: z.string().min(1, 'Bank account is required'),
    vehicleId: z.string().min(1, 'Vehicle is required'),
    fuelQuantity: z.number().min(0.1, 'Fuel quantity must be greater than 0'),
    fuelRate: z.number().min(0.1, 'Fuel rate must be greater than 0'),
  });

  const getQuickFuelAddFields = () => ([
    {
      name: 'appUserId',
      label: 'App User',
      type: 'select' as const,
      placeholder: 'Select app user',
      required: true,
      options: appUsers.map(user => ({
        value: user._id,
        label: user.name
      })),
    },
    {
      name: 'bankId',
      label: 'Bank Account',
      type: 'select' as const,
      placeholder: 'Select bank account',
      required: true,
      options: (selectedAppUserId ? getUserBanks(selectedAppUserId) : getActiveBanks()).map(bank => ({
        value: bank._id,
        label: `${bank.bankName} - ${bank.accountNumber} (${formatCurrency(bank.balance)})`
      })),
    },
    {
      name: 'vehicleId',
      label: 'Vehicle',
      type: 'select' as const,
      placeholder: 'Select vehicle',
      required: true,
      searchable: true,
      searchPlaceholder: 'Search...',
      options: vehicles.map(vehicle => ({
        value: vehicle._id,
        label: `${vehicle.registrationNumber} (${vehicle.vehicleType} ${vehicle.vehicleWeight}kg)`
      })),
    },
    {
      name: 'previousFuelQuantityInfo',
      label: 'Previous Fuel Quantity',
      type: 'info' as const,
      value:
        previousFuelRecordQuantity > 0
          ? `${previousFuelRecordQuantity.toFixed(2)} L from the latest fuel record`
          : 'No previous fuel quantity for this vehicle',
      required: false,
    },
    {
      name: 'fuelQuantity',
      label: 'Fuel Quantity (L)',
      type: 'number' as const,
      placeholder: 'Enter fuel quantity',
      required: true,
    },
    {
      name: 'fuelRate',
      label: 'Fuel Rate (per L)',
      type: 'number' as const,
      placeholder: 'Enter fuel rate',
      required: true,
    },
    {
      name: 'quickComputedTotalAmountInfo',
      label: 'Total Amount',
      type: 'info' as const,
      value:
        computedQuickTotalAmount && computedQuickTotalAmount > 0
          ? `${formatCurrency(computedQuickTotalAmount)} = fuel qty × fuel rate`
          : 'Total appears after entering fuel quantity and rate',
      required: false,
    },
  ]);

  const quickDefaultValues = {
    appUserId: selectedAppUserId || '',
    bankId: '',
    vehicleId: selectedVehicleId || '',
    fuelQuantity: 0,
    fuelRate: 0,
  };

  useEffect(() => {
    dispatch(fetchFuelTrackings({ page: fuelTrackingsPagination.page, limit: fuelTrackingsPagination.limit }));
    dispatch(fetchBanks());
    dispatch(fetchAppUsers());
    dispatch(fetchVehicles());
  }, [dispatch, fuelTrackingsPagination.page, fuelTrackingsPagination.limit]);

  const handlePageChange = (page: number) => {
    dispatch(fetchFuelTrackings({ page, limit: fuelTrackingsPagination.limit }));
  };

  // Load quick-add records for a vehicle (invoked when opening the view dialog)
  const loadQuickAdds = async (vehicleId: string) => {
    try {
      const res = await fetch(`/api/fuel-tracking/quick-add?vehicleId=${vehicleId}&limit=50`);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : [];
        setQuickAddRecordsByVehicle(prev => ({ ...prev, [vehicleId]: items }));
      } else {
        setQuickAddRecordsByVehicle(prev => ({ ...prev, [vehicleId]: [] }));
      }
    } catch (e) {
      setQuickAddRecordsByVehicle(prev => ({ ...prev, [vehicleId]: [] }));
    }
  };

  // Build dialog fields to show quick-add quantities and dates
  const getQuickAddFields = (vehicleId: string) => {
    const items = quickAddRecordsByVehicle[vehicleId] || [];
    if (!items.length) {
      return [
        { label: 'Quick Adds', value: 'No quick fuel adds found' },
      ];
    }
    // Show up to the latest 10 quick adds
    const latest = items.slice(-10).reverse();
    const fields: any[] = [];
    latest.forEach((item: any, idx: number) => {
      const qty = Number(item?.fuelQuantity) || 0;
      const dateVal = item?.date;
      fields.push({ label: `Fuel Add #${idx + 1}`, value: `${qty.toFixed(2)} L` });
      fields.push({ label: 'Date', value: dateVal, type: 'date' });
    });
    return fields;
  };

  // Handle field changes for dynamic updates
  const handleFieldChange = async (fieldName: string, value: any, currentValues: Record<string, any>) => {
    if (fieldName === 'appUserId') {
      setSelectedAppUserId(value);
      // Reset bankId when app user changes to force user to select a new bank
      // This will be handled by the form itself through field regeneration
    }

    // Recalculate quick-add total when quick fuel quantity or rate changes
    if (fieldName === 'fuelQuantity' || fieldName === 'fuelRate') {
      const qty = fieldName === 'fuelQuantity'
        ? Number(value) || 0
        : Number((currentValues && (currentValues as any).fuelQuantity) ?? 0) || 0;
      const rate = fieldName === 'fuelRate'
        ? Number(value) || 0
        : Number((currentValues && (currentValues as any).fuelRate) ?? 0) || 0;
      if (qty > 0 && rate > 0) {
        setComputedQuickTotalAmount(qty * rate);
      } else {
        setComputedQuickTotalAmount(null);
      }
    }

    if (fieldName === 'vehicleId') {
      setSelectedVehicleId(value);

      // Fetch latest trip, fuel tracking, and quick-adds to determine start KM and carry-forward
      try {
        const [tripResponse, fuelResponse, quickResponse] = await Promise.all([
          fetch(`/api/trips/latest/${value}`),
          fetch(`/api/fuel-tracking/latest/${value}`),
          fetch(`/api/fuel-tracking/quick-add?vehicleId=${value}`)
        ]);

        let tripStartKm = 0;
        if (tripResponse.ok) {
          const latestTrip = await tripResponse.json();
          tripStartKm = Number(latestTrip.startKm ?? 0) || 0;
        }

        let fuelEndKm = 0;
        let prevFuelQty = 0;
        let pendingQuickQty = 0;
        if (fuelResponse.ok) {
          const latestFuelRecord = await fuelResponse.json();
          fuelEndKm = Number(latestFuelRecord.endKm ?? 0) || 0;
          prevFuelQty = Number(latestFuelRecord.fuelQuantity ?? 0) || 0;
          pendingQuickQty = Number(latestFuelRecord.pendingQuickFuelQty ?? 0) || 0;
        }

        // We still fetch quickResponse to populate the Quick Adds dialog (view history)
        let totalQuickAddedEver = 0;
        if (quickResponse.ok) {
          const quickData = await quickResponse.json();
          const items = Array.isArray(quickData?.data) ? quickData.data : [];
          totalQuickAddedEver = items.reduce((sum: number, item: any) => sum + (Number(item?.fuelQuantity) || 0), 0);
        }

        // Decide the start KM: prioritize previous fuel tracking end KM, fallback to previous trip start KM
        if (fuelEndKm > 0) {
          setDynamicStartKm(fuelEndKm);
          setStartKmSource('fuel');
        } else if (tripStartKm > 0) {
          setDynamicStartKm(tripStartKm);
          setStartKmSource('trip');
        } else {
          setDynamicStartKm(0);
          setStartKmSource(null);
        }

        // `prevFuelQty` from the latest fuel record already includes quick-add quantities
        // because `POST /quick-add` does `$inc: { fuelQuantity: qty }` on the latest record.
        setPreviousFuelQuantity(prevFuelQty);
        setPreviousFuelRecordQuantity(Math.max(0, prevFuelQty - pendingQuickQty));
        setQuickAddFuelQuantity(pendingQuickQty);
        quickAddFuelQuantityRef.current = pendingQuickQty;
      } catch (error) {
        console.error('Error fetching latest trip, fuel or quick adds:', error);
        setDynamicStartKm(0);
        setStartKmSource(null);
        setPreviousFuelQuantity(0);
        setPreviousFuelRecordQuantity(0);
        setQuickAddFuelQuantity(0);
      }
    }

    // Recalculate average when startKm, endKm, or addFuelQuantity changes (use add fuel only)
    if (fieldName === 'startKm' || fieldName === 'endKm' || fieldName === 'addFuelQuantity') {
      const start = fieldName === 'startKm'
        ? Number(value)
        : Number((currentValues && currentValues.startKm) ?? dynamicStartKm);
      const end = fieldName === 'endKm'
        ? Number(value)
        : Number((currentValues && currentValues.endKm) ?? 0);
      const addedQty = fieldName === 'addFuelQuantity'
        ? Number(value) || 0
        : Number((currentValues && (currentValues as any).addFuelQuantity) ?? 0);
      const effectiveFuelUsed = addedQty + (Number(quickAddFuelQuantity) || 0);
      if (effectiveFuelUsed > 0 && end > start) {
        setComputedAverage((end - start) / effectiveFuelUsed);
      } else {
        setComputedAverage(null);
      }
    }

    // Recalculate total amount when addFuelQuantity or fuelRate changes (use add fuel only)
    if (fieldName === 'addFuelQuantity' || fieldName === 'fuelRate') {
      const addedQty = fieldName === 'addFuelQuantity'
        ? Number(value) || 0
        : Number((currentValues && (currentValues as any).addFuelQuantity) ?? 0) || 0;
      const rate = fieldName === 'fuelRate'
        ? Number(value) || 0
        : Number((currentValues && currentValues.fuelRate) ?? 0) || 0;
      if (addedQty > 0 && rate > 0) {
        setComputedTotalAmount(addedQty * rate);
      } else {
        setComputedTotalAmount(null);
      }
    }
  };

  const handleLimitChange = (limit: number) => {
    dispatch(fetchFuelTrackings({ page: 1, limit }));
  };

  useEffect(() => {
    if (error) {
      const msg = typeof error === 'string' ? error : (error as any)?.message || 'An error occurred';
      toast.error(msg);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  // Old form handling functions removed - FormDialog handles form state internally

  // Handle create for FormDialog
  const handleCreate = async (data: any) => {
    // Use addFuelQuantity as the newly added fuel for this record
    const add = Number(data.addFuelQuantity) || 0;
    const basePrev = Number(previousFuelQuantity) || 0;
    // Persist fuelQuantity as previous fuel + newly added fuel (correct addition)
    data.fuelQuantity = basePrev + add;
    // Validation
    if (data.endKm <= data.startKm) {
      toast.error('End KM must be greater than Start KM');
      return;
    }

    // Use add fuel quantity strictly for calculations
    if (add <= 0 || data.fuelRate <= 0) {
      toast.error('Add fuel quantity and rate must be greater than 0');
      return;
    }

    // Use add amount × fuel rate for total amount and average
    const totalAmount = add * data.fuelRate;
    const distance = data.endKm - data.startKm;
    const effectiveFuelUsedForAvg = add + (Number(quickAddFuelQuantity) || 0);
    const truckAverage = effectiveFuelUsedForAvg > 0 ? distance / effectiveFuelUsedForAvg : 0;
    const selectedBank = banks.find(bank => bank._id === data.bankId);

    if (selectedBank && totalAmount > selectedBank.balance) {
      toast.error('Insufficient bank balance for this fuel expense');
      return;
    }

    const fuelTrackingData: FuelTrackingCreateData = {
      appUserId: data.appUserId,
      bankId: data.bankId,
      vehicleId: data.vehicleId,
      startKm: data.startKm,
      endKm: data.endKm,
      // Save total fuel quantity (previous + added) as requested
      fuelQuantity: data.fuelQuantity,
      addFuelQuantity: add,
      fuelRate: data.fuelRate,
      totalAmount,
      truckAverage,
      date: data.date,
      description: data.description || '',
      paymentType: data.paymentType,
    };

    try {
      await dispatch(createFuelTracking(fuelTrackingData)).unwrap();
      toast.success('Fuel tracking record created successfully');
      // Refresh page
      window.location.reload();
    } catch (error: any) {
      const msg = typeof error === 'string' ? error : error?.message || 'Failed to create fuel tracking record';
      toast.error(msg);
      throw error; // Re-throw to let FormDialog handle the error state
    }
  };

  // Handle edit for FormDialog
  const handleEdit = async (data: any, fuelRecord: FuelTracking) => {
    if (!fuelRecord) return;

    // Validation
    if (data.endKm <= data.startKm) {
      toast.error('End KM must be greater than Start KM');
      return;
    }

    // Use add amount as provided
    const add = Number(data.addFuelQuantity) || 0;
    const selectedBank = banks.find(bank => bank._id === data.bankId);

    // Check bank balance (considering the original amount will be restored)
    const originalAmount = fuelRecord.totalAmount;
    const newTotalAmount = Number(data.totalAmount) || (add * data.fuelRate);
    const netAmountChange = newTotalAmount - originalAmount;

    if (selectedBank && netAmountChange > selectedBank.balance) {
      toast.error('Insufficient bank balance for this fuel expense update');
      return;
    }

    const updateData = {
      appUserId: data.appUserId,
      bankId: data.bankId,
      vehicleId: data.vehicleId,
      startKm: data.startKm,
      endKm: data.endKm,
      fuelQuantity: data.fuelQuantity,
      addFuelQuantity: add,
      fuelRate: data.fuelRate,
      totalAmount: newTotalAmount,
      truckAverage: Number(data.truckAverage) || 0,
      date: data.date,
      description: data.description || '',
      paymentType: data.paymentType,
    };

    try {
      await dispatch(updateFuelTracking({ id: fuelRecord._id, fuelData: updateData })).unwrap();
      toast.success('Fuel tracking record updated successfully');
      // Refresh page
      window.location.reload();
    } catch (error: any) {
      const msg = typeof error === 'string' ? error : error?.message || 'Failed to update fuel tracking record';
      toast.error(msg);
      throw error; // Re-throw to let FormDialog handle the error state
    }
  };

  // Handle quick fuel add (vehicle + quantity only)
  const handleQuickAdd = async (data: any) => {
    const qty = Number(data.fuelQuantity) || 0;
    if (qty <= 0) {
      toast.error('Fuel quantity must be greater than 0');
      return;
    }
    const rate = Number(data.fuelRate) || 0;
    if (rate <= 0) {
      toast.error('Fuel rate must be greater than 0');
      return;
    }
    if (!data.appUserId || !data.bankId) {
      toast.error('Select app user and bank account');
      return;
    }
    try {
      await dispatch(createFuelQuickAdd({
        appUserId: data.appUserId,
        bankId: data.bankId,
        vehicleId: data.vehicleId,
        fuelQuantity: qty,
        fuelRate: rate,
      })).unwrap();
      toast.success('Fuel added to vehicle');
      // Refresh page
      window.location.reload();
    } catch (error: any) {
      const msg = typeof error === 'string' ? error : error?.message || 'Failed to add fuel';
      toast.error(msg);
      throw error;
    }
  };

  // Handle delete
  const handleDelete = async (record: FuelTracking) => {
    try {
      await dispatch(deleteFuelTracking(record._id)).unwrap();
      toast.success('Fuel tracking record deleted successfully');
      // Refresh data
      dispatch(fetchFuelTrackings({ page: fuelTrackingsPagination.page, limit: fuelTrackingsPagination.limit }));
      dispatch(fetchBanks());
    } catch (error: any) {
      const msg = typeof error === 'string' ? error : error?.message || 'Failed to delete fuel tracking record';
      toast.error(msg);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const getActiveBanks = () => {
    return banks.filter(bank => bank.isActive);
  };

  const getUserBanks = (userId: string) => {
    return banks.filter(bank => bank.isActive && bank.appUserId._id === userId);
  };

  // Helper functions that referenced formData removed - FormDialog handles calculations internally

  // Generate dynamic default values
  const getDefaultValues = () => ({
    appUserId: selectedAppUserId || "",
    bankId: "",
    vehicleId: selectedVehicleId || "",
    startKm: selectedVehicleId ? dynamicStartKm : 0,
    endKm: 0,
    // Prefill with previous fuel quantity when vehicle selected
    fuelQuantity: selectedVehicleId && previousFuelQuantity > 0 ? previousFuelQuantity : 0,
    remainingFuelQuantity: selectedVehicleId && previousFuelQuantity > 0 ? previousFuelQuantity : 0,
    // Helper field: amount user wants to add to previous fuel quantity
    addFuelQuantity: 0,
    fuelRate: 0,
    date: new Date().toISOString().split('T')[0],
    description: "",
    paymentType: "",
  });

  // Generate dynamic field configuration with options
  // eslint-disable-next-line
  const getFuelTrackingFields = (selectedAppUserId?: string, mode?: 'create' | 'edit'): any[] => {
    const baseFields: any[] = [];

    // App User
    baseFields.push({
      name: "appUserId",
      label: "App User",
      type: "select",
      placeholder: "Select app user",
      required: true,
      options: appUsers.map(user => ({ value: user._id, label: user.name }))
    });

    // Bank Account
    baseFields.push({
      name: "bankId",
      label: "Bank Account",
      type: "select",
      placeholder: "Select bank account",
      required: true,
      options: (selectedAppUserId ? getUserBanks(selectedAppUserId) : getActiveBanks()).map(bank => ({
        value: bank._id,
        label: `${bank.bankName} - ${bank.accountNumber} (${formatCurrency(bank.balance)})`
      }))
    });

    // Vehicle
    baseFields.push({
      name: "vehicleId",
      label: "Vehicle",
      type: "select",
      placeholder: "Select vehicle",
      required: true,
      searchable: true,
      searchPlaceholder: 'Search...',
      options: vehicles.map(vehicle => ({
        value: vehicle._id,
        label: `${vehicle.registrationNumber} (${vehicle.vehicleType} ${vehicle.vehicleWeight}kg)`
      }))
    });

    if (mode === 'create' && selectedVehicleId) {
      baseFields.push({
        name: "previousFuelQuantityInfo",
        label: "Previous Fuel Quantity (from last record)",
        type: "info",
        value: previousFuelRecordQuantity > 0 ? `${previousFuelRecordQuantity.toFixed(2)} L` : "No previous fuel record found",
        required: false,
      });
      if (quickAddFuelQuantity > 0) {
        baseFields.push({
          name: "quickAddFuelQuantityInfo",
          label: "Quick Fuel Adds (since last full record)",
          type: "info",
          value: `${quickAddFuelQuantity.toFixed(2)} L — will be included in average calculation`,
          required: false,
        });
      }
    }

    // Start KM
    baseFields.push({
      name: "startKm",
      label: "Start KM",
      type: "number",
      placeholder: mode === 'create' && selectedVehicleId && dynamicStartKm > 0
        ? (startKmSource === 'fuel' ? `Auto: ${dynamicStartKm} km` : `Auto: ${dynamicStartKm} km`)
        : "Enter start KM",
      required: true,
      onChangeEffect: (typed: number, ctx: {
        getValues: () => any;
        setValue: (name: string, value: any) => void;
      }) => {
        const vals = ctx.getValues();
        const end = Number(vals.endKm) || 0;
        const add = Number(vals.addFuelQuantity) || 0;
        // Use ref so this closure always reads the latest quickAddFuelQuantity value (avoids stale closure)
        const quick = mode === 'create' ? quickAddFuelQuantityRef.current : 0;
        const fuelUsed = add + quick;
        if (fuelUsed > 0 && end > typed) {
          ctx.setValue('truckAverage', parseFloat(((end - typed) / fuelUsed).toFixed(2)));
        }
      }
    });

    // End KM
    baseFields.push({
      name: "endKm",
      label: "End KM",
      type: "number",
      placeholder: "Enter end KM",
      required: true,
      onChangeEffect: (typed: number, ctx: {
        getValues: () => any;
        setValue: (name: string, value: any) => void;
      }) => {
        const vals = ctx.getValues();
        const start = Number(vals.startKm) || 0;
        const add = Number(vals.addFuelQuantity) || 0;
        // Use ref for latest quick fuel qty (avoids stale closure)
        const quick = mode === 'create' ? quickAddFuelQuantityRef.current : 0;
        const fuelUsed = add + quick;
        if (fuelUsed > 0 && typed > start) {
          ctx.setValue('truckAverage', parseFloat(((typed - start) / fuelUsed).toFixed(2)));
        }
      }
    });

    // Remaining Fuel (Editable Balance)
    baseFields.push({
      name: "remainingFuelQuantity",
      label: "Remaining/Previous Fuel (L)",
      type: "number",
      placeholder: "Previous Balance",
      required: false,
      onChangeEffect: (typed: number, ctx: {
        getValues: () => any;
        setValue: (name: string, value: any) => void;
      }) => {
        const vals = ctx.getValues();
        const add = Number(vals.addFuelQuantity) || 0;
        ctx.setValue('fuelQuantity', (Number(typed) || 0) + add);
      }
    });

    // Add Fuel Quantity
    baseFields.push({
      name: "addFuelQuantity",
      label: "Add Fuel Quantity (L)",
      type: "number",
      placeholder: "Amount to add",
      required: true,
      onChangeEffect: (typed: number, ctx: {
        getValues: () => any;
        setValue: (name: string, value: any) => void;
      }) => {
        const vals = ctx.getValues();
        // Update Total Fuel: Use previousFuelQuantity state directly + typed amount
        const rem = Number(previousFuelQuantity) || 0;
        ctx.setValue('fuelQuantity', rem + Number(typed));

        // Update Total Amount
        const rate = Number(vals.fuelRate) || 0;
        if (rate > 0) {
          ctx.setValue('totalAmount', Number(typed) * rate);
        }

        // Update Average — use ref so closure reads latest quickAddFuelQuantity
        const start = Number(vals.startKm) || 0;
        const end = Number(vals.endKm) || 0;
        const quick = mode === 'create' ? quickAddFuelQuantityRef.current : 0;
        const fuelUsed = Number(typed) + quick;
        if (fuelUsed > 0 && end > start) {
          ctx.setValue('truckAverage', parseFloat(((end - start) / fuelUsed).toFixed(2)));
        }
      }
    });

    // Total Fuel Quantity (Read-onlyish or calculated)
    baseFields.push({
      name: "fuelQuantity",
      label: "Total Fuel Quantity (L)",
      type: "number",
      placeholder: "Total Fuel",
      required: true,
      readOnly: true, // Auto-calculated
    });

    // Fuel Rate
    baseFields.push({
      name: "fuelRate",
      label: "Fuel Rate",
      type: "number",
      placeholder: "Enter rate",
      required: true,
      onChangeEffect: (typed: number, ctx: {
        getValues: () => any;
        setValue: (name: string, value: any) => void;
      }) => {
        const vals = ctx.getValues();
        const add = Number(vals.addFuelQuantity) || 0;
        ctx.setValue('totalAmount', add * Number(typed));
      }
    });

    // Total Amount (Calculated but editable)
    baseFields.push({
      name: "totalAmount",
      label: "Total Amount",
      type: "number",
      placeholder: "Calculated Amount",
      required: true,
    });

    // Truck Average
    baseFields.push({
      name: "truckAverage",
      label: "Truck Average (km/L)",
      type: "number",
      placeholder: "Calculated Average",
      required: false,
    });

    // Date
    baseFields.push({
      name: "date",
      label: "Date",
      type: "date",
      required: true,
    });

    // Payment Type
    baseFields.push({
      name: "paymentType",
      label: "Payment Type",
      type: "select",
      placeholder: "Select payment type",
      options: paymentTypes.map(p => ({ value: p, label: p })),
      required: true,
    });

    // Description
    baseFields.push({
      name: "description",
      label: "Description",
      type: "textarea",
      required: false,
    });

    return baseFields;
  };

  const totalFuelExpense = fuelTrackings.reduce((sum, fuel) => sum + fuel.totalAmount, 0);
  const totalFuelQuantity = fuelTrackings.reduce((sum, fuel) => sum + fuel.fuelQuantity, 0);
  const uniqueVehicles = new Set(fuelTrackings.map(fuel => fuel.vehicleId._id)).size;
  const averageFuelRate = fuelTrackings.length > 0
    ? fuelTrackings.reduce((sum, fuel) => sum + fuel.fuelRate, 0) / fuelTrackings.length
    : 0;

  const filteredFuelTrackings = fuelTrackings.filter((fuel) => {
    const q = vehicleQuery.trim().toLowerCase();
    if (!q) return true;
    const reg = (fuel.vehicleId?.registrationNumber || '').toLowerCase();
    return reg.includes(q);
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Fuel Tracking Management</h1>
            <p className="text-gray-600">
              Track fuel expenses and vehiJcle efficiency
            </p>
          </div>

          <div className="flex gap-2">
            <DownloadButton module="fuel-tracking" data={fuelTrackings} />
            <FormDialog
              trigger={
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Fuel Record
                </Button>
              }
              title="Add Fuel Tracking Record"
              description="Create a new fuel tracking record"
              schema={fuelTrackingSchema}
              fields={getFuelTrackingFields(selectedAppUserId, 'create')}
              defaultValues={getDefaultValues()}
              onSubmit={handleCreate}
              onFieldChange={handleFieldChange}
              contentClassName="max-h-[80vh] overflow-y-auto"
              submitLabel="Add Record"
              isLoading={loading}
              mode="create"
            />

            <FormDialog
              trigger={
                <Button variant="secondary">
                  <Fuel className="w-4 h-4 mr-2" />
                  Quick Fuel Add
                </Button>
              }
              title="Quick Fuel Add"
              description="Add fuel to a vehicle and record expense"
              schema={quickFuelAddSchema}
              fields={getQuickFuelAddFields()}
              defaultValues={quickDefaultValues}
              onSubmit={handleQuickAdd}
              onFieldChange={handleFieldChange}
              contentClassName="max-h-[70vh] overflow-y-auto"
              submitLabel="Add Fuel"
              isLoading={loading}
              mode="create"
            />

          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Records
              </CardTitle>
              <Fuel className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fuelTrackings.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Fuel Expense
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(totalFuelExpense)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Fuel (L)
              </CardTitle>
              <Fuel className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalFuelQuantity.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg. Fuel Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(averageFuelRate)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fuel Tracking Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Fuel Tracking Records</CardTitle>
              <div className="w-64">
                <Input
                  placeholder="Search by vehicle registration"
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4">
                Loading fuel tracking records...
              </div>
            ) : fuelTrackings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No fuel tracking records found. Add your first fuel record.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App User</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Fuel</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Average</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFuelTrackings.length === 0 && vehicleQuery.trim() ? (
                    <TableRow>
                      <TableCell colSpan={10}>
                        <div className="text-center text-gray-500">
                          No results for "{vehicleQuery}".
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredFuelTrackings.map((fuel) => (
                    <TableRow key={fuel._id}>
                      <TableCell>
                        <div className="font-medium">{fuel.appUserId.name}</div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {fuel.bankId.bankName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {fuel.bankId.accountNumber}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {fuel.vehicleId.registrationNumber}
                          </div>
                          <div className="text-sm text-gray-500">
                            {fuel.vehicleId.vehicleType}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {(fuel.endKm - fuel.startKm).toFixed(1)} km
                          </div>
                          <div className="text-sm text-gray-500">
                            {fuel.startKm} → {fuel.endKm}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {fuel.fuelQuantity.toFixed(2)} L
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {formatCurrency(fuel.fuelRate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-red-600">
                          {formatCurrency(fuel.totalAmount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-blue-600">
                          {fuel.truckAverage.toFixed(2)} km/L
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(fuel.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <ViewDialog
                            trigger={
                              <Button variant="outline" size="sm" onClick={() => loadQuickAdds(fuel.vehicleId._id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            }
                            title={`Quick Fuel Adds`}
                            description={`Recent quick adds for ${fuel.vehicleId.registrationNumber}`}
                            fields={getQuickAddFields(fuel.vehicleId._id)}
                            contentClassName="max-h-[70vh] overflow-y-auto"
                          />
                          <FormDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                            }
                            title="Edit Fuel Tracking Record"
                            description="Update the fuel tracking record"
                            schema={fuelTrackingSchema}
                            fields={getFuelTrackingFields(fuel.appUserId._id, 'edit')}
                            defaultValues={{
                              appUserId: fuel.appUserId._id,
                              bankId: fuel.bankId._id,
                              vehicleId: fuel.vehicleId._id,
                              startKm: fuel.startKm,
                              endKm: fuel.endKm,
                              fuelQuantity: fuel.fuelQuantity,
                              addFuelQuantity: fuel.addFuelQuantity || 0,
                              remainingFuelQuantity: fuel.fuelQuantity - (fuel.addFuelQuantity || 0),
                              fuelRate: fuel.fuelRate,
                              totalAmount: fuel.totalAmount,
                              truckAverage: fuel.truckAverage,
                              date: fuel.date.split('T')[0],
                              description: fuel.description || '',
                              paymentType: fuel.paymentType,
                            }}
                            onSubmit={(data) => handleEdit(data, fuel)}
                            onFieldChange={handleFieldChange}
                            contentClassName="max-h-[80vh] overflow-y-auto"
                            submitLabel="Update Record"
                            isLoading={loading}
                            mode="edit"
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the fuel tracking record
                                  and restore the bank balance.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(fuel)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {fuelTrackings.length > 0 && (
              <div className="mt-4">
                <Pagination
                  currentPage={fuelTrackingsPagination.page}
                  totalPages={fuelTrackingsPagination.pages}
                  onPageChange={handlePageChange}
                  itemsPerPage={fuelTrackingsPagination.limit}
                  onItemsPerPageChange={handleLimitChange}
                  totalItems={fuelTrackingsPagination.total}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default FuelTrackingManagement;
