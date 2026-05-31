import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

export interface DriverSalary {
  _id: string;
  driverId: string;
  driverName: string;
  monthlySalary: number;
  type: "salary" | "advance";
  amount: number;
  date: string;
  month: string;
  year: number;
  notes?: string;
  appUserId?: string;
  appUserName?: string;
  bankId?: string;
  bankName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverSalarySummary {
  driverId: string;
  driverName: string;
  monthlySalary: number;
  totalSalaryPaid: number;
  totalAdvanceTaken: number;
  remainingBalance: number;
  month?: string;
  year?: number;
  recordCount: number;
}

interface DriverSalaryState {
  salaries: DriverSalary[];
  currentSalary: DriverSalary | null;
  summary: DriverSalarySummary | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: DriverSalaryState = {
  salaries: [],
  currentSalary: null,
  summary: null,
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchDriverSalaries = createAsyncThunk(
  "driverSalary/fetchDriverSalaries",
  async (filters?: { driverId?: string; month?: string; year?: number; type?: string }) => {
    const params = new URLSearchParams();
    if (filters?.driverId) params.append("driverId", filters.driverId);
    if (filters?.month) params.append("month", filters.month);
    if (filters?.year) params.append("year", filters.year.toString());
    if (filters?.type) params.append("type", filters.type);

    const response = await fetch(`/api/driver-salary?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to fetch driver salaries");
    return response.json();
  }
);

export const fetchDriverSalarySummary = createAsyncThunk(
  "driverSalary/fetchDriverSalarySummary",
  async ({ driverId, month, year }: { driverId: string; month?: string; year?: number }) => {
    const params = new URLSearchParams();
    if (month) params.append("month", month);
    if (year) params.append("year", year.toString());

    const response = await fetch(`/api/driver-salary/summary/${driverId}?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to fetch salary summary");
    return response.json();
  }
);

export const createDriverSalary = createAsyncThunk(
  "driverSalary/createDriverSalary",
  async (salaryData: Partial<DriverSalary>) => {
    const response = await fetch("/api/driver-salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(salaryData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create salary record");
    }
    return response.json();
  }
);

export const updateDriverSalary = createAsyncThunk(
  "driverSalary/updateDriverSalary",
  async ({ id, data }: { id: string; data: Partial<DriverSalary> }) => {
    const response = await fetch(`/api/driver-salary/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update salary record");
    return response.json();
  }
);

export const deleteDriverSalary = createAsyncThunk(
  "driverSalary/deleteDriverSalary",
  async (id: string) => {
    const response = await fetch(`/api/driver-salary/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete salary record");
    return id;
  }
);

const driverSalarySlice = createSlice({
  name: "driverSalary",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentSalary: (state, action: PayloadAction<DriverSalary | null>) => {
      state.currentSalary = action.payload;
    },
    clearSummary: (state) => {
      state.summary = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch salaries
      .addCase(fetchDriverSalaries.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDriverSalaries.fulfilled, (state, action) => {
        state.isLoading = false;
        state.salaries = action.payload;
      })
      .addCase(fetchDriverSalaries.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch salaries";
      })
      // Fetch summary
      .addCase(fetchDriverSalarySummary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDriverSalarySummary.fulfilled, (state, action) => {
        state.isLoading = false;
        state.summary = action.payload;
      })
      .addCase(fetchDriverSalarySummary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch summary";
      })
      // Create salary
      .addCase(createDriverSalary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createDriverSalary.fulfilled, (state, action) => {
        state.isLoading = false;
        state.salaries.unshift(action.payload);
      })
      .addCase(createDriverSalary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to create salary record";
      })
      // Update salary
      .addCase(updateDriverSalary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateDriverSalary.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.salaries.findIndex(
          (salary) => salary._id === action.payload._id
        );
        if (index !== -1) {
          state.salaries[index] = action.payload;
        }
      })
      .addCase(updateDriverSalary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to update salary record";
      })
      // Delete salary
      .addCase(deleteDriverSalary.fulfilled, (state, action) => {
        state.salaries = state.salaries.filter(
          (salary) => salary._id !== action.payload
        );
      });
  },
});

export const { clearError, setCurrentSalary, clearSummary } = driverSalarySlice.actions;
export default driverSalarySlice.reducer;
