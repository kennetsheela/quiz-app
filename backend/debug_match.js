const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');

// Ensure we find the models
const Event = require('./models/Event');
const User = require('./models/User');

async function checkMatch() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/quiz-app');

        console.log('--- RECENT EVENTS ---');
        const events = await Event.find().sort({ createdAt: -1 }).limit(3);
        if (events.length === 0) console.log('No events found.');
        events.forEach(e => {
            console.log(`Event: ${e.eventName}`);
            console.log(`  Id: ${e._id}`);
            console.log(`  InstitutionId: ${e.institutionId}`);
            console.log(`  TargetDepartments: ${JSON.stringify(e.targetDepartments)}`);
            console.log(`  TargetBatches: ${JSON.stringify(e.targetBatches)}`);
            console.log(`  Visibility: ${e.visibility}`);
            console.log(`  Status: ${e.status}`);
        });

        console.log('\n--- SAMPLE STUDENTS ---');
        const students = await User.find({ role: 'student' }).limit(3);
        if (students.length === 0) console.log('No students found.');
        students.forEach(s => {
            console.log(`Student: ${s.username}`);
            console.log(`  Id: ${s._id}`);
            console.log(`  InstitutionId: ${s.institutionId}`);
            console.log(`  Department: ${s.department}`);
            console.log(`  BatchId: ${s.batchId}`);
        });

        console.log('\n--- ATTEMPTING TO MATCH ---');
        if (events.length > 0 && students.length > 0) {
            const event = events[0];
            const student = students[0];

            console.log(`Testing Match: Event ${event.eventName} vs Student ${student.username}`);

            const instMatch = event.institutionId && student.institutionId && event.institutionId.toString() === student.institutionId.toString();
            console.log(`  InstitutionId Match: ${instMatch} (${event.institutionId} vs ${student.institutionId})`);

            const deptMatch = !event.targetDepartments || event.targetDepartments.length === 0 || event.targetDepartments.includes(student.department);
            console.log(`  Department Match: ${deptMatch} (${JSON.stringify(event.targetDepartments)} includes ${student.department})`);

            const batchMatch = !event.targetBatches || event.targetBatches.length === 0 || event.targetBatches.some(b => b.toString() === student.batchId.toString());
            console.log(`  Batch Match: ${batchMatch} (${JSON.stringify(event.targetBatches)} includes ${student.batchId})`);

            console.log(`  Overall Filter Result: ${instMatch && deptMatch && batchMatch}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkMatch();
