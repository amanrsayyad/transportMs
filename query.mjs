import mongoose from 'mongoose';

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/transport-sass');
    const Invoice = mongoose.model('Invoice', new mongoose.Schema({}, { strict: false, collection: 'invoices' }));
    const docs = await Invoice.find().sort({ _id: -1 }).limit(2);
    console.log(JSON.stringify(docs, null, 2));
    process.exit(0);
}
run();
