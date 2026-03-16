const mongoose = require('mongoose');
const QuestionBank = require('./backend/models/QuestionBank');

async function checkIds() {
    try {
        const mongoUri = 'mongodb+srv://quizuser:Sheela2006%40@quizcluster.iowfcru.mongodb.net/quiz_app1?appName=quizCluster';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const count = await QuestionBank.countDocuments();
        console.log('Total questions:', count);

        const questions = await QuestionBank.find({}, { questionID: 1 }).lean();
        const ids = questions.map(q => q.questionID);
        const uniqueIds = new Set(ids);

        console.log('Unique IDs:', uniqueIds.size);

        if (ids.length !== uniqueIds.size) {
            console.error('⚠️ Duplicate IDs found!');
            const seen = new Set();
            const dups = [];
            for (const id of ids) {
                if (seen.has(id)) dups.push(id);
                else seen.add(id);
            }
            console.log('Duplicates:', dups.slice(0, 10));
        }

        const missingIds = questions.filter(q => !q.questionID);
        console.log('Questions missing ID:', missingIds.length);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkIds();
