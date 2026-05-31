import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DriverSalary from "@/models/DriverSalary";
import Driver from "@/models/Driver";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    await connectDB();
    const { driverId } = await params;
    
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    // Fetch driver
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    // Build query
    let query: any = { driverId };
    if (month) query.month = month;
    if (year) query.year = parseInt(year);

    // Get all salary records for the driver
    const salaryRecords = await DriverSalary.find(query);

    // Calculate totals
    const totalSalaryPaid = salaryRecords
      .filter((record) => record.type === "salary")
      .reduce((sum, record) => sum + record.amount, 0);

    const totalAdvanceTaken = salaryRecords
      .filter((record) => record.type === "advance")
      .reduce((sum, record) => sum + record.amount, 0);

    const monthlySalary = driver.monthlySalary || 0;
    const remainingBalance = monthlySalary - totalSalaryPaid - totalAdvanceTaken;

    const summary = {
      driverId: driver._id,
      driverName: driver.name,
      monthlySalary,
      totalSalaryPaid,
      totalAdvanceTaken,
      remainingBalance,
      month,
      year,
      recordCount: salaryRecords.length,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error fetching salary summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch salary summary" },
      { status: 500 }
    );
  }
}
