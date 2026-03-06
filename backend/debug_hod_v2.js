
const mongoose = require('mongoose');
const User = require('./models/User');
const Department = require('./models/Department');

async function debugHOD() {
    try {
        await mongoose.connect('mongodb://localhost:27017/quiz_app1');
        console.log('Connected to DB');

        const hods = await User.find({ role: 'hod' }).limit(5);
        console.log('\n--- HOD Records ---');
        for (const hod of hods) {
            console.log(`Email: ${hod.email}, InstID: ${hod.institutionId}, DeptID: ${hod.hodDepartmentId}`);
            if (hod.hodDepartmentId) {
                const dept = await Department.findById(hod.hodDepartmentId);
                if (dept) {
                    console.log(`  Dept Name: "${dept.name}", Code: "${dept.code}"`);

                    // Count students for this HOD's department
                    const studentCountRegex = await User.countDocuments({
                        institutionId: hod.institutionId,
                        department: { $in: [new RegExp(`^${dept.name}$`, 'i'), new RegExp(`^${dept.code}$`, 'i')] },
                        role: 'student'
                    });
                    console.log(`  Matched Students (Regex): ${studentCountRegex}`);

                    // Check for students by institutionId only
                    const totalInstStudents = await User.countDocuments({
                        institutionId: hod.institutionId,
                        role: 'student'
                    });
                    console.log(`  Total Students in this Institution: ${totalInstStudents}`);
                } else {
                    console.log('  Dept NOT FOUND');
                }
            }
        }

        const students = await User.find({ role: 'student' }).limit(5);
        console.log('\n--- Sample Student Records ---');
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
