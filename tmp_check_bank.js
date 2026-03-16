
const mongoose = require('mongoose');
require('dotenv').config();

async function checkBank() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quiz-app');
        const QuestionBank = require('./backend/models/QuestionBank');

        const count = await QuestionBank.countDocuments();
        console.log('Total questions in Bank:', count);

        const categories = await QuestionBank.distinct('category');
        console.log('Categories:', categories);

        const sample = await QuestionBank.findOne();
        if (sample) {
            console.log('Sample Question Category:', sample.category);
            console.log('Sample Question Level:', sample.level);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkBank();
