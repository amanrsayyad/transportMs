import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Trip from '@/models/Trip';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type');
    const appUserId = searchParams.get('appUserId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const customerName = searchParams.get('customerName');
    const invoiceNo = searchParams.get('invoiceNo');

    const filter: any = {};
    
    console.log('=== Transaction Filter Debug ===');
    console.log('type parameter:', type);
    
    if (type) {
      // Handle multiple types (comma-separated)
      const types = type.split(',').map(t => t.trim()).filter(Boolean);
      console.log('parsed types:', types);
      if (types.length > 1) {
        filter.type = { $in: types };
      } else if (types.length === 1) {
        filter.type = types[0];
      }
      console.log('filter.type set to:', filter.type);
    }
    
    if (appUserId) {
      filter.appUserId = appUserId;
    }
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }
    
    if (invoiceNo) {
      // Search in invoiceNo field or in description for invoice numbers
      filter.$or = [
        { invoiceNo: { $regex: invoiceNo, $options: 'i' } },
        { description: { $regex: invoiceNo, $options: 'i' } }
      ];
    }
    
    if (customerName) {
      const matchingTrips = await Trip.find(
        { 'routeWiseExpenseBreakdown.customerName': customerName },
        'tripId'
      ).lean();
      
      const tripIds = Array.from(new Set((matchingTrips || []).map((t: any) => t.tripId).filter(Boolean)));
      
      // Only set default type filter if user hasn't specified types
      console.log('customerName filter - type param:', type);
      if (!type) {
        filter.type = { $in: ['INCOME', 'EXPENSE', 'BANK_UPDATE', 'DRIVER_BUDGET'] };
        console.log('Set default types for customer');
      } else {
        console.log('User specified types, keeping them');
      }
      
      if (tripIds.length > 0) {
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = `trip\\s+(?:${tripIds.map(esc).join('|')})\\b`;
        filter.description = { $regex: new RegExp(pattern, 'i') };
      } else {
        return NextResponse.json({
          transactions: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0
          }
        });
      }
    }

    const skip = (page - 1) * limit;

    console.log('Final MongoDB filter:', JSON.stringify(filter, null, 2));

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('fromBankId', 'bankName accountNumber')
        .populate('toBankId', 'bankName accountNumber')
        .populate('appUserId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter)
    ]);

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
