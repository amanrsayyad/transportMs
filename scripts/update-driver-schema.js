/**
 * Script to add monthlySalary field to existing driver documents
 * Run this if the field is not being saved even after server restart
 * 
 * Usage:
 * 1. Make sure your .env.local has MONGODB_URI
 * 2. Run: node scripts/update-driver-schema.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI not found in .env.local');
  process.exit(1);
}

// Define the Driver schema
const driverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobileNo: { type: String, required: true },
  monthlySalary: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'inactive', 'on-leave'], default: 'active' },
}, { timestamps: true });

const Driver = mongoose.model('Driver', driverSchema);

async function updateDriverSchema() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check how many drivers don't have monthlySalary field
    const driversWithoutSalary = await Driver.countDocuments({
      monthlySalary: { $exists: false }
    });

    console.log(`\n📊 Found ${driversWithoutSalary} drivers without monthlySalary field`);

    if (driversWithoutSalary === 0) {
      console.log('✅ All drivers already have monthlySalary field');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Update all drivers without monthlySalary field
    console.log('\n🔄 Updating drivers...');
    const result = await Driver.updateMany(
      { monthlySalary: { $exists: false } },
      { $set: { monthlySalary: 0 } }
    );

    console.log(`✅ Updated ${result.modifiedCount} drivers`);

    // Verify the update
    const remainingWithoutSalary = await Driver.countDocuments({
      monthlySalary: { $exists: false }
    });

    console.log(`\n📊 Verification:`);
    console.log(`   - Drivers updated: ${result.modifiedCount}`);
    console.log(`   - Drivers still missing field: ${remainingWithoutSalary}`);

    // Show sample of updated drivers
    const sampleDrivers = await Driver.find({}).limit(3).select('name mobileNo monthlySalary');
    console.log(`\n📋 Sample drivers after update:`);
    sampleDrivers.forEach(driver => {
      console.log(`   - ${driver.name}: monthlySalary = ${driver.monthlySalary}`);
    });

    console.log('\n✅ Schema update completed successfully!');
    console.log('💡 You can now restart your dev server and test the update');

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error updating driver schema:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the update
updateDriverSchema();
