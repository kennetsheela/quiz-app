const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");
const fs = require("fs");
const path = require("path");

async function deleteInactiveEvents() {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    // Find events that ended 3+ days ago with no participants
    const inactiveEvents = await Event.find({
      endTime: { $lt: threeDaysAgo }
    });

    for (const event of inactiveEvents) {
      const participantCount = await EventParticipant.countDocuments({
        eventId: event._id
      });

      // Only delete if no participants
      if (participantCount === 0) {
        // Delete uploaded files
        event.sets.forEach(set => {
          if (set.questionsFile) {
            const filePath = path.join(__dirname, "..", set.questionsFile);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        });

        await Event.findByIdAndDelete(event._id);
        console.log(`Deleted inactive event: ${event.eventName}`);
      }
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

// Run cleanup every 24 hours
function startCleanupScheduler() {
  deleteInactiveEvents(); // Run immediately
  setInterval(deleteInactiveEvents, 24 * 60 * 60 * 1000);
}

module.exports = { startCleanupScheduler, deleteInactiveEvents };