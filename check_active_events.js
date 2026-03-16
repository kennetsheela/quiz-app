const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
const Event = require('./backend/models/Event');

async function checkEvents() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const events = await Event.find({ status: 'Active' });
        console.log('ACTIVE_EVENTS_START');
        console.log(JSON.stringify(events, null, 2));
        console.log('ACTIVE_EVENTS_END');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkEvents();
