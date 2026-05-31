"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSelector } from "react-redux";
import { RootState } from "@/lib/redux/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useMaintenanceMonitor } from "@/components/MaintenanceMonitor";

// KM-based maintenance categories
const kmBasedCategories = [
  "Engine Oil Change",
  "Brake Service",
  "Tire Replacement",
  "Battery Replacement",
  "Air Filter Change",
  "Transmission Service",
  "Coolant Service",
  "Spark Plug Replacement",
  "Belt Replacement",
  "General Inspection",
  "Other",
];

// Date-based maintenance categories
const dateBasedCategories = [
  "TAX",
  "Fitness",
  "Insurance",
  "PUC",
  "Permit",
  "Environment Tax",
  "Driver Licence",
];

// Base schema for common fields
const baseSchema = {
  appUserId: z.string().min(1, "App User is required"),
  bankId: z.string().min(1, "Bank is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  mechanicId: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  categoryAmount: z.number().min(0, "Category amount must be 0 or greater"),
  createdBy: z.string().min(1, "Created by is required"),
  maintenanceType: z.enum(["km-based", "date-based"]),
};

// KM-based schema
const kmBasedSchema = z.object({
  ...baseSchema,
  maintenanceType: z.literal("km-based"),
  targetKm: z.number().min(1, "Target KM must be greater than 0"),
  startKm: z.number().min(0, "Start KM must be 0 or greater"),
  endKm: z.number().min(0, "End KM must be 0 or greater"),
  expiryDate: z.string().optional(),
  driverId: z.string().optional(),
});

// Date-based schema
const dateBasedSchema = z.object({
  ...baseSchema,
  maintenanceType: z.literal("date-based"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  driverId: z.string().optional(),
  targetKm: z.number().optional(),
  startKm: z.number().optional(),
  endKm: z.number().optional(),
});

// Combined schema using discriminated union
const maintenanceSchema = z.discriminatedUnion("maintenanceType", [
  kmBasedSchema,
  dateBasedSchema,
]);

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

interface MaintenanceFormProps {
  appUsers: any[];
  vehicles: any[];
  banks: any[];
  mechanics: any[];
  drivers: any[];
  getUserBanks: (userId: string) => any[];
  getActiveBanks: () => any[];
  onSubmit: (data: any) => Promise<any>;
  onCancel: () => void;
  initialData?: any;
  defaultMaintenanceType?: "km-based" | "date-based";
}

export function MaintenanceForm({
  appUsers,
  vehicles,
  banks,
  mechanics,
  drivers,
  getUserBanks,
  getActiveBanks,
  onSubmit,
  onCancel,
  initialData,
  defaultMaintenanceType = "km-based",
}: MaintenanceFormProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const { startMonitoringForMaintenance } = useMaintenanceMonitor();

  // Form state
  const [maintenanceType, setMaintenanceType] = useState<"km-based" | "date-based">(
    initialData?.maintenanceType || defaultMaintenanceType
  );
  const [selectedAppUser, setSelectedAppUser] = useState(initialData?.appUserId?._id || "");
  const [selectedVehicle, setSelectedVehicle] = useState(initialData?.vehicleId?._id || "");
  const [selectedCategory, setSelectedCategory] = useState(initialData?.category || "");
  const [filteredBanks, setFilteredBanks] = useState(banks);
  const [startKm, setStartKm] = useState(initialData?.startKm || 0);
  const [endKm, setEndKm] = useState(initialData?.endKm || 0);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceType === "km-based" ? kmBasedSchema : dateBasedSchema),
    defaultValues: initialData ? {
      ...initialData,
      appUserId: initialData.appUserId?._id || '',
      bankId: initialData.bankId?._id || '',
      vehicleId: initialData.vehicleId?._id || '',
      driverId: initialData.driverId?._id || '',
      maintenanceType: initialData.maintenanceType || defaultMaintenanceType,
      expiryDate: initialData.expiryDate ? new Date(initialData.expiryDate).toISOString().split('T')[0] : '',
    } : {
      appUserId: '',
      bankId: '',
      vehicleId: '',
      category: '',
      categoryAmount: 0,
      maintenanceType: defaultMaintenanceType,
      targetKm: 500,
      startKm: 0,
      endKm: 0,
      expiryDate: '',
      driverId: '',
      createdBy: user?.id || '',
    },
  });

  const targetKm = watch("targetKm");
  const watchedCategory = watch("category");

  // Set createdBy when user changes
  useEffect(() => {
    if (user?.id) {
      setValue('createdBy', user.id);
    }
  }, [user, setValue]);

  // Filter banks based on selected app user
  useEffect(() => {
    if (selectedAppUser) {
      const userBanks = getUserBanks(selectedAppUser);
      setFilteredBanks(userBanks);
    } else {
      setFilteredBanks(getActiveBanks());
    }
  }, [selectedAppUser, banks, getUserBanks, getActiveBanks]);

  // Fetch start KM when vehicle is selected (only for km-based)
  useEffect(() => {
    if (selectedVehicle && maintenanceType === "km-based") {
      fetchVehicleLatestKm(selectedVehicle);
    }
  }, [selectedVehicle, maintenanceType]);

  // Update form when maintenance type changes
  useEffect(() => {
    setValue("maintenanceType", maintenanceType);
    setSelectedCategory("");
    setValue("category", "");
  }, [maintenanceType, setValue]);

  const fetchVehicleLatestKm = async (vehicleId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/trips/latest/${vehicleId}`);
      if (response.ok) {
        const latestTrip = await response.json();
        const kmValue = latestTrip.endKm || 0;
        setStartKm(kmValue);
        setEndKm(kmValue);
        setValue("startKm", kmValue, { shouldValidate: true });
        setValue("endKm", kmValue, { shouldValidate: true });
      }
    } catch (error) {
      console.error("Failed to fetch vehicle latest KM:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAppUserChange = (value: string) => {
    setSelectedAppUser(value);
    setValue("appUserId", value, { shouldValidate: true });
    setValue("bankId", "");
  };

  const handleVehicleChange = (value: string) => {
    setSelectedVehicle(value);
    setValue("vehicleId", value, { shouldValidate: true });
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setValue("category", value, { shouldValidate: true });
    // Clear driver if not Driver Licence
    if (value !== "Driver Licence") {
      setValue("driverId", "");
    }
  };

  const onFormSubmit = async (data: MaintenanceFormData) => {
    console.log("Form submitted with data:", data);

    try {
      setLoading(true);

      const selectedVehicleData = vehicles.find(vehicle => vehicle._id === data.vehicleId);
      const selectedBankData = banks.find(bank => bank._id === data.bankId);
      const selectedDriverData = data.driverId ? drivers.find(driver => driver._id === data.driverId) : null;

      const formattedData = {
        ...data,
        bankName: selectedBankData?.bankName || "",
        vehicleNumber: selectedVehicleData?.registrationNumber || "",
        driverName: selectedDriverData?.name || "",
        createdBy: data.createdBy || user?.id,
      };

      console.log("Formatted data being sent:", formattedData);

      const result: any = await onSubmit(formattedData);

      // Start monitoring for km-based maintenance
      if (result && result._id && maintenanceType === "km-based") {
        try {
          await startMonitoringForMaintenance(result._id);
        } catch (monitoringError) {
          console.warn("Failed to start monitoring:", monitoringError);
        }
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert(`Error creating maintenance record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const totalKmTraveled = endKm - startKm;
  const progressPercentage = (targetKm || 0) > 0 ? Math.min((totalKmTraveled / (targetKm || 1)) * 100, 100) : 0;

  // Get categories based on maintenance type
  const categories = maintenanceType === "km-based" ? kmBasedCategories : dateBasedCategories;

  // Check if driver selection should be shown
  const showDriverSelection = maintenanceType === "date-based" && selectedCategory === "Driver Licence";

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Maintenance Type Selection */}
      <div className="space-y-2">
        <Label htmlFor="maintenanceType">Maintenance Type *</Label>
        <Select value={maintenanceType} onValueChange={(v) => setMaintenanceType(v as "km-based" | "date-based")}>
          <SelectTrigger>
            <SelectValue placeholder="Select maintenance type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="km-based">KM-Based</SelectItem>
            <SelectItem value="date-based">Date-Based</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          {maintenanceType === "km-based"
            ? "Track maintenance based on kilometers traveled (e.g., oil change every 5000 km)"
            : "Track document expiry dates (e.g., Insurance, PUC, Permit)"}
        </p>
      </div>

      {/* Hidden fields */}
      <input type="hidden" {...register("maintenanceType")} />
      <input type="hidden" {...register("createdBy")} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* App User Selection */}
        <div className="space-y-2">
          <Label htmlFor="appUserId">App User *</Label>
          <Select onValueChange={handleAppUserChange} value={selectedAppUser}>
            <SelectTrigger>
              <SelectValue placeholder="Select App User" />
            </SelectTrigger>
            <SelectContent>
              {appUsers.map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.appUserId && (
            <p className="text-sm text-red-600">{errors.appUserId.message}</p>
          )}
        </div>

        {/* Bank Selection */}
        <div className="space-y-2">
          <Label htmlFor="bankId">Bank *</Label>
          <Select
            onValueChange={(value) => setValue("bankId", value, { shouldValidate: true })}
            value={watch("bankId")}
            disabled={!selectedAppUser}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Bank" />
            </SelectTrigger>
            <SelectContent>
              {filteredBanks.map((bank) => (
                <SelectItem key={bank._id} value={bank._id}>
                  {bank.bankName} (Balance: ₹{bank.balance?.toLocaleString() || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.bankId && (
            <p className="text-sm text-red-600">{errors.bankId.message}</p>
          )}
        </div>

        {/* Vehicle Selection */}
        <div className="space-y-2">
          <Label htmlFor="vehicleId">Vehicle *</Label>
          <Select onValueChange={handleVehicleChange} value={selectedVehicle}>
            <SelectTrigger>
              <SelectValue placeholder="Select Vehicle" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle._id} value={vehicle._id}>
                  {vehicle.registrationNumber} ({vehicle.vehicleType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.vehicleId && (
            <p className="text-sm text-red-600">{errors.vehicleId.message}</p>
          )}
        </div>

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">Maintenance Category *</Label>
          <Select onValueChange={handleCategoryChange} value={selectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-sm text-red-600">{errors.category.message}</p>
          )}
        </div>

        {/* Category Amount */}
        <div className="space-y-2">
          <Label htmlFor="categoryAmount">Amount (₹)</Label>
          <Input
            id="categoryAmount"
            type="number"
            {...register("categoryAmount", { valueAsNumber: true })}
            placeholder="Enter amount"
            min="0"
            step="0.01"
          />
          {errors.categoryAmount && (
            <p className="text-sm text-red-600">{errors.categoryAmount.message}</p>
          )}
        </div>

        {/* Mechanic Selection (optional) */}
        <div className="space-y-2">
          <Label htmlFor="mechanicId">Mechanic (Optional)</Label>
          <Select
            onValueChange={(value) => setValue("mechanicId", value, { shouldValidate: true })}
            value={watch("mechanicId")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Mechanic" />
            </SelectTrigger>
            <SelectContent>
              {mechanics.filter(mechanic => mechanic.status === 'active').map((mechanic) => (
                <SelectItem key={mechanic._id} value={mechanic._id}>
                  {mechanic.name} - {mechanic.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Driver Selection (only for Driver Licence category) */}
        {showDriverSelection && (
          <div className="space-y-2">
            <Label htmlFor="driverId">Driver *</Label>
            <Select
              onValueChange={(value) => setValue("driverId", value, { shouldValidate: true })}
              value={watch("driverId")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.filter(driver => driver.status === 'active').map((driver) => (
                  <SelectItem key={driver._id} value={driver._id}>
                    {driver.name} - {driver.mobileNo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.driverId && (
              <p className="text-sm text-red-600">{errors.driverId.message}</p>
            )}
          </div>
        )}

        {/* Date-based: Expiry Date */}
        {maintenanceType === "date-based" && (
          <div className="space-y-2">
            <Label htmlFor="expiryDate">Expiry Date *</Label>
            <Input
              id="expiryDate"
              type="date"
              {...register("expiryDate")}
            />
            {errors.expiryDate && (
              <p className="text-sm text-red-600">{errors.expiryDate.message}</p>
            )}
          </div>
        )}

        {/* KM-based: Target KM */}
        {maintenanceType === "km-based" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="targetKm">Target KM *</Label>
              <Input
                id="targetKm"
                type="number"
                {...register("targetKm", { valueAsNumber: true })}
                placeholder="Enter target kilometers"
              />
              {errors.targetKm && (
                <p className="text-sm text-red-600">{errors.targetKm.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="startKm">Start KM</Label>
              <Input
                id="startKm"
                type="number"
                value={startKm}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setStartKm(value);
                  setValue("startKm", value, { shouldValidate: true });
                }}
                placeholder="Start kilometers (auto-populated)"
                className="bg-gray-50"
                readOnly
              />
              <p className="text-xs text-gray-600">
                Auto-populated from latest trip record
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endKm">Current KM</Label>
              <Input
                id="endKm"
                type="number"
                value={endKm}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setEndKm(value);
                  setValue("endKm", value, { shouldValidate: true });
                }}
                placeholder="Current kilometers"
              />
            </div>
          </>
        )}
      </div>

      {/* KM Tracking Display (only for km-based) */}
      {maintenanceType === "km-based" && selectedVehicle && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Start KM</Label>
                  <p className="text-2xl font-bold text-blue-600">
                    {loading ? "Loading..." : startKm.toLocaleString()} KM
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Current KM</Label>
                  <p className="text-2xl font-bold text-green-600">
                    {endKm.toLocaleString()} KM
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress Tracking */}
          {(targetKm || 0) > 0 && (
            <Card className={totalKmTraveled >= (targetKm || 0) ? "border-red-500 bg-red-50" : "border-gray-200"}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Maintenance Progress</Label>
                    <span className={`text-sm font-semibold ${totalKmTraveled >= (targetKm || 0) ? "text-red-600" : "text-gray-600"}`}>
                      {totalKmTraveled.toLocaleString()} / {(targetKm || 0).toLocaleString()} KM
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${totalKmTraveled >= (targetKm || 0)
                        ? "bg-red-500"
                        : progressPercentage >= 80
                          ? "bg-yellow-500"
                          : "bg-green-500"
                        }`}
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                  </div>
                  {totalKmTraveled >= (targetKm || 0) && (
                    <div className="flex items-center space-x-2 text-red-600">
                      <span className="text-sm font-medium">⚠️ Maintenance Due!</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Date-based info display */}
      {maintenanceType === "date-based" && watch("expiryDate") && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Document Expiry</Label>
              <p className="text-2xl font-bold text-blue-600">
                {new Date(watch("expiryDate") || "").toLocaleDateString()}
              </p>
              {(() => {
                const expiryDate = new Date(watch("expiryDate") || "");
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                expiryDate.setHours(0, 0, 0, 0);
                const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                if (daysUntilExpiry < 0) {
                  return <p className="text-red-600 font-medium">⚠️ Expired {Math.abs(daysUntilExpiry)} days ago</p>;
                } else if (daysUntilExpiry <= 30) {
                  return <p className="text-yellow-600 font-medium">⚠️ Expires in {daysUntilExpiry} days</p>;
                } else {
                  return <p className="text-green-600 font-medium">✓ Valid for {daysUntilExpiry} days</p>;
                }
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Actions */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : (initialData ? "Update" : "Create")} Maintenance Record
        </Button>
      </div>
    </form>
  );
}