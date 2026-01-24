// fixDatabase.js
// Save this file in backend/ folder and run: node fixDatabase.js

require("dotenv").config();
const mongoose = require("mongoose");
const Event = require("./models/Event");
const path = require("path");
const fs = require("fs");

const MONGODB_URI = process.env.MONGO_URI;

async function fixDatabase() {
  try {
    console.log("🔗 Connecting to MongoDB Atlas...");
    console.log("📍 Database: quiz_app1\n");
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected successfully!\n");

    // Fix the specific event
    const eventId = "69672a0aa7c5a4869f01a66b";
    console.log(`🔍 Looking for event ID: ${eventId}`);
    
    const event = await Event.findById(eventId);

    if (!event) {
      console.error("❌ Event not found with that ID!");
      console.log("\n📋 Available events in database:");
      
      const allEvents = await Event.find({}).select("eventName _id");
      if (allEvents.length === 0) {
        console.log("   (No events found)");
      } else {
        allEvents.forEach(e => {
          console.log(`   - ${e.eventName} (ID: ${e._id})`);
        });
      }
      
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`✅ Found event: "${event.eventName}"`);
    console.log(`📦 Number of sets: ${event.sets.length}\n`);

    let fixed = 0;
    let alreadyCorrect = 0;
    
    event.sets.forEach((set, index) => {
      const oldPath = set.questionsFile;
      
      console.log(`📝 Set ${index + 1}: "${set.setName}"`);
      console.log(`   Current path: ${oldPath}`);
      
      if (oldPath && (oldPath.includes("\\") || oldPath.includes("/"))) {
        // Extract just the filename from the full path
        const filename = path.basename(oldPath);
        set.questionsFile = filename;
        
        console.log(`   ✏️  Changing to: ${filename}`);
        
        // Verify file exists
        const fullPath = path.join(__dirname, "uploads", filename);
        if (fs.existsSync(fullPath)) {
          console.log(`   ✅ File exists in uploads folder`);
        } else {
          console.log(`   ⚠️  WARNING: File NOT found in uploads folder!`);
          console.log(`      Expected at: ${fullPath}`);
        }
        
        fixed++;
      } else {
        console.log(`   ✅ Already correct (no full path)`);
        alreadyCorrect++;
      }
      console.log("");
    });

    if (fixed > 0) {
      console.log(`💾 Saving changes to database...`);
      await event.save();
      console.log(`✅ Successfully fixed ${fixed} set(s)!\n`);
    } else {
      console.log(`✅ All ${alreadyCorrect} set(s) already have correct paths!\n`);
    }

    await mongoose.disconnect();
    console.log("👋 Disconnected from database\n");
    
    if (fixed > 0) {
      console.log("═".repeat(60));
      console.log("🎉 DATABASE FIXED SUCCESSFULLY!");
      console.log("═".repeat(60));
      console.log("\n📋 Next steps:");
      console.log("   1. Make sure you updated eventService.js (3 changes)");
      console.log("   2. Restart your backend server");
      console.log("   3. Go to admin panel and activate the quiz set");
      console.log("   4. Test the quiz - it should load now!\n");
    } else {
      console.log("═".repeat(60));
      console.log("ℹ️  No changes needed in database");
      console.log("═".repeat(60));
      console.log("\n📋 If quiz still doesn't work:");
      console.log("   1. Verify eventService.js has all 3 changes");
      console.log("   2. Check that file exists in backend/uploads/");
      console.log("   3. Restart backend server");
      console.log("   4. Check backend console for errors\n");
    }

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error("\n💡 Troubleshooting:");
    console.error("   - Check your .env file has MONGO_URI set correctly");
    console.error("   - Verify MongoDB Atlas allows connections from your IP");
    console.error("   - Check internet connection");
    console.error("   - Make sure database name is correct (quiz_app1)\n");
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

// Run the fix
console.log("═".repeat(60));
console.log("🔧 QUIZ DATABASE FIX SCRIPT");
console.log("═".repeat(60));
console.log("");

fixDatabase();