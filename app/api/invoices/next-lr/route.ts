import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import AppUser from '@/models/AppUser';

export const dynamic = 'force-dynamic';

// LR prefix mapping per user name
const LR_PREFIX_MAP: Record<string, string> = {
    'Riyaj Sayyad': 'RS',
    'Asif Sayyad': 'AS',
    'Rahiman Sayyad': 'RD',
    'Rehiman Sayyad': 'RD',
    'RDS Transport': 'RDS',
    'KGN Trading': 'KGN',
};

export async function GET(request: NextRequest) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const appUserId = searchParams.get('appUserId');

        if (!appUserId) {
            return NextResponse.json({ error: 'App User ID is required' }, { status: 400 });
        }

        // Resolve user name to get prefix
        let prefix = 'LR'; // Default fallback
        const appUser = await AppUser.findById(appUserId);
        if (appUser && appUser.name) {
            const userName = appUser.name.trim();
            prefix = LR_PREFIX_MAP[userName] || 'LR';
        }

        // Find the latest invoice with this prefix pattern (e.g., RS00001, KGN00001)
        const latestInvoice = await Invoice.findOne({
            lrNo: { $regex: new RegExp(`^${prefix}\\d+$`) }
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
        const nextLr = `${prefix}${nextNumber.toString().padStart(5, '0')}`;

        return NextResponse.json({ nextLr, prefix });
    } catch (error) {
        console.error('Error fetching next LR:', error);
        return NextResponse.json({ error: 'Failed to generate LR Number' }, { status: 500 });
    }
}
