import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DriverSalary from "@/models/DriverSalary";
import Driver from "@/models/Driver";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const salary = await DriverSalary.findById(id)
      .populate("driverId", "name mobileNo monthlySalary")
      .populate("appUserId", "name")
      .populate("bankId", "name");

    if (!salary) {
      return NextResponse.json(
        { error: "Salary record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(salary);
  } catch (error) {
    console.error("Error fetching salary record:", error);
    return NextResponse.json(
      { error: "Failed to fetch salary record" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    console.log("=== Driver Salary Update API ===");
    console.log("Salary ID:", id);
    console.log("Request Body:", JSON.stringify(body, null, 2));

    // If driver changed, fetch new driver details
    if (body.driverId) {
      const driver = await Driver.findById(body.driverId);
      if (!driver) {
        return NextResponse.json(
          { error: "Driver not found" },
          { status: 404 }
        );
      }
      body.driverName = driver.name;
      body.monthlySalary = driver.monthlySalary || 0;
    }

    const salary = await DriverSalary.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    );

    if (!salary) {
      return NextResponse.json(
        { error: "Salary record not found" },
        { status: 404 }
      );
    }

    console.log("Updated Salary Record:", JSON.stringify(salary, null, 2));
    console.log("====================================");

    return NextResponse.json(salary);
  } catch (error) {
    console.error("Error updating salary record:", error);
    return NextResponse.json(
      { error: "Failed to update salary record" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const salary = await DriverSalary.findByIdAndDelete(id);

    if (!salary) {
      return NextResponse.json(
        { error: "Salary record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Salary record deleted successfully" });
  } catch (error) {
    console.error("Error deleting salary record:", error);
    return NextResponse.json(
      { error: "Failed to delete salary record" },
      { status: 500 }
    );
  }
}
