const mongoose = require('mongoose');
const path = require('path');
const User = require('./backend/models/User');
require('dotenv').config({ path: './backend/.env' });

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        const users = await User.find({ role: { $in: ['inst-admin', 'hod'] } }).limit(10);
        console.log(JSON.stringify(users, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUsers();
