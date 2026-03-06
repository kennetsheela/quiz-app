// scripts/checkBank.js - Run with: node scripts/checkBank.js
require('dotenv').config();
const mongoose = require('mongoose');
const QuestionBank = require('../models/QuestionBank');
const Event = require('../models/Event');

async function checkBank() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // 1. Check question bank
        const totalQuestions = await QuestionBank.countDocuments();
        console.log('=== QUESTION BANK ===');
        console.log('Total questions:', totalQuestions);

        if (totalQuestions > 0) {
            const categories = await QuestionBank.distinct('category');
            const levels = await QuestionBank.distinct('level');
            console.log('Categories in DB:', categories);
            console.log('Levels in DB:', levels);

            const sample = await QuestionBank.findOne();
            console.log('\nSample question:');
            console.log('  category:', sample.category);
            console.log('  level:', sample.level);
            console.log('  topic:', sample.topic);
            console.log('  question:', sample.question.substring(0, 80) + '...');
        } else {
            console.log('⚠️  Question bank is EMPTY! No questions to pick from.');
            console.log('   HOD events using "Random from Bank" or "Specific Quiz Set" will have 0 questions.');
        }

        // 2. Check recent events and their question counts
        console.log('\n=== RECENT EVENTS ===');
        const recentEvents = await Event.find({}).sort({ createdAt: -1 }).limit(5);
        for (const ev of recentEvents) {
            const totalQ = ev.sets.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
            console.log(`Event: "${ev.eventName}" | Sets: ${ev.sets.length} | Total Qs: ${totalQ} | createdBy: ${ev.createdByRole}`);
            ev.sets.forEach((s, i) => {
                console.log(`  Set[${i}]: "${s.setName}" | Questions: ${s.questions?.length || 0}`);
            });
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

checkBank();
