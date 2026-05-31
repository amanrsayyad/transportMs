import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Types
export interface SubTransaction {
  invoiceId: string;
  lrNo: string;
  customerName: string;
  amount: number;
}

export interface Transaction {
  _id: string;
  transactionId: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'FUEL' | 'DRIVER_BUDGET' | 'BANK_UPDATE';
  description: string;
  amount: number;
  fromBankId?: {
    _id: string;
    bankName: string;
    accountNumber: string;
  };
  toBankId?: {
    _id: string;
    bankName: string;
    accountNumber: string;
  };
  appUserId: {
    _id: string;
    name: string;
    email: string;
  };
  relatedEntityId?: string;
  relatedEntityType?: string;
  subTransactions?: SubTransaction[];
  category?: string;
  invoiceNo?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  balanceAfter: number;
  date: string;
  createdAt: string;
  updatedAt: string;
}

interface TransactionState {
  transactions: Transaction[];
  currentTransaction: Transaction | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    type?: string;
    appUserId?: string;
    startDate?: string;
    endDate?: string;
    customerName?: string;
    invoiceNo?: string;
  };
}

const initialState: TransactionState = {
  transactions: [],
  currentTransaction: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {},
};

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (params: {
    page?: number;
    limit?: number;
    type?: string;
    appUserId?: string;
    startDate?: string;
    endDate?: string;
    customerName?: string;
    invoiceNo?: string;
  } = {}, { rejectWithValue }) => {
    try {
      const queryParams = new URLSearchParams();
      
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.type) queryParams.append('type', params.type);
      if (params.appUserId) queryParams.append('appUserId', params.appUserId);
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      if (params.customerName) queryParams.append('customerName', params.customerName);
      if (params.invoiceNo) queryParams.append('invoiceNo', params.invoiceNo);
      
      const response = await fetch(`/api/transactions?${queryParams.toString()}`);
      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error || 'Failed to fetch transactions');
      }
      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

// Slice
const transactionSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    setCurrentTransaction: (state, action) => {
      state.currentTransaction = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = {};
    },
    setPagination: (state, action) => {
      state.pagination = { ...state.pagination, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = action.payload.transactions;
        state.pagination = {
          page: action.payload.pagination.page,
          limit: action.payload.pagination.limit,
          total: action.payload.pagination.total,
          totalPages: action.payload.pagination.pages,
        };
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { 
  setCurrentTransaction, 
  clearError, 
  setFilters, 
  clearFilters, 
  setPagination 
} = transactionSlice.actions;
export default transactionSlice.reducer;
