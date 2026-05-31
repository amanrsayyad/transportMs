"use client";

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/lib/redux/store';
import {
  fetchTransactions,
  setFilters,
  clearFilters,
  setPagination,
  clearError,
  Transaction as TransactionType
} from '@/lib/redux/slices/transactionSlice';
import { fetchAppUsers } from '@/lib/redux/slices/appUserSlice';
import { fetchCustomers } from '@/lib/redux/slices/customerSlice';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DownloadButton } from '@/components/common/DownloadButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Receipt
} from 'lucide-react';
import { toast } from 'sonner';

const TransactionHistory = () => {
  const dispatch = useDispatch<AppDispatch>();
  const {
    transactions,
    loading,
    error,
    pagination,
    filters
  } = useSelector((state: RootState) => state.transactions);
  const { appUsers } = useSelector((state: RootState) => state.appUsers);
  const { customers } = useSelector((state: RootState) => state.customers);

  const [localFilters, setLocalFilters] = useState({
    types: [] as string[], // Changed from 'type' to 'types' array
    appUserId: 'all',
    startDate: '',
    endDate: '',
    customerName: 'all',
    invoiceNo: '',
  });

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);

  const [detailTransaction, setDetailTransaction] = useState<TransactionType | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [descriptionModal, setDescriptionModal] = useState<{ open: boolean; description: string; type: string; transactionId: string }>({ open: false, description: '', type: '', transactionId: '' });

  const handleTypeClick = (transaction: TransactionType) => {
    if (transaction.subTransactions && transaction.subTransactions.length > 0) {
      setDetailTransaction(transaction);
      setIsDetailOpen(true);
    }
  };

  useEffect(() => {
    dispatch(fetchTransactions({ page: 1, limit: 20 }));
    dispatch(fetchAppUsers());
    dispatch(fetchCustomers());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const handleFilterChange = (name: string, value: string) => {
    setLocalFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleTypeToggle = (type: string) => {
    setLocalFilters(prev => {
      const types = prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type];
      return { ...prev, types };
    });
  };

  const transactionTypes = [
    { value: 'INCOME', label: 'Income' },
    { value: 'EXPENSE', label: 'Expense' },
    { value: 'TRANSFER', label: 'Transfer' },
    { value: 'FUEL', label: 'Fuel' },
    { value: 'DRIVER_BUDGET', label: 'Driver Budget' },
    { value: 'BANK_UPDATE', label: 'Bank Update' },
  ];

  const handleSelectAllTypes = () => {
    if (localFilters.types.length === transactionTypes.length) {
      // Deselect all
      setLocalFilters(prev => ({ ...prev, types: [] }));
    } else {
      // Select all
      setLocalFilters(prev => ({ ...prev, types: transactionTypes.map(t => t.value) }));
    }
  };

  const applyFilters = () => {
    console.log('=== Apply Filters ===');
    console.log('localFilters:', localFilters);
    
    const filterParams = {
      ...localFilters,
      page: 1,
      limit: pagination.limit,
    };

    // Convert types array to comma-separated string for API
    if (localFilters.types.length > 0) {
      (filterParams as any).type = localFilters.types.join(',');
      console.log('Converted types to:', (filterParams as any).type);
    }
    delete (filterParams as any).types;

    // Remove empty filters and 'all' values
    Object.keys(filterParams).forEach(key => {
      const value = filterParams[key as keyof typeof filterParams];
      if (!value || value === 'all') {
        delete filterParams[key as keyof typeof filterParams];
      }
    });

    console.log('filterParams to send:', filterParams);

    const cleanedFilters: any = {};
    Object.keys(localFilters).forEach((key) => {
      const val = (localFilters as any)[key];
      if (key === 'types' && Array.isArray(val) && val.length > 0) {
        cleanedFilters[key] = val;
      } else if (val && val !== 'all') {
        cleanedFilters[key] = val;
      }
    });
    dispatch(setFilters(cleanedFilters));
    dispatch(fetchTransactions(filterParams));
    console.log('=== End Apply Filters ===');
  };

  const clearAllFilters = () => {
    setLocalFilters({
      types: [],
      appUserId: 'all',
      startDate: '',
      endDate: '',
      customerName: 'all',
      invoiceNo: '',
    });
    dispatch(clearFilters());
    dispatch(fetchTransactions({ page: 1, limit: pagination.limit }));
  };

  const handlePageChange = (newPage: number) => {
    // Convert types array to type string for API
    const apiFilters: any = { ...filters };
    if (apiFilters.types && Array.isArray(apiFilters.types) && apiFilters.types.length > 0) {
      apiFilters.type = apiFilters.types.join(',');
      delete apiFilters.types;
    }
    
    const params = {
      ...apiFilters,
      page: newPage,
      limit: pagination.limit,
    };
    dispatch(setPagination({ page: newPage }));
    dispatch(fetchTransactions(params));
  };

  const refreshTransactions = () => {
    // Convert types array to type string for API
    const apiFilters: any = { ...filters };
    if (apiFilters.types && Array.isArray(apiFilters.types) && apiFilters.types.length > 0) {
      apiFilters.type = apiFilters.types.join(',');
      delete apiFilters.types;
    }
    
    const params = {
      ...apiFilters,
      page: pagination.page,
      limit: pagination.limit,
    };
    dispatch(fetchTransactions(params));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  // Filter customers based on search query
  const filteredCustomers = customers.filter((customer) =>
    customer.customerName.toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'EXPENSE':
      case 'FUEL':
      case 'DRIVER_BUDGET':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'TRANSFER':
        return <ArrowRightLeft className="w-4 h-4 text-blue-600" />;
      default:
        return <Receipt className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'bg-green-100 text-green-800';
      case 'EXPENSE':
        return 'bg-red-100 text-red-800';
      case 'TRANSFER':
        return 'bg-blue-100 text-blue-800';
      case 'FUEL':
        return 'bg-orange-100 text-orange-800';
      case 'DRIVER_BUDGET':
        return 'bg-purple-100 text-purple-800';
      case 'BANK_UPDATE':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const totalAmount = transactions.reduce((sum, transaction) => {
    if (transaction.type === 'INCOME') {
      return sum + transaction.amount;
    } else if (['EXPENSE', 'FUEL', 'DRIVER_BUDGET'].includes(transaction.type)) {
      return sum - transaction.amount;
    }
    return sum;
  }, 0);

  const incomeCount = transactions.filter(t => t.type === 'INCOME').length;
  const expenseCount = transactions.filter(t => ['EXPENSE', 'FUEL', 'DRIVER_BUDGET'].includes(t.type)).length;
  const formatBankDisplay = (t: any) => {
    const b = t.fromBankId || t.toBankId;
    const name = b?.bankName || '';
    const acc = String(b?.accountNumber || '');
    const last4 = acc ? acc.slice(-4) : '';
    return name ? `${name}${last4 ? ' • ' + last4 : ''}` : '-';
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Transaction History</h1>
          <p className="text-gray-600">
            Complete record of all financial activities
          </p>
        </div>

        <div className="flex space-x-2">
          <Button variant="outline" onClick={refreshTransactions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <DownloadButton module="transactions" data={transactions} filters={filters} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Transactions
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagination.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${totalAmount >= 0 ? "text-green-600" : "text-red-600"
                }`}
            >
              {formatCurrency(totalAmount)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Income Transactions
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {incomeCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Expense Transactions
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {expenseCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <Label>Transaction Type</Label>
              <Popover open={typeFilterOpen} onOpenChange={setTypeFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={typeFilterOpen}
                    className="w-full justify-between"
                  >
                    {localFilters.types.length === 0
                      ? "Select types..."
                      : localFilters.types.length === transactionTypes.length
                      ? "All types"
                      : `${localFilters.types.length} selected`}
                    <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                    {/* Select All Option */}
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Checkbox
                        id="type-select-all"
                        checked={localFilters.types.length === transactionTypes.length}
                        onCheckedChange={handleSelectAllTypes}
                      />
                      <label
                        htmlFor="type-select-all"
                        className="text-sm font-semibold leading-none cursor-pointer"
                      >
                        Select All
                      </label>
                    </div>
                    
                    {/* Individual Type Checkboxes */}
                    {transactionTypes.map((type) => (
                      <div key={type.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${type.value}`}
                          checked={localFilters.types.includes(type.value)}
                          onCheckedChange={() => handleTypeToggle(type.value)}
                        />
                        <label
                          htmlFor={`type-${type.value}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {type.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="appUserId">App User</Label>
              <Select
                value={localFilters.appUserId}
                onValueChange={(value) =>
                  handleFilterChange("appUserId", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {appUsers.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={localFilters.startDate}
                onChange={(e) =>
                  handleFilterChange("startDate", e.target.value)
                }
              />
            </div>

            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={localFilters.endDate}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="customerName">Customer</Label>
              <Select
                value={localFilters.customerName}
                onValueChange={(value) => {
                  handleFilterChange("customerName", value);
                  setCustomerSearchQuery(''); // Clear search when selection is made
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder="Search customers..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      className="h-8"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <SelectItem value="all">All Customers</SelectItem>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((c) => (
                      <SelectItem key={c._id} value={c.customerName}>
                        {c.customerName}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No customers found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="invoiceNo">Invoice No / LR No</Label>
              <Input
                id="invoiceNo"
                type="text"
                placeholder="Search by invoice/LR number"
                value={localFilters.invoiceNo}
                onChange={(e) =>
                  handleFilterChange("invoiceNo", e.target.value)
                }
              />
            </div>

            <div className="flex items-end space-x-2">
              <Button onClick={applyFilters}>
                <Search className="w-4 h-4 mr-2" />
                Apply
              </Button>
              <Button variant="outline" onClick={clearAllFilters}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">App User</TableHead>
                      <TableHead className="min-w-[200px]">Bank</TableHead>
                      <TableHead className="min-w-[100px]">Type</TableHead>
                      <TableHead className="min-w-[200px]">
                        Description
                      </TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[120px]">
                        Balance After
                      </TableHead>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction._id}>
                        <TableCell>
                          <div className="font-medium">
                            {transaction.appUserId.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{formatBankDisplay(transaction)}</div>
                        </TableCell>
                        <TableCell>
                          <div
                            className={`flex items-center space-x-2 ${transaction.subTransactions && transaction.subTransactions.length > 0 ? 'cursor-pointer' : ''}`}
                            onClick={() => handleTypeClick(transaction)}
                            title={transaction.subTransactions && transaction.subTransactions.length > 0 ? 'Click to view invoice breakdown' : ''}
                          >
                            {getTransactionIcon(transaction.type)}
                            <Badge
                              className={getTransactionTypeColor(
                                transaction.type
                              )}
                            >
                              {transaction.type.replace("_", " ")}
                              {transaction.subTransactions && transaction.subTransactions.length > 0 && (
                                <span className="ml-1">({transaction.subTransactions.length})</span>
                              )}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div
                            className="max-w-xs truncate cursor-pointer text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={() => setDescriptionModal({ open: true, description: transaction.description || '', type: transaction.type || '', transactionId: transaction.transactionId || '' })}
                            title="Click to view full description"
                          >
                            {transaction.description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-medium ${transaction.type === "INCOME"
                              ? "text-green-600"
                              : ["EXPENSE", "FUEL", "DRIVER_BUDGET"].includes(
                                transaction.type
                              )
                                ? "text-red-600"
                                : "text-blue-600"
                              }`}
                          >
                            {transaction.type === "INCOME"
                              ? "+"
                              : ["EXPENSE", "FUEL", "DRIVER_BUDGET"].includes(
                                transaction.type
                              )
                                ? "-"
                                : ""}
                            {formatCurrency(transaction.amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatCurrency(transaction.balanceAfter)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {new Date(transaction.date).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )}{" "}
                  of {pagination.total} transactions
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>

                  <span className="text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sub-Transaction Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice Payment Breakdown</DialogTitle>
            <DialogDescription>
              {detailTransaction?.description}
            </DialogDescription>
          </DialogHeader>
          {detailTransaction?.subTransactions && detailTransaction.subTransactions.length > 0 && (
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>LR No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailTransaction.subTransactions.map((sub, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{sub.lrNo || '-'}</TableCell>
                      <TableCell>{sub.customerName || '-'}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {formatCurrency(sub.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between items-center mt-4 pt-3 border-t">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-green-600">
                  {formatCurrency(detailTransaction.subTransactions.reduce((sum, s) => sum + s.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Description Detail Modal */}
      <Dialog open={descriptionModal.open} onOpenChange={(open) => setDescriptionModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Transaction Description</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {descriptionModal.transactionId && `ID: ${descriptionModal.transactionId}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {descriptionModal.type && (
              <div>
                <Badge variant={descriptionModal.type === 'INCOME' ? 'default' : 'secondary'}>
                  {descriptionModal.type}
                </Badge>
              </div>
            )}
            <div className="bg-gray-50 rounded p-4 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {descriptionModal.description || 'No description available.'}
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setDescriptionModal({ open: false, description: '', type: '', transactionId: '' })}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default TransactionHistory;
