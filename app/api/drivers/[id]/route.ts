import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Driver from "@/models/Driver";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const driver = await Driver.findById(id);

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    return NextResponse.json(driver);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch driver" },
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

    console.log("=== Driver Update API ===");
    console.log("Driver ID:", id);
    console.log("Request Body:", JSON.stringify(body, null, 2));
    console.log("monthlySalary value:", body.monthlySalary);
    console.log("monthlySalary type:", typeof body.monthlySalary);

    // Find the driver first to see current state
    const existingDriver = await Driver.findById(id);
    console.log("Existing Driver before update:", JSON.stringify(existingDriver, null, 2));

    // Update with explicit field setting
    const updateData = {
      name: body.name,
      mobileNo: body.mobileNo,
      status: body.status,
      monthlySalary: body.monthlySalary,
    };
    
    console.log("Update data being applied:", JSON.stringify(updateData, null, 2));

    const driver = await Driver.findByIdAndUpdate(
      id, 
      { $set: updateData },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    console.log("Updated Driver:", JSON.stringify(driver, null, 2));
    console.log("Updated Driver monthlySalary:", driver.monthlySalary);
    console.log("========================");

    return NextResponse.json(driver);
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json(
      { error: "Failed to update driver" },
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
    const driver = await Driver.findByIdAndDelete(id);

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Driver deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete driver" },
      { status: 500 }
    );
  }
}
