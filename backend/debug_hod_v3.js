
const mongoose = require('mongoose');
const User = require('./models/User');
const Department = require('./models/Department');

const MONGO_URI = 'mongodb+srv://quizuser:Sheela2006%40@quizcluster.iowfcru.mongodb.net/quiz_app1?appName=quizCluster';

async function debugHOD() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to Atlas DB');

        const hods = await User.find({ role: 'hod' }).limit(10);
        console.log('\n--- HOD Records ---');
        for (const hod of hods) {
            console.log(`Email: ${hod.email}, InstID: ${hod.institutionId}, DeptID: ${hod.hodDepartmentId}`);
            if (hod.hodDepartmentId) {
                const dept = await Department.findById(hod.hodDepartmentId);
                if (dept) {
                    console.log(`  Dept Name: "${dept.name}", Code: "${dept.code}"`);

                    const queryRegex = {
                        institutionId: hod.institutionId,
                        department: { $in: [new RegExp(`^${dept.name}$`, 'i'), new RegExp(`^${dept.code}$`, 'i')] },
                        role: 'student'
                    };
                    const studentCountRegex = await User.countDocuments(queryRegex);
                    console.log(`  Matched Students (Regex query: ${JSON.stringify(queryRegex.department)}): ${studentCountRegex}`);

                    const totalInstStudents = await User.countDocuments({
                        institutionId: hod.institutionId,
                        role: 'student'
                    });
                    console.log(`  Total Students in this Institution: ${totalInstStudents}`);
                } else {
                    console.log('  Dept NOT FOUND');
                }
            }
            console.log('------------------');
        }

        const students = await User.find({ role: 'student' }).sort({ createdAt: -1 }).limit(10);
        console.log('\n--- Recent Student Records ---');
        for (const s of students) {
            console.log(`Email: ${s.email}, InstID: ${s.institutionId}, Dept: "${s.department}"`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugHOD();
