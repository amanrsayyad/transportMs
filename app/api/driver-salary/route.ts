import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DriverSalary from "@/models/DriverSalary";
import Driver from "@/models/Driver";
import Transaction from "@/models/Transaction";
import Expense from "@/models/Expense";
import Bank from "@/models/Bank";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const searchParams = request.nextUrl.searchParams;
    const driverId = searchParams.get("driverId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const type = searchParams.get("type");

    let query: any = {};

    if (driverId) {
      query.driverId = driverId;
    }
    if (month) {
      query.month = month;
    }
    if (year) {
      query.year = parseInt(year);
    }
    if (type) {
      query.type = type;
    }

    const salaries = await DriverSalary.find(query)
      .sort({ date: -1 })
      .populate("driverId", "name mobileNo monthlySalary")
      .populate("appUserId", "name")
      .populate("bankId", "name");

    return NextResponse.json(salaries);
  } catch (error) {
    console.error("Error fetching driver salaries:", error);
    return NextResponse.json(
      { error: "Failed to fetch driver salaries" },
      { status: 500 }
    );
  }
}

// Helper function to generate unique transaction ID
function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `TXN-DS-${timestamp}-${random}`;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();

    console.log("=== Driver Salary Create API ===");
    console.log("Request Body:", JSON.stringify(body, null, 2));

    // Fetch driver details
    const driver = await Driver.findById(body.driverId);
    if (!driver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    // Validate required fields for transaction/expense creation
    if (!body.appUserId) {
      return NextResponse.json(
        { error: "App User is required for creating transaction records" },
        { status: 400 }
      );
    }

    if (!body.bankId) {
      return NextResponse.json(
        { error: "Bank is required for creating transaction records" },
        { status: 400 }
      );
    }

    // Fetch bank details
    const bank = await Bank.findById(body.bankId);
    if (!bank) {
      return NextResponse.json(
        { error: "Bank not found" },
        { status: 404 }
      );
    }

    // Create salary record
    const salaryData = {
      ...body,
      driverName: driver.name,
      monthlySalary: driver.monthlySalary || 0,
    };

    const salary = new DriverSalary(salaryData);
    await salary.save();

    console.log("Created Salary Record:", JSON.stringify(salary, null, 2));

    // Create Transaction Record
    const transactionId = generateTransactionId();
    const transactionDescription = `Driver ${body.type === "salary" ? "Salary" : "Advance"} - ${driver.name} (${body.month} ${body.year})`;

    const transaction = new Transaction({
      transactionId,
      type: "EXPENSE",
      description: transactionDescription,
      amount: body.amount,
      fromBankId: body.bankId,
      appUserId: body.appUserId,
      relatedEntityId: salary._id,
      relatedEntityType: "DriverSalary",
      category: body.type === "salary" ? "Driver Salary" : "Driver Advance",
      status: "COMPLETED",
      balanceAfter: bank.balance - body.amount,
      date: new Date(body.date),
    });

    await transaction.save();
    console.log("Created Transaction:", JSON.stringify(transaction, null, 2));

    // Create Expense Record
    const expense = new Expense({
      appUserId: body.appUserId,
      bankId: body.bankId,
      category: body.type === "salary" ? "Driver Salary" : "Driver Advance",
      amount: body.amount,
      description: transactionDescription + (body.notes ? ` - ${body.notes}` : ""),
      date: new Date(body.date),
      transactionId: transaction._id,
    });

    await expense.save();
    console.log("Created Expense:", JSON.stringify(expense, null, 2));

    // Update bank balance
    bank.balance -= body.amount;
    await bank.save();
    console.log("Updated Bank Balance:", bank.balance);

    console.log("================================");

    // Return salary record with transaction and expense IDs
    const response = {
      ...salary.toObject(),
      transactionId: transaction._id,
      expenseId: expense._id,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating driver salary:", error);
    return NextResponse.json(
      { error: "Failed to create driver salary" },
      { status: 500 }
    );
  }
}
