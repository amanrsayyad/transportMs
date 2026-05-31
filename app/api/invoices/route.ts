import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Customer from '@/models/Customer';
import Vehicle from '@/models/Vehicle';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const customerName = searchParams.get('customerName');
    const lrNo = searchParams.get('lrNo');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const appUserId = searchParams.get('appUserId');
    const vehicleNo = searchParams.get('vehicleNo');

    const skip = (page - 1) * limit;

    // Build filter object
    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (customerName && customerName !== 'all') {
      // Check both customerName and companyName from Customer model
      // since invoices might store either value
      const matchingCustomers = await Customer.find({
        $or: [
          { customerName: { $regex: customerName, $options: 'i' } },
          { companyName: { $regex: customerName, $options: 'i' } }
        ]
      }).lean();
      
      // Get all possible names (both customerName and companyName)
      const customerNames = new Set<string>();
      matchingCustomers.forEach((c: any) => {
        if (c.customerName) customerNames.add(c.customerName);
        if (c.companyName) customerNames.add(c.companyName);
      });
      
      // If we found matching customers, filter by any of their names
      if (customerNames.size > 0) {
        filter.customerName = { $in: Array.from(customerNames) };
      } else {
        // Fallback to regex search if no customer found
        filter.customerName = { $regex: customerName, $options: 'i' };
      }
    }
    if (lrNo) {
      filter.lrNo = { $regex: lrNo, $options: 'i' };
    }
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) {
        const start = new Date(fromDate);
        filter.date.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    if (appUserId && appUserId !== 'all') {
      filter.appUserId = appUserId;
    }
    // Filter by vehicle/truck number in rows
    if (vehicleNo && vehicleNo !== 'all') {
      filter['rows.truckNo'] = { $regex: vehicleNo, $options: 'i' };
    }

    const invoices = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Invoice.countDocuments(filter);

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    // LR prefix mapping per user
    const LR_PREFIX_MAP: Record<string, string> = {
      'Riyaj Sayyad': 'RS',
      'Asif Sayyad': 'AS',
      'Rahiman Sayyad': 'RD',
      'Rehiman Sayyad': 'RD',
      'RDS Transport': 'RDS',
      'KGN Trading': 'KGN',
    };

    // Auto-generate LR number based on appUserId
    if (!body.lrNo || body.lrNo.trim() === '') {
      let prefix = 'LR'; // Default fallback prefix

      // Resolve user name from appUserId
      if (body.appUserId) {
        const AppUser = (await import('@/models/AppUser')).default;
        const appUser = await AppUser.findById(body.appUserId);
        if (appUser && appUser.name) {
          const userName = appUser.name.trim();
          prefix = LR_PREFIX_MAP[userName] || 'LR';
        }
      }

      // Find the latest invoice with this prefix and get the next number
      const latestInvoice = await Invoice.findOne({
        lrNo: { $regex: `^${prefix}\\d+$` }
      }).sort({ lrNo: -1 });

      let nextNumber = 1;
      if (latestInvoice && latestInvoice.lrNo) {
        // Extract the numeric part after the prefix
        const numericPart = latestInvoice.lrNo.replace(prefix, '');
        const parsed = parseInt(numericPart, 10);
        if (!isNaN(parsed)) {
          nextNumber = parsed + 1;
        }
      }

      // Pad to 5 digits (e.g., RS00001, KGN00001)
      const padLength = prefix.length <= 2 ? 5 : 5;
      body.lrNo = `${prefix}${nextNumber.toString().padStart(padLength, '0')}`;
    }

    // Validate required fields
    const requiredFields = ['date', 'from', 'to', 'customerName'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Validate rows
    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json(
        { error: 'At least one row is required' },
        { status: 400 }
      );
    }

    // Validate each row
    for (const row of body.rows) {
      if (!row.product || !row.truckNo) {
        return NextResponse.json(
          { error: 'Product and truck number are required for each row' },
          { status: 400 }
        );
      }
    }

    // Calculate totals for each row
    body.rows.forEach((row: any) => {
      if (row.weight && row.rate) {
        row.total = row.weight * row.rate;
      }
    });

    // Calculate base total and tax
    const baseTotal = body.rows.reduce((sum: number, row: any) => sum + (row.total || 0), 0);
    const taxPercent = body.taxPercent !== undefined && body.taxPercent !== null
      ? Number(body.taxPercent)
      : 0;
    const taxAmount = taxPercent > 0 ? Math.round((baseTotal * taxPercent) / 100) : 0;
    body.taxPercent = taxPercent;
    body.taxAmount = taxAmount;
    // Final total includes tax amount
    body.total = Math.round(baseTotal + taxAmount);

    // Support advance and remaining
    const advanceAmounts = Array.isArray(body.advanceAmounts)
      ? body.advanceAmounts.map((a: any) => ({ label: String(a?.label || ''), amount: Number(a?.amount || 0) }))
      : [];
    body.advanceAmounts = advanceAmounts;
    const advanceAmount = advanceAmounts.length > 0
      ? Math.round(advanceAmounts.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0))
      : Math.round(Number(body.advanceAmount || 0));
    body.advanceAmount = advanceAmount;
    body.remainingAmount = Math.round(Math.max(0, body.total - advanceAmount));

    const invoice = new Invoice(body);
    await invoice.save();

    return NextResponse.json(invoice, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);

    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'LR number already exists' },
        { status: 400 }
      );
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return NextResponse.json(
        { error: messages.join(', ') },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}