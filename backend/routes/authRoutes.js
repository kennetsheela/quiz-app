//authRoutes.js
const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const User = require("../models/User");
const authController = require("../controllers/authController");

// JWT Login Routes
router.post("/institution/login", authController.institutionLogin);
router.post("/student/login", authController.studentLogin);

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Get user profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return user profile with all fields
    res.json({
      id: user._id,
      uid: user.firebaseUid,
      firebaseUid: user.firebaseUid,
      username: user.username,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
      batchId: user.batchId,
      department: user.department,
      college: user.college,
      city: user.city,
      rollNumber: user.rollNumber,
      photoURL: user.photoURL,
      provider: user.provider,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update user profile
router.post("/profile", verifyToken, async (req, res) => {
  try {
    const {
      username,
      department,
      college,
      city,
      photoURL,
      provider,
      role,
      institutionId,
      yearId,
      batchId,
      rollNumber
    } = req.body;
    const { uid, email, picture, firebase } = req.user;

    // Validate minimum required fields
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    // Determine provider from token or request body
    let userProvider = provider || "email";
    if (!provider && firebase?.sign_in_provider === "google.com") {
      userProvider = "google";
    } else if (!provider && firebase?.sign_in_provider === "github.com") {
      userProvider = "github";
    }

    // Use photoURL from request or from Firebase token
    const userPhotoURL = photoURL || picture || null;

    // Use $or to find by either UID or email to avoid duplicates
    const user = await User.findOneAndUpdate(
      {
        $or: [
          { firebaseUid: uid },
          { email: email.toLowerCase() }
        ]
      },
      {
        $set: {
          firebaseUid: uid,
          email: email.toLowerCase(),
          username,
          firstName: req.body.firstName || "",
          lastName: req.body.lastName || "",
          // Only update role if provided and not already HOD/Admin (to prevent accidental downgrade)
          // But usually role comes from pendingProfile which is correct.
          role: role || "student",
          institutionId: institutionId || null,
          batchId: batchId || yearId || null,
          department: department || "",
          college: college || "",
          city: city || "",
          rollNumber: rollNumber || "",
          photoURL: userPhotoURL,
          provider: userProvider,
          lastLogin: new Date()
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    console.log("Profile saved/updated for user:", uid);

    res.json({
      message: "Profile saved successfully",
      user: {
        id: user._id,
        uid: user.firebaseUid,
        firebaseUid: user.firebaseUid,
        username: user.username,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        batchId: user.batchId,
        department: user.department,
        college: user.college,
        city: user.city,
        rollNumber: user.rollNumber,
        photoURL: user.photoURL,
        provider: user.provider,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("Profile save error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update profile (partial updates)
router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const { username, department, college, city, photoURL, rollNumber } = req.body;

    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({ error: "User not found. Please create profile first." });
    }

    // Update only provided fields
    if (username !== undefined) user.username = username;
    if (role !== undefined) user.role = role;
    if (institutionId !== undefined) user.institutionId = institutionId;
    if (batchId !== undefined) user.batchId = batchId;
    if (yearId !== undefined) user.batchId = yearId;
    if (department !== undefined) user.department = department;
    if (college !== undefined) user.college = college;
    if (city !== undefined) user.city = city;
    if (rollNumber !== undefined) user.rollNumber = rollNumber;
    if (photoURL !== undefined) user.photoURL = photoURL;

    await user.save();

    console.log("Profile updated for user:", req.user.uid);

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        uid: user.firebaseUid,
        username: user.username,
        email: user.email,
        department: user.department,
        college: user.college,
        city: user.city,
        rollNumber: user.rollNumber,
        photoURL: user.photoURL,
        provider: user.provider
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Record login (creates basic user record if doesn't exist)
router.post("/login", verifyToken, async (req, res) => {
  try {
    const { uid, email, picture, name, firebase } = req.user;

    // Find by UID or Email
    let user = await User.findOne({
      $or: [
        { firebaseUid: uid },
        { email: email.toLowerCase() }
      ]
    });

    if (!user) {
      // Create basic user record on first login
      const provider = firebase?.sign_in_provider === "google.com" ? "google" :
        firebase?.sign_in_provider === "github.com" ? "github" : "email";

      user = await User.create({
        firebaseUid: uid,
        email,
        username: name || email.split('@')[0],
        photoURL: picture || null,
        provider,
        lastLogin: new Date(),
        // Leave other fields empty - will be filled in details page
        department: "",
        college: "",
        city: ""
      });

      console.log("New user created on login:", uid);
    } else {
      // Link Firebase UID if just found by email
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        console.log("Existing account linked to Firebase UID:", uid);
      }

      // Update last login
      user.lastLogin = new Date();
      if (picture && !user.photoURL) user.photoURL = picture;
      await user.save();

      console.log("Login recorded for user:", uid);
    }

    res.json({
      message: "Login recorded",
      hasProfile: !!(user.department && user.college && user.city)
    });
  } catch (error) {
    console.error("Login record error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user profile (for testing/admin)
router.delete("/profile", verifyToken, async (req, res) => {
  try {
    await User.findOneAndDelete({ firebaseUid: req.user.uid });
    res.json({ message: "Profile deleted successfully" });
  } catch (error) {
    console.error("Delete profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Middleware to verify if user is an institution admin
const verifyInstAdmin = async (req, res, next) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user || user.role !== "inst-admin") {
      return res.status(403).json({ error: "Access denied. Institution admin role required." });
    }

    req.instAdmin = user;
    next();
  } catch (error) {
    console.error("verifyInstAdmin error:", error);
    res.status(500).json({ error: "Authorization check failed" });
  }
};

// Middleware to verify if user is staff (hod or admin)
const verifyStaff = async (req, res, next) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user || (user.role !== "inst-admin" && user.role !== "hod")) {
      return res.status(403).json({ error: "Access denied. Staff role required." });
    }

    req.staff = user;
    next();
  } catch (error) {
    console.error("verifyStaff error:", error);
    res.status(500).json({ error: "Authorization check failed" });
  }
};

module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.verifyInstAdmin = verifyInstAdmin;
module.exports.verifyStaff = verifyStaff;
