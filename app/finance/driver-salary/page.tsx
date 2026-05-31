"use client";

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Plus, Edit, Trash2, Eye, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import * as z from "zod";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FormDialog } from "@/components/common/FormDialog";
import { ViewDialog } from "@/components/common/ViewDialog";

import { RootState, AppDispatch } from "@/lib/redux/store";
import {
  fetchDriverSalaries,
  fetchDriverSalarySummary,
  createDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
  clearSummary,
} from "@/lib/redux/slices/driverSalarySlice";
import { fetchDrivers } from "@/lib/redux/slices/driverSlice";
import { fetchAppUsers } from "@/lib/redux/slices/appUserSlice";
import { fetchBanks } from "@/lib/redux/slices/bankSlice";

const salarySchema = z.object({
  driverId: z.string().min(1, "Driver is required"),
  type: z.enum(["salary", "advance"]),
  amount: z.number().min(1, "Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  month: z.string().min(1, "Month is required"),
  year: z.number().min(2020, "Year must be valid"),
  notes: z.string().optional(),
  appUserId: z.string().min(1, "App User is required"),
  bankId: z.string().min(1, "Bank is required"),
});

const months = [
  { value: "January", label: "January" },
  { value: "February", label: "February" },
  { value: "March", label: "March" },
  { value: "April", label: "April" },
  { value: "May", label: "May" },
  { value: "June", label: "June" },
  { value: "July", label: "July" },
  { value: "August", label: "August" },
  { value: "September", label: "September" },
  { value: "October", label: "October" },
  { value: "November", label: "November" },
  { value: "December", label: "December" },
];

const currentDate = new Date();
const currentMonth = months[currentDate.getMonth()].value;
const currentYear = currentDate.getFullYear();

export default function DriverSalaryPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { salaries, summary, isLoading, error } = useSelector(
    (state: RootState) => state.driverSalary
  );
  const { drivers } = useSelector((state: RootState) => state.drivers);
  const { appUsers } = useSelector((state: RootState) => state.appUsers);
  const { banks } = useSelector((state: RootState) => state.banks);

  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedType, setSelectedType] = useState<string>("");
  const [driverMonthlySalary, setDriverMonthlySalary] = useState<number>(0);
  const [selectedAppUserId, setSelectedAppUserId] = useState<string>("");

  useEffect(() => {
    dispatch(fetchDrivers());
    dispatch(fetchAppUsers());
    dispatch(fetchBanks());
  }, [dispatch]);

  useEffect(() => {
    const filters: any = {};
    if (selectedDriver) filters.driverId = selectedDriver;
    if (selectedMonth) filters.month = selectedMonth;
    if (selectedYear) filters.year = selectedYear;
    if (selectedType) filters.type = selectedType;

    dispatch(fetchDriverSalaries(filters));

    // Fetch summary if driver is selected
    if (selectedDriver) {
      dispatch(
        fetchDriverSalarySummary({
          driverId: selectedDriver,
          month: selectedMonth,
          year: selectedYear,
        })
      );
    } else {
      dispatch(clearSummary());
    }
  }, [dispatch, selectedDriver, selectedMonth, selectedYear, selectedType]);

  const driverOptions = drivers.map((driver) => ({
    value: driver._id,
    label: `${driver.name} (${driver.mobileNo})`,
  }));

  const appUserOptions = appUsers.map((user) => ({
    value: user._id,
    label: user.name,
  }));

  // Filter banks based on selected app user
  const filteredBanks = selectedAppUserId
    ? banks.filter((bank) => {
        // Handle both string and object formats for appUserId
        const bankAppUserId = typeof bank.appUserId === 'string' 
          ? bank.appUserId 
          : bank.appUserId?._id;
        return bankAppUserId === selectedAppUserId;
      })
    : banks;

  const bankOptions = filteredBanks.map((bank) => ({
    value: bank._id,
    label: bank.bankName || bank.name,
  }));

  const salaryFields = [
    {
      name: "driverId",
      label: "Driver",
      type: "select" as const,
      placeholder: "Select driver",
      options: driverOptions,
      required: true,
      searchable: true,
      searchPlaceholder: "Search driver...",
      onChangeEffect: (value: any, ctx: any) => {
        const driver = drivers.find((d) => d._id === value);
        if (driver) {
          setDriverMonthlySalary(driver.monthlySalary || 0);
        }
      },
    },
    {
      name: "monthlySalaryInfo",
      label: "Monthly Salary",
      type: "info" as const,
      value: driverMonthlySalary
        ? new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
          }).format(driverMonthlySalary)
        : "Select a driver to see monthly salary",
    },
    {
      name: "type",
      label: "Type",
      type: "select" as const,
      placeholder: "Select type",
      options: [
        { value: "salary", label: "Salary Payment" },
        { value: "advance", label: "Advance Payment" },
      ],
      required: true,
    },
    {
      name: "amount",
      label: "Amount",
      type: "number" as const,
      placeholder: "Enter amount",
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
      name: "month",
      label: "Month",
      type: "select" as const,
      placeholder: "Select month",
      options: months,
      required: true,
    },
    {
      name: "year",
      label: "Year",
      type: "number" as const,
      placeholder: "Enter year",
      required: true,
    },
    {
      name: "appUserId",
      label: "App User",
      type: "select" as const,
      placeholder: "Select app user",
      options: appUserOptions,
      required: true,
      searchable: true,
      searchPlaceholder: "Search app user...",
      onChangeEffect: (value: any, ctx: any) => {
        setSelectedAppUserId(value);
        // Clear bank selection when app user changes
        ctx.setValue("bankId", "");
      },
    },
    {
      name: "bankId",
      label: "Bank",
      type: "select" as const,
      placeholder: selectedAppUserId 
        ? (filteredBanks.length > 0 ? "Select bank" : "No banks available for this app user")
        : "Select app user first",
      options: bankOptions,
      required: true,
      searchable: true,
      searchPlaceholder: "Search bank...",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea" as const,
      placeholder: "Enter notes (optional)",
      required: false,
    },
  ];

  const defaultValues = {
    driverId: "",
    type: "salary",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    month: currentMonth,
    year: currentYear,
    notes: "",
    appUserId: "",
    bankId: "",
  };

  const handleCreate = async (data: any) => {
    const salaryData = {
      ...data,
      amount: Number(data.amount) || 0,
      year: Number(data.year) || currentYear,
    };
    await dispatch(createDriverSalary(salaryData)).unwrap();
    setDriverMonthlySalary(0);
    setSelectedAppUserId(""); // Reset app user selection
  };

  const handleEdit = async (data: any, id: string) => {
    const salaryData = {
      ...data,
      amount: Number(data.amount) || 0,
      year: Number(data.year) || currentYear,
    };
    await dispatch(updateDriverSalary({ id, data: salaryData })).unwrap();
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteDriverSalary(id)).unwrap();
    } catch (error) {
      console.error("Failed to delete salary record:", error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const typeColors = {
    salary: "default",
    advance: "secondary",
  } as const;

  if (isLoading && salaries.length === 0) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Driver Salary</h1>
              <p className="text-muted-foreground">
                Manage driver salary payments and advances
              </p>
            </div>

            <FormDialog
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Payment
                </Button>
              }
              title="Add Salary/Advance Payment"
              description="Record a salary payment or advance for a driver"
              schema={salarySchema}
              fields={salaryFields}
              defaultValues={defaultValues}
              onSubmit={handleCreate}
              submitLabel="Add Payment"
              isLoading={isLoading}
              mode="create"
              contentClassName="max-w-2xl"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Summary Cards */}
          {summary && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Monthly Salary
                  </CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summary.monthlySalary)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {summary.driverName}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Salary Paid
                  </CardTitle>
                  <TrendingDown className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(summary.totalSalaryPaid)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total payments made
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Advance Taken
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(summary.totalAdvanceTaken)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total advances given
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Remaining Balance
                  </CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-bold ${
                      summary.remainingBalance >= 0
                        ? "text-blue-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(summary.remainingBalance)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {summary.remainingBalance >= 0
                      ? "Amount pending"
                      : "Overpaid"}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">Driver</label>
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                  >
                    <option value="">All Drivers</option>
                    {drivers.map((driver) => (
                      <option key={driver._id} value={driver._id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Month</label>
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    <option value="">All Months</option>
                    {months.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Year</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Type</label>
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="salary">Salary Payment</option>
                    <option value="advance">Advance Payment</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Salary Records Table */}
          <Card>
            <CardHeader>
              <CardTitle>Salary Records ({salaries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Month/Year</TableHead>
                    <TableHead>App User</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaries.map((salary) => (
                    <TableRow key={salary._id}>
                      <TableCell>
                        {new Date(salary.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {salary.driverName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={typeColors[salary.type]}>
                          {salary.type === "salary" ? "Salary" : "Advance"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(salary.amount)}
                      </TableCell>
                      <TableCell>
                        {salary.month} {salary.year}
                      </TableCell>
                      <TableCell>{salary.appUserName || "-"}</TableCell>
                      <TableCell>{salary.bankName || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ViewDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            }
                            title={`Salary Record: ${salary.driverName}`}
                            description="Salary record details"
                            fields={[
                              { label: "Driver", value: salary.driverName },
                              {
                                label: "Monthly Salary",
                                value: formatCurrency(salary.monthlySalary),
                              },
                              {
                                label: "Type",
                                value:
                                  salary.type === "salary"
                                    ? "Salary Payment"
                                    : "Advance Payment",
                                type: "badge",
                                badgeVariant: typeColors[salary.type],
                              },
                              {
                                label: "Amount",
                                value: formatCurrency(salary.amount),
                              },
                              {
                                label: "Date",
                                value: salary.date,
                                type: "date",
                              },
                              {
                                label: "Month",
                                value: salary.month,
                              },
                              {
                                label: "Year",
                                value: salary.year.toString(),
                              },
                              {
                                label: "App User",
                                value: salary.appUserName || "Not specified",
                              },
                              {
                                label: "Bank",
                                value: salary.bankName || "Not specified",
                              },
                              {
                                label: "Notes",
                                value: salary.notes || "No notes",
                              },
                              {
                                label: "Created At",
                                value: salary.createdAt,
                                type: "date",
                              },
                            ]}
                          />

                          <FormDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                            }
                            title={`Edit Payment: ${salary.driverName}`}
                            description="Update salary/advance payment"
                            schema={salarySchema}
                            fields={salaryFields}
                            defaultValues={defaultValues}
                            initialData={{
                              driverId: salary.driverId,
                              type: salary.type,
                              amount: salary.amount,
                              date: new Date(salary.date)
                                .toISOString()
                                .split("T")[0],
                              month: salary.month,
                              year: salary.year,
                              notes: salary.notes || "",
                              appUserId: salary.appUserId || "",
                              bankId: salary.bankId || "",
                            }}
                            onSubmit={(data) => handleEdit(data, salary._id)}
                            submitLabel="Update Payment"
                            isLoading={isLoading}
                            mode="edit"
                            contentClassName="max-w-2xl"
                          />

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Are you sure?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will
                                  permanently delete this salary record.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(salary._id)}
                                  className="bg-red-600 hover:bg-red-700"
                                  disabled={isLoading}
                                >
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

              {salaries.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No salary records found
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Get started by adding a salary payment or advance
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
