import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Customer from "@/models/Customer";

// GET categories for a specific customer's product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productName: string }> }
) {
  try {
    await connectDB();
    
    const { id, productName } = await params;
    const decodedProductName = decodeURIComponent(productName);
    
    // Find the specific customer
    const customer = await Customer.findById(id);
    
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Find the product within this customer
    const product = customer.products.find(
      (p: any) => p.productName === decodedProductName
    );

    if (!product) {
      return NextResponse.json(
        { error: "Product not found for this customer" },
        { status: 404 }
      );
    }

    // Return categories for this specific customer's product
    const categories = product.categories || [];
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
