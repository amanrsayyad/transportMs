import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Bank from '@/models/Bank';
import Income from '@/models/Income';
import Transaction from '@/models/Transaction';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      invoiceIds,
      status,
      bankId,
      appUserId,
      category,
      description,
      date,
      lumpsumAmount
    } = body;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { error: 'invoiceIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!['Paid', 'Unpaid'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be Paid or Unpaid' },
        { status: 400 }
      );
    }

    // For marking as Paid, require bank and app user info
    if (status === 'Paid') {
      if (!bankId || !appUserId) {
        return NextResponse.json(
          { error: 'bankId and appUserId are required to mark invoices as Paid' },
          { status: 400 }
        );
      }
      const bank = await Bank.findById(bankId);
      if (!bank) {
        return NextResponse.json(
          { error: 'Bank not found' },
          { status: 404 }
        );
      }
    }

    // Fetch invoices
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } });
    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        { error: 'No invoices found for provided IDs' },
        { status: 404 }
      );
    }

    const processed: any[] = [];
    const nowDate = date ? new Date(date) : new Date();
    const defaultCategory = category || 'Invoice Payment';

    // Accumulate data for combined transaction when marking Paid
    let totalAmountToCredit = 0;
    const subTransactions: { invoiceId: any; lrNo: string; customerName: string; amount: number; advanceAmount: number; remainingAmount: number; from: string; to: string; date: Date }[] = [];
    const incomeIds: any[] = [];
    
    // Calculate total advance amount from ALL selected invoices
    const totalAdvanceAmount = invoices.reduce((sum, inv) => {
      return sum + Math.round(inv.advanceAmount || 0);
    }, 0);
    
    // Calculate total remaining amount from invoices with advance > 0 (for consolidated invoice rows)
    const totalRemainingAmount = invoices.reduce((sum, inv) => {
      const advanceAmount = inv.advanceAmount || 0;
      if (advanceAmount > 0) {
        const remaining = Math.round(Math.max(0, (inv.remainingAmount || ((inv.total || 0) - advanceAmount))));
        return sum + remaining;
      }
      return sum;
    }, 0);
    
    // Determine if lumpsum payment is being used
    const isLumpsumPayment = lumpsumAmount !== undefined && lumpsumAmount > 0;
    const lumpsumValue = isLumpsumPayment ? Number(lumpsumAmount) : 0;
    // Balance = Lumpsum - Total Advance Amount
    const remainingLumpsumAmount = isLumpsumPayment 
      ? Math.max(0, lumpsumValue - totalAdvanceAmount) 
      : 0;

    for (const inv of invoices) {
      // Update invoice status
      inv.status = status as any;

      // If marking Paid, create income record and accumulate for combined transaction
      if (status === 'Paid') {
        const invoiceAdvanceAmount = inv.advanceAmount || 0;
        const amountToCredit = Math.round(Math.max(0, (inv.remainingAmount || ((inv.total || 0) - invoiceAdvanceAmount))));

        // Only create income if there is a positive amount
        if (amountToCredit > 0) {
          // Create individual income record
          const income = new Income({
            appUserId,
            bankId,
            category: defaultCategory,
            amount: amountToCredit,
            description: description || `Payment received for invoice ${inv.lrNo}`,
            date: nowDate,
          });
          await income.save();
          incomeIds.push(income._id);

          // Accumulate for combined transaction
          totalAmountToCredit += amountToCredit;
          
          // Only add to subTransactions if invoice has advance > 0 (for consolidated invoice)
          if (invoiceAdvanceAmount > 0) {
            subTransactions.push({
              invoiceId: inv._id,
              lrNo: inv.lrNo || '',
              customerName: inv.customerName || '',
              amount: amountToCredit,
              advanceAmount: invoiceAdvanceAmount,
              remainingAmount: amountToCredit,
              from: inv.from || '',
              to: inv.to || '',
              date: inv.date || nowDate,
            });
          }
        }
      }

      await inv.save();
      processed.push(inv);
    }

    // Create ONE combined transaction if there are amounts to credit
    if (status === 'Paid' && totalAmountToCredit > 0) {
      // Update bank balance once with total sum (or lumpsum if provided)
      const amountToAddToBank = isLumpsumPayment ? lumpsumValue : totalAmountToCredit;
      await Bank.findByIdAndUpdate(bankId, { $inc: { balance: amountToAddToBank } });
      const updatedBank = await Bank.findById(bankId);

      const lrNumbers = subTransactions.map(s => s.lrNo).filter(Boolean).join(', ');
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const transaction = new Transaction({
        transactionId,
        type: 'INCOME',
        description: description || (subTransactions.length === 1
          ? `Payment received for Invoice ${lrNumbers}`
          : `Bulk Invoice Payment - ${subTransactions.length} invoices (${lrNumbers})`),
        amount: amountToAddToBank,
        toBankId: bankId,
        appUserId,
        relatedEntityType: subTransactions.length > 1 ? 'BULK_INVOICE' : 'Income',
        relatedEntityId: incomeIds.length === 1 ? incomeIds[0] : undefined,
        subTransactions: subTransactions.length > 1 ? subTransactions : [],
        category: defaultCategory,
        balanceAfter: updatedBank?.balance || 0,
        date: nowDate,
        invoiceNo: lrNumbers, // Add invoice number for filtering
      });
      await transaction.save();

      // Back-reference transaction from all income records
      for (const incomeId of incomeIds) {
        await Income.findByIdAndUpdate(incomeId, { transactionId: transaction._id });
      }
      
      // Generate consolidated invoice if lumpsum payment is used and there are invoices with advance
      let consolidatedInvoice = null;
      if (isLumpsumPayment && subTransactions.length > 0 && remainingLumpsumAmount > 0) {
        // Get unique customer name from selected invoices
        const customerNames = [...new Set(subTransactions.map(s => s.customerName).filter(Boolean))];
        const customerName = customerNames.length === 1 ? customerNames[0] : 'Multiple Customers';
        
        // Generate LR number for consolidated invoice
        const AppUser = (await import('@/models/AppUser')).default;
        const appUser = await AppUser.findById(appUserId);
        const LR_PREFIX_MAP: Record<string, string> = {
          'Riyaj Sayyad': 'RS',
          'Asif Sayyad': 'AS',
          'Rahiman Sayyad': 'RD',
          'Rehiman Sayyad': 'RD',
          'RDS Transport': 'RDS',
          'KGN Trading': 'KGN',
        };
        let lrPrefix = 'LR';
        if (appUser && appUser.name) {
          lrPrefix = LR_PREFIX_MAP[appUser.name.trim()] || 'LR';
        }
        
        const latestInvoice = await Invoice.findOne({
          lrNo: { $regex: new RegExp(`^${lrPrefix}\\d+$`) }
        }).sort({ lrNo: -1 });
        
        let currentMax = 0;
        if (latestInvoice && latestInvoice.lrNo) {
          const numericPart = latestInvoice.lrNo.replace(lrPrefix, '');
          const parsed = parseInt(numericPart, 10);
          if (!isNaN(parsed)) currentMax = parsed;
        }
        const nextLrNo = `${lrPrefix}${String(currentMax + 1).padStart(5, '0')}`;
        
        // Create rows from selected invoices with actual weight and rate
        const consolidatedRows = await Promise.all(
          subTransactions.map(async (sub) => {
            // Fetch the full invoice to get weight and rate from rows
            const fullInvoice = await Invoice.findById(sub.invoiceId);
            
            // Calculate total weight and average rate from all rows
            let totalWeight = 0;
            let totalValue = 0;
            
            if (fullInvoice && fullInvoice.rows && fullInvoice.rows.length > 0) {
              fullInvoice.rows.forEach((row: any) => {
                const weight = Number(row.weight || 0);
                const rate = Number(row.rate || 0);
                totalWeight += weight;
                totalValue += weight * rate;
              });
            }
            
            // Calculate average rate
            const avgRate = totalWeight > 0 ? Math.round(totalValue / totalWeight) : 0;
            
            // Format product name to show advance and remaining amounts
            const productName = sub.advanceAmount > 0 
              ? `Invoice ${sub.lrNo} (Advance: ₹${sub.advanceAmount}, Remaining: ₹${sub.remainingAmount})`
              : `Invoice ${sub.lrNo}`;
            
            return {
              product: productName,
              truckNo: `${sub.from} to ${sub.to}`,
              articles: new Date(sub.date).toLocaleDateString('en-GB'),
              weight: totalWeight,
              rate: avgRate,
              total: sub.remainingAmount, // Use remaining amount instead of full amount
              remarks: sub.customerName,
            };
          })
        );
        
        // Create consolidated invoice
        consolidatedInvoice = await Invoice.create({
          date: nowDate,
          from: 'Multiple Locations',
          to: 'Multiple Locations',
          customerName,
          lrNo: nextLrNo,
          rows: consolidatedRows,
          total: totalRemainingAmount,
          advanceAmount: lumpsumValue,
          remainingAmount: remainingLumpsumAmount,
          appUserId,
          bankId,
          status: remainingLumpsumAmount > 0 ? 'Unpaid' : 'Paid',
          remarks: `Consolidated invoice for ${subTransactions.length} invoices. Lumpsum payment: ₹${lumpsumValue}`,
        });
      }
      
      return NextResponse.json({
        updatedCount: processed.length,
        invoices: processed,
        consolidatedInvoice,
        lumpsumDetails: isLumpsumPayment ? {
          lumpsumAmount: lumpsumValue,
          totalInvoiceAmount: totalRemainingAmount,
          remainingAmount: remainingLumpsumAmount,
        } : null,
      });
    }

    return NextResponse.json({
      updatedCount: processed.length,
      invoices: processed,
    });
  } catch (error) {
    console.error('Bulk status update error:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice statuses' },
      { status: 500 }
    );
  }
}