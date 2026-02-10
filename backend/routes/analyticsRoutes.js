// routes/analyticsRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("./authRoutes");
const AnalyticsService = require("../services/analyticsService");

/* ===========================
   Get Event Analytics
=========================== */
router.get("/event/:eventId", verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { collegeId, department } = req.query;
    
    const filters = {};
    if (collegeId) filters.collegeId = collegeId;
    if (department) filters.department = department;
    
    const analytics = await AnalyticsService.getEventAnalytics(eventId, filters);
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/* ===========================
   Export Analytics to CSV
=========================== */
router.get("/event/:eventId/export", verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { collegeId, department } = req.query;
    
    const filters = {};
    if (collegeId) filters.collegeId = collegeId;
    if (department) filters.department = department;
    
    const analytics = await AnalyticsService.getEventAnalytics(eventId, filters);
    const csvContent = AnalyticsService.exportToCSV(analytics.leaderboard);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${eventId}.csv`);
    res.send(csvContent);
    
  } catch (error) {
    console.error("Export analytics error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/* ===========================
   Get All Colleges
=========================== */
router.get("/colleges", async (req, res) => {
  try {
    const colleges = await AnalyticsService.getAllColleges();
    
    res.json({
      success: true,
      colleges
    });
  } catch (error) {
    console.error("Get colleges error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/* ===========================
   Get Departments by College
=========================== */
router.get("/colleges/:collegeId/departments", async (req, res) => {
  try {
    const { collegeId } = req.params;
    
    const departments = await AnalyticsService.getDepartmentsByCollege(collegeId);
    
    res.json({
      success: true,
      departments
    });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/* ===========================
   Create College (Admin)
=========================== */
router.post("/colleges", verifyToken, async (req, res) => {
  try {
    const college = await AnalyticsService.createCollege(req.body);
    
    res.status(201).json({
      success: true,
      message: "College created successfully",
      college
    });
  } catch (error) {
    console.error("Create college error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/* ===========================
   Add Department to College (Admin)
=========================== */
router.post("/colleges/:collegeId/departments", verifyToken, async (req, res) => {
  try {
    const { collegeId } = req.params;
    
    const college = await AnalyticsService.addDepartment(collegeId, req.body);
    
    res.json({
      success: true,
      message: "Department added successfully",
      college
    });
  } catch (error) {
    console.error("Add department error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

module.exports = router;