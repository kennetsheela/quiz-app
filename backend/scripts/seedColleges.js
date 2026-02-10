// scripts/seedColleges.js
const mongoose = require("mongoose");
const College = require("../models/College");
require("dotenv").config();

const colleges = [
  {
    name: "Anna University",
    code: "AU",
    location: {
      city: "Chennai",
      state: "Tamil Nadu",
      country: "India"
    },
    departments: [
      { name: "Computer Science and Engineering", code: "CSE", isActive: true },
      { name: "Information Technology", code: "IT", isActive: true },
      { name: "Electronics and Communication Engineering", code: "ECE", isActive: true },
      { name: "Electrical and Electronics Engineering", code: "EEE", isActive: true },
      { name: "Mechanical Engineering", code: "MECH", isActive: true },
      { name: "Civil Engineering", code: "CIVIL", isActive: true },
      { name: "Artificial Intelligence and Data Science", code: "AIDS", isActive: true },
      { name: "Computer Science and Business Systems", code: "CSBS", isActive: true }
    ]
  },
  {
    name: "National Institute of Technology, Tiruchirappalli",
    code: "NIT-TRICHY",
    location: {
      city: "Tiruchirappalli",
      state: "Tamil Nadu",
      country: "India"
    },
    departments: [
      { name: "Computer Science and Engineering", code: "CSE", isActive: true },
      { name: "Electronics and Communication Engineering", code: "ECE", isActive: true },
      { name: "Electrical and Electronics Engineering", code: "EEE", isActive: true },
      { name: "Mechanical Engineering", code: "MECH", isActive: true },
      { name: "Civil Engineering", code: "CIVIL", isActive: true },
      { name: "Chemical Engineering", code: "CHEM", isActive: true },
      { name: "Metallurgical and Materials Engineering", code: "MME", isActive: true },
      { name: "Production Engineering", code: "PROD", isActive: true }
    ]
  },
  {
    name: "Vellore Institute of Technology",
    code: "VIT",
    location: {
      city: "Vellore",
      state: "Tamil Nadu",
      country: "India"
    },
    departments: [
      { name: "Computer Science and Engineering", code: "CSE", isActive: true },
      { name: "Information Technology", code: "IT", isActive: true },
      { name: "Electronics and Communication Engineering", code: "ECE", isActive: true },
      { name: "Electrical and Electronics Engineering", code: "EEE", isActive: true },
      { name: "Mechanical Engineering", code: "MECH", isActive: true },
      { name: "Civil Engineering", code: "CIVIL", isActive: true },
      { name: "Biotechnology", code: "BIOTECH", isActive: true },
      { name: "Chemical Engineering", code: "CHEM", isActive: true }
    ]
  },
  {
    name: "SRM Institute of Science and Technology",
    code: "SRM",
    location: {
      city: "Chennai",
      state: "Tamil Nadu",
      country: "India"
    },
    departments: [
      { name: "Computer Science and Engineering", code: "CSE", isActive: true },
      { name: "Information Technology", code: "IT", isActive: true },
      { name: "Electronics and Communication Engineering", code: "ECE", isActive: true },
      { name: "Electrical and Electronics Engineering", code: "EEE", isActive: true },
      { name: "Mechanical Engineering", code: "MECH", isActive: true },
      { name: "Civil Engineering", code: "CIVIL", isActive: true },
      { name: "Aerospace Engineering", code: "AERO", isActive: true },
      { name: "Automobile Engineering", code: "AUTO", isActive: true }
    ]
  },
  {
    name: "PSG College of Technology",
    code: "PSG",
    location: {
      city: "Coimbatore",
      state: "Tamil Nadu",
      country: "India"
    },
    departments: [
      { name: "Computer Science and Engineering", code: "CSE", isActive: true },
      { name: "Information Technology", code: "IT", isActive: true },
      { name: "Electronics and Communication Engineering", code: "ECE", isActive: true },
      { name: "Electrical and Electronics Engineering", code: "EEE", isActive: true },
      { name: "Mechanical Engineering", code: "MECH", isActive: true },
      { name: "Civil Engineering", code: "CIVIL", isActive: true },
      { name: "Textile Engineering", code: "TEXTILE", isActive: true },
      { name: "Production Engineering", code: "PROD", isActive: true }
    ]
  }
];

async function seedColleges() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing colleges (optional - comment out if you want to keep existing data)
    // await College.deleteMany({});
    // console.log("🗑️  Cleared existing colleges");

    // Insert colleges
    for (const collegeData of colleges) {
      const existing = await College.findOne({ code: collegeData.code });
      
      if (existing) {
        console.log(`⏭️  College already exists: ${collegeData.name}`);
      } else {
        await College.create(collegeData);
        console.log(`✅ Created college: ${collegeData.name} (${collegeData.code})`);
      }
    }

    console.log("\n🎉 College seeding completed!");
    console.log(`📊 Total colleges in database: ${await College.countDocuments()}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding colleges:", error);
    process.exit(1);
  }
}

// Run the seed function
seedColleges();