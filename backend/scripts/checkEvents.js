// scripts/checkEvents.js - Run with: node scripts/checkEvents.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

async function checkEvents() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const events = await Event.find({ createdByRole: 'hod' }).sort({ createdAt: -1 }).limit(10);
        console.log(`Found ${events.length} HOD events:\n`);
        for (const ev of events) {
            const totalQ = ev.sets.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
            console.log(`──────────────────────────────────────`);
            console.log(`Name:       ${ev.eventName}`);
            console.log(`Status:     ${ev.status}`);
            console.log(`Category:   ${ev.category}`);
            console.log(`Questions:  ${totalQ}`);
            console.log(`Visibility: ${ev.visibility}`);
            console.log(`TargetDepts:`, ev.targetDepartments);
            console.log(`startTime:  ${ev.startTime}`);
            console.log(`endTime:    ${ev.endTime}`);
            console.log(`createdAt:  ${ev.createdAt}`);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

checkEvents();
