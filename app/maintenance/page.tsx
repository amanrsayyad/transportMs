"use client";

import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/lib/redux/store";
import {
  fetchMaintenanceRecords,
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  clearError,
  Maintenance,
} from "@/lib/redux/slices/maintenanceSlice";
import { fetchAppUsers } from "@/lib/redux/slices/appUserSlice";
import { fetchVehicles } from "@/lib/redux/slices/vehicleSlice";
import { fetchBanks } from "@/lib/redux/slices/bankSlice";
import { fetchMechanics } from "@/lib/redux/slices/mechanicSlice";
import { fetchDrivers } from "@/lib/redux/slices/driverSlice";
import { Plus, Edit, Trash2, AlertTriangle, CheckCircle, Clock, Calendar, Car, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaintenanceForm } from "./components/MaintenanceForm";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { toast } from "sonner";
import { DownloadButton } from "@/components/common/DownloadButton";

export default function MaintenancePage() {
  const dispatch = useDispatch<AppDispatch>();
  const { maintenanceRecords, loading, error } = useSelector(
    (state: RootState) => state.maintenance
  );
  const { appUsers } = useSelector((state: RootState) => state.appUsers);
  const { vehicles } = useSelector((state: RootState) => state.vehicles);
  const { banks } = useSelector((state: RootState) => state.banks);
  const { mechanics } = useSelector((state: RootState) => state.mechanics);
  const { drivers } = useSelector((state: RootState) => state.drivers);

  const [showForm, setShowForm] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  const [activeTab, setActiveTab] = useState<"km-based" | "date-based">("km-based");

  // Complete dialog state
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completingMaintenance, setCompletingMaintenance] = useState<Maintenance | null>(null);
  const [completionAmount, setCompletionAmount] = useState<number>(0);
  const [completingLoading, setCompletingLoading] = useState(false);

  // Helper function to get banks filtered by app user
  const getUserBanks = (userId: string) => {
    return banks.filter(bank => bank.isActive && bank.appUserId._id === userId);
  };

  const getActiveBanks = () => {
    return banks.filter(bank => bank.isActive);
  };

  useEffect(() => {
    dispatch(fetchMaintenanceRecords());
    dispatch(fetchAppUsers());
    dispatch(fetchMechanics());
    dispatch(fetchVehicles());
    dispatch(fetchBanks());
    dispatch(fetchDrivers());
  }, [dispatch]);

  // Get user from Redux state
  const { user } = useSelector((state: RootState) => state.auth);

  // Filter records by maintenance type
  const kmBasedRecords = maintenanceRecords.filter(m => m.maintenanceType !== 'date-based');
  const dateBasedRecords = maintenanceRecords.filter(m => m.maintenanceType === 'date-based');

  // Get due/overdue date-based records for notifications
  const dueRecords = dateBasedRecords.filter(m =>
    (m.status === 'Due' || m.status === 'Overdue') && !m.isCompleted
  );

  const handleCreateMaintenance = async (maintenanceData: any) => {
    try {
      console.log("Maintenance data received from form:", maintenanceData);

      if (!maintenanceData.appUserId || !maintenanceData.bankId || !maintenanceData.vehicleId) {
        console.error("Missing required fields:", {
          appUserId: maintenanceData.appUserId,
          bankId: maintenanceData.bankId,
          vehicleId: maintenanceData.vehicleId
        });
        toast.error("Missing required fields. Please fill all required fields.");
        return;
      }

      if (!maintenanceData.createdBy) {
        maintenanceData.createdBy = user?.id || maintenanceData.appUserId;
      }

      const result = await dispatch(createMaintenanceRecord(maintenanceData)).unwrap();
      console.log("Maintenance record created successfully:", result);
      toast.success("Maintenance record created successfully");
      setShowForm(false);
      dispatch(fetchMaintenanceRecords());

      return result;
    } catch (error: any) {
      console.error("Failed to create maintenance record:", error);
      toast.error(error?.message || "Failed to create maintenance record");
      throw error;
    }
  };

  const handleDeleteMaintenance = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this maintenance record?")) {
      try {
        await dispatch(deleteMaintenanceRecord(id)).unwrap();
        toast.success("Maintenance record deleted successfully");
      } catch (error: any) {
        console.error("Failed to delete maintenance record:", error);
        toast.error(error?.message || "Failed to delete maintenance record");
      }
    }
  };

  const handleOpenCompleteDialog = (maintenance: Maintenance) => {
    setCompletingMaintenance(maintenance);
    setCompletionAmount(maintenance.categoryAmount || 0);
    setShowCompleteDialog(true);
  };

  const handleCompleteMaintenance = async () => {
    if (!completingMaintenance) return;

    try {
      setCompletingLoading(true);

      const response = await fetch(`/api/maintenance/${completingMaintenance._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryAmount: completionAmount,
          status: 'Completed',
          isCompleted: true,
          completedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete maintenance');
      }

      toast.success("Maintenance completed successfully!");
      setShowCompleteDialog(false);
      setCompletingMaintenance(null);
      dispatch(fetchMaintenanceRecords());
    } catch (error: any) {
      console.error("Failed to complete maintenance:", error);
      toast.error(error?.message || "Failed to complete maintenance");
    } finally {
      setCompletingLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'Due':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'Overdue':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'Due':
        return 'bg-red-100 text-red-800';
      case 'Overdue':
        return 'bg-red-200 text-red-900';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const renderMaintenanceCard = (maintenance: Maintenance) => (
    <Card key={maintenance._id}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {getStatusIcon(maintenance.status)}
            <div>
              <h3 className="text-lg font-semibold">
                {maintenance.vehicleNumber} - {maintenance.category}
              </h3>
              <p className="text-sm text-gray-600">
                App User: {maintenance.appUserId?.name} | Bank: {maintenance.bankName}
                {maintenance.maintenanceType === 'date-based' && maintenance.driverName && (
                  <> | Driver: {maintenance.driverName}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getStatusColor(maintenance.status)}>
              {maintenance.status}
            </Badge>

            {/* Complete button for Due/Overdue records */}
            {(maintenance.status === 'Due' || maintenance.status === 'Overdue') && !maintenance.isCompleted && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleOpenCompleteDialog(maintenance)}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Complete
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingMaintenance(maintenance);
                setShowForm(true);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteMaintenance(maintenance._id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Amount</p>
            <p className="text-lg font-semibold">₹{maintenance.categoryAmount.toLocaleString()}</p>
          </div>
          {maintenance.maintenanceType === 'date-based' ? (
            <>
              <div>
                <p className="text-sm font-medium text-gray-500">Expiry Date</p>
                <p className="text-lg font-semibold">
                  {maintenance.expiryDate ? new Date(maintenance.expiryDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Days Remaining</p>
                <p className={`text-lg font-semibold ${(() => {
                  if (!maintenance.expiryDate) return 'text-gray-600';
                  const days = Math.ceil((new Date(maintenance.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  if (days < 0) return 'text-red-600';
                  if (days <= 30) return 'text-yellow-600';
                  return 'text-green-600';
                })()
                  }`}>
                  {maintenance.expiryDate ? (() => {
                    const days = Math.ceil((new Date(maintenance.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    if (days < 0) return `${Math.abs(days)} days overdue`;
                    return `${days} days`;
                  })() : 'N/A'}
                </p>
              </div>
              {maintenance.driverName && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Driver</p>
                  <p className="text-lg font-semibold">{maintenance.driverName}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-gray-500">Start KM</p>
                <p className="text-lg font-semibold">{(maintenance.startKm || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Target KM</p>
                <p className="text-lg font-semibold">{(maintenance.targetKm || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Current KM</p>
                <p className="text-lg font-semibold">{(maintenance.endKm || 0).toLocaleString()}</p>
              </div>
            </>
          )}
        </div>

        {/* Progress bar only for km-based */}
        {maintenance.maintenanceType !== 'date-based' && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{maintenance.totalKm || 0} / {maintenance.targetKm || 0} KM</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${(maintenance.totalKm || 0) >= (maintenance.targetKm || 1)
                  ? 'bg-red-500'
                  : (maintenance.totalKm || 0) >= (maintenance.targetKm || 1) * 0.8
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                  }`}
                style={{
                  width: `${Math.min(((maintenance.totalKm || 0) / (maintenance.targetKm || 1)) * 100, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (error) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => dispatch(clearError())}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Maintenance Management</h1>
              <p className="text-muted-foreground">
                Manage vehicle maintenance schedules and track service records
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DownloadButton module="maintenance" data={maintenanceRecords} />
              <Dialog open={showForm} onOpenChange={(open) => {
                if (!open) {
                  setEditingMaintenance(null);
                }
                setShowForm(open);
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Maintenance Record
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingMaintenance ? "Edit Maintenance Record" : "Create New Maintenance Record"}
                    </DialogTitle>
                  </DialogHeader>
                  <MaintenanceForm
                    appUsers={appUsers}
                    vehicles={vehicles}
                    banks={banks}
                    mechanics={mechanics}
                    drivers={drivers}
                    getUserBanks={getUserBanks}
                    getActiveBanks={getActiveBanks}
                    onSubmit={handleCreateMaintenance}
                    onCancel={() => {
                      setShowForm(false);
                      setEditingMaintenance(null);
                    }}
                    initialData={editingMaintenance}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Due Notifications Banner */}
          {dueRecords.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-800">
                      {dueRecords.length} Document{dueRecords.length > 1 ? 's' : ''} Due/Expired
                    </h3>
                    <p className="text-sm text-red-600">
                      {dueRecords.map(r => `${r.vehicleNumber} - ${r.category}`).join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('date-based')}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                  >
                    View All
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm text-gray-500">KM-Based</p>
                    <p className="text-2xl font-bold">{kmBasedRecords.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm text-gray-500">Date-Based</p>
                    <p className="text-2xl font-bold">{dateBasedRecords.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm text-gray-500">Due/Overdue</p>
                    <p className="text-2xl font-bold text-red-600">
                      {maintenanceRecords.filter(m => m.status === 'Due' || m.status === 'Overdue').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm text-gray-500">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {maintenanceRecords.filter(m => m.status === 'Completed').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "km-based" | "date-based")}>
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="km-based" className="flex items-center gap-2">
                <Car className="h-4 w-4" />
                KM-Based ({kmBasedRecords.length})
              </TabsTrigger>
              <TabsTrigger value="date-based" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date-Based ({dateBasedRecords.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="km-based" className="mt-4">
              <div className="grid gap-4">
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : kmBasedRecords.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <Car className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No KM-based maintenance records</h3>
                      <p className="text-gray-500 text-center mb-4">
                        Track engine oil changes, tire replacements, and other KM-based maintenance.
                      </p>
                      <Button onClick={() => setShowForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Maintenance Record
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  kmBasedRecords.map(renderMaintenanceCard)
                )}
              </div>
            </TabsContent>

            <TabsContent value="date-based" className="mt-4">
              <div className="grid gap-4">
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : dateBasedRecords.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <Calendar className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No date-based maintenance records</h3>
                      <p className="text-gray-500 text-center mb-4">
                        Track document expiries like Insurance, PUC, Permit, TAX, etc.
                      </p>
                      <Button onClick={() => setShowForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Maintenance Record
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  dateBasedRecords.map(renderMaintenanceCard)
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Complete Maintenance Dialog */}
          <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Complete Maintenance</DialogTitle>
              </DialogHeader>
              {completingMaintenance && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="font-medium">{completingMaintenance.vehicleNumber}</p>
                    <p className="text-sm text-gray-600">{completingMaintenance.category}</p>
                    {completingMaintenance.expiryDate && (
                      <p className="text-sm text-gray-500">
                        Expiry: {new Date(completingMaintenance.expiryDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="completionAmount">Actual Cost (₹) *</Label>
                    <Input
                      id="completionAmount"
                      type="number"
                      value={completionAmount}
                      onChange={(e) => setCompletionAmount(Number(e.target.value))}
                      placeholder="Enter actual maintenance cost"
                      min="0"
                    />
                    <p className="text-xs text-gray-500">
                      Original estimate: ₹{completingMaintenance.categoryAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCompleteDialog(false)}
                  disabled={completingLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCompleteMaintenance}
                  disabled={completingLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {completingLoading ? "Saving..." : "Mark as Completed"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}