// scripts/deleteEmptyEvents.js
// Run with: node scripts/deleteEmptyEvents.js
// This removes HOD-created events that have NO questions so they can be recreated.
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

async function deleteEmptyEvents() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find HOD events with 0 questions in all sets
        const hodEvents = await Event.find({ createdByRole: 'hod' });
        const emptyEvents = hodEvents.filter(ev => {
            const totalQ = ev.sets.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
            return totalQ === 0;
        });

        if (emptyEvents.length === 0) {
            console.log('✅ No empty HOD events found. Nothing to delete.');
            await mongoose.disconnect();
            process.exit(0);
        }

        console.log(`Found ${emptyEvents.length} empty HOD event(s) to delete:`);
        for (const ev of emptyEvents) {
            console.log(`  - "${ev.eventName}" (created: ${ev.createdAt.toLocaleString()})`);
        }

        const ids = emptyEvents.map(ev => ev._id);
        const result = await Event.deleteMany({ _id: { $in: ids } });
        console.log(`\n✅ Deleted ${result.deletedCount} empty event(s).`);
        console.log('   You can now recreate them in the HOD dashboard using the Upload method.');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

deleteEmptyEvents();
