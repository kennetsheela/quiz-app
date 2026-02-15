// services/analyticsService.js
const EventParticipant = require("../models/EventParticipant");
const College = require("../models/College");
const Event = require("../models/Event");
const mongoose = require("mongoose");

/**
 * Get comprehensive analytics for an event
 * Supports filtering by college and department
 */
async function getEventAnalytics(eventId, filters = {}) {
  const { collegeId, department } = filters;
  
  console.log(`📊 Generating analytics for event: ${eventId}`);
  console.log(`   Filters:`, { collegeId, department });
  
  // Build query
  const query = { eventId };
  if (collegeId) query.college = collegeId;
  if (department) query.department = department;
  
  // Fetch participants with college data
  const participants = await EventParticipant.find(query)
    .populate('college', 'name code location')
    .sort({ createdAt: -1 });
  
  console.log(`   Found ${participants.length} participants`);
  
  // Get event details
  const event = await Event.findById(eventId);
  
  if (!event) {
    throw new Error("Event not found");
  }
  
  // Filter only completed participants
  const completedParticipants = participants.filter(p => 
    p.setResults.some(r => r.completedAt)
  );
  
  console.log(`   ${completedParticipants.length} completed participants`);
  
  // Compute analytics
  const analytics = {
    eventInfo: {
      eventId: event._id,
      eventName: event.eventName,
      startTime: event.startTime,
      endTime: event.endTime,
      totalSets: event.sets.length
    },
    
    overview: computeOverview(participants, completedParticipants),
    topPerformer: findTopPerformer(completedParticipants),
    fastestFinisher: findFastestFinisher(completedParticipants),
    collegePerformance: await computeCollegePerformance(completedParticipants),
    departmentComparison: computeDepartmentComparison(completedParticipants),
    leaderboard: computeLeaderboard(completedParticipants),
    scoreDistribution: computeScoreDistribution(completedParticipants),
    timeAnalysis: computeTimeAnalysis(completedParticipants)
  };
  
  console.log(`✅ Analytics generated successfully`);
  
  return analytics;
}

/**
 * Compute overview statistics
 */
function computeOverview(allParticipants, completedParticipants) {
  const totalParticipants = allParticipants.length;
  const totalCompleted = completedParticipants.length;
  const completionRate = totalParticipants > 0 
    ? Math.round((totalCompleted / totalParticipants) * 100) 
    : 0;
  
  // Calculate average score
  let totalScore = 0;
  let totalMaxScore = 0;
  let totalPercentage = 0;
  
  completedParticipants.forEach(p => {
    p.setResults.forEach(r => {
      if (r.completedAt && r.score !== null) {
        totalScore += r.score;
        totalMaxScore += r.totalQuestions;
        totalPercentage += r.percentage || 0;
      }
    });
  });
  
  const avgScore = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
  const avgPercentage = completedParticipants.length > 0 
    ? totalPercentage / completedParticipants.length 
    : 0;
  
  return {
    totalParticipants,
    totalCompleted,
    completionRate,
    averageScore: Math.round(avgScore * 10) / 10,
    averagePercentage: Math.round(avgPercentage * 10) / 10
  };
}

/**
 * Find top performer (highest score)
 */
function findTopPerformer(participants) {
  if (participants.length === 0) return null;
  
  let topPerformer = null;
  let highestScore = -1;
  let highestPercentage = -1;
  
  participants.forEach(p => {
    const totalScore = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.score || 0) : sum, 0
    );
    
    const totalQuestions = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.totalQuestions || 0) : sum, 0
    );
    
    const percentage = totalQuestions > 0 ? (totalScore / totalQuestions) * 100 : 0;
    
    if (percentage > highestPercentage || 
        (percentage === highestPercentage && totalScore > highestScore)) {
      highestScore = totalScore;
      highestPercentage = percentage;
      topPerformer = {
        participantId: p._id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        rollNo: p.rollNo,
        college: p.college?.name || 'N/A',
        department: p.department,
        score: totalScore,
        totalQuestions,
        percentage: Math.round(percentage * 10) / 10,
        completedSets: p.setResults.filter(r => r.completedAt).length
      };
    }
  });
  
  return topPerformer;
}

/**
 * Find fastest finisher (least time taken)
 */
function findFastestFinisher(participants) {
  if (participants.length === 0) return null;
  
  let fastestFinisher = null;
  let shortestTime = Infinity;
  
  participants.forEach(p => {
    const totalTime = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.timeTaken || 0) : sum, 0
    );
    
    const completedSets = p.setResults.filter(r => r.completedAt).length;
    
    if (completedSets > 0 && totalTime < shortestTime) {
      shortestTime = totalTime;
      
      const totalScore = p.setResults.reduce((sum, r) => 
        r.completedAt ? sum + (r.score || 0) : sum, 0
      );
      
      const totalQuestions = p.setResults.reduce((sum, r) => 
        r.completedAt ? sum + (r.totalQuestions || 0) : sum, 0
      );
      
      fastestFinisher = {
        participantId: p._id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        rollNo: p.rollNo,
        college: p.college?.name || 'N/A',
        department: p.department,
        timeTaken: totalTime, // in seconds
        timeTakenFormatted: formatTime(totalTime),
        score: totalScore,
        totalQuestions,
        percentage: totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100 * 10) / 10 : 0,
        completedSets
      };
    }
  });
  
  return fastestFinisher;
}

/**
 * Compute college-wise performance
 */
async function computeCollegePerformance(participants) {
  const collegeMap = new Map();
  
  participants.forEach(p => {
    if (!p.college) return;
    
    const collegeId = p.college._id.toString();
    
    if (!collegeMap.has(collegeId)) {
      collegeMap.set(collegeId, {
        collegeId,
        collegeName: p.college.name,
        collegeCode: p.college.code,
        location: p.college.location,
        participants: [],
        totalScore: 0,
        totalQuestions: 0,
        totalTime: 0,
        completedCount: 0
      });
    }
    
    const college = collegeMap.get(collegeId);
    college.participants.push(p);
    
    p.setResults.forEach(r => {
      if (r.completedAt) {
        college.totalScore += r.score || 0;
        college.totalQuestions += r.totalQuestions || 0;
        college.totalTime += r.timeTaken || 0;
        college.completedCount++;
      }
    });
  });
  
  // Calculate averages and format
  const collegePerformance = Array.from(collegeMap.values()).map(college => ({
    collegeId: college.collegeId,
    collegeName: college.collegeName,
    collegeCode: college.collegeCode,
    location: college.location,
    totalParticipants: college.participants.length,
    completedParticipants: college.participants.filter(p => 
      p.setResults.some(r => r.completedAt)
    ).length,
    averageScore: college.totalQuestions > 0 
      ? Math.round((college.totalScore / college.totalQuestions) * 100 * 10) / 10 
      : 0,
    averageTime: college.completedCount > 0 
      ? Math.round(college.totalTime / college.completedCount) 
      : 0,
    averageTimeFormatted: college.completedCount > 0 
      ? formatTime(Math.round(college.totalTime / college.completedCount)) 
      : '0m 0s'
  }));
  
  // Sort by average score descending
  return collegePerformance.sort((a, b) => b.averageScore - a.averageScore);
}

/**
 * Compute department-wise comparison
 */
function computeDepartmentComparison(participants) {
  const deptMap = new Map();
  
  participants.forEach(p => {
    const deptKey = p.department;
    
    if (!deptMap.has(deptKey)) {
      deptMap.set(deptKey, {
        department: deptKey,
        departmentCode: p.departmentCode || deptKey,
        participants: [],
        totalScore: 0,
        totalQuestions: 0,
        totalTime: 0,
        completedCount: 0
      });
    }
    
    const dept = deptMap.get(deptKey);
    dept.participants.push(p);
    
    p.setResults.forEach(r => {
      if (r.completedAt) {
        dept.totalScore += r.score || 0;
        dept.totalQuestions += r.totalQuestions || 0;
        dept.totalTime += r.timeTaken || 0;
        dept.completedCount++;
      }
    });
  });
  
  // Calculate averages and rank
  const departments = Array.from(deptMap.values()).map(dept => ({
    department: dept.department,
    departmentCode: dept.departmentCode,
    totalParticipants: dept.participants.length,
    completedParticipants: dept.participants.filter(p => 
      p.setResults.some(r => r.completedAt)
    ).length,
    averageScore: dept.totalQuestions > 0 
      ? Math.round((dept.totalScore / dept.totalQuestions) * 100 * 10) / 10 
      : 0,
    averageTime: dept.completedCount > 0 
      ? Math.round(dept.totalTime / dept.completedCount) 
      : 0,
    averageTimeFormatted: dept.completedCount > 0 
      ? formatTime(Math.round(dept.totalTime / dept.completedCount)) 
      : '0m 0s'
  }));
  
  // Sort by average score descending
  const sorted = departments.sort((a, b) => b.averageScore - a.averageScore);
  
  // Add rank
  return sorted.map((dept, index) => ({
    rank: index + 1,
    ...dept
  }));
}

/**
 * Compute leaderboard with tie-breaking
 * Ranking criteria: Score (descending), Time (ascending)
 */
function computeLeaderboard(participants, limit = 50) {
  const leaderboard = participants.map(p => {
    const totalScore = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.score || 0) : sum, 0
    );
    
    const totalQuestions = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.totalQuestions || 0) : sum, 0
    );
    
    const totalTime = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.timeTaken || 0) : sum, 0
    );
    
    const percentage = totalQuestions > 0 ? (totalScore / totalQuestions) * 100 : 0;
    
    return {
      participantId: p._id,
      name: `${p.firstName} ${p.lastName}`,
      email: p.email,
      rollNo: p.rollNo,
      college: p.college?.name || 'N/A',
      department: p.department,
      score: totalScore,
      totalQuestions,
      percentage: Math.round(percentage * 10) / 10,
      timeTaken: totalTime,
      timeTakenFormatted: formatTime(totalTime),
      completedSets: p.setResults.filter(r => r.completedAt).length
    };
  });
  
  // Sort by:
  // 1. Percentage (descending)
  // 2. Total Score (descending)
  // 3. Time Taken (ascending - faster is better)
  leaderboard.sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.timeTaken - b.timeTaken;
  });
  
  // Add rank
  return leaderboard.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    ...entry
  }));
}

/**
 * Compute score distribution
 */
function computeScoreDistribution(participants) {
  const distribution = {
    excellent: 0,  // 90-100%
    good: 0,       // 70-89%
    average: 0,    // 50-69%
    poor: 0        // <50%
  };
  
  participants.forEach(p => {
    const totalScore = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.score || 0) : sum, 0
    );
    
    const totalQuestions = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.totalQuestions || 0) : sum, 0
    );
    
    if (totalQuestions > 0) {
      const percentage = (totalScore / totalQuestions) * 100;
      
      if (percentage >= 90) distribution.excellent++;
      else if (percentage >= 70) distribution.good++;
      else if (percentage >= 50) distribution.average++;
      else distribution.poor++;
    }
  });
  
  return distribution;
}

/**
 * Compute time analysis
 */
function computeTimeAnalysis(participants) {
  const times = [];
  
  participants.forEach(p => {
    const totalTime = p.setResults.reduce((sum, r) => 
      r.completedAt ? sum + (r.timeTaken || 0) : sum, 0
    );
    
    const completedSets = p.setResults.filter(r => r.completedAt).length;
    
    if (completedSets > 0) {
      times.push(totalTime);
    }
  });
  
  if (times.length === 0) {
    return {
      averageTime: 0,
      minTime: 0,
      maxTime: 0,
      averageTimeFormatted: '0m 0s',
      minTimeFormatted: '0m 0s',
      maxTimeFormatted: '0m 0s'
    };
  }
  
  const avgTime = Math.round(times.reduce((sum, t) => sum + t, 0) / times.length);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  return {
    averageTime: avgTime,
    minTime,
    maxTime,
    averageTimeFormatted: formatTime(avgTime),
    minTimeFormatted: formatTime(minTime),
    maxTimeFormatted: formatTime(maxTime)
  };
}

/**
 * Format time in seconds to "Xm Ys"
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/**
 * Get list of all colleges
 */
async function getAllColleges() {
  return await College.find({ isActive: true })
    .select('name code location departments')
    .sort({ name: 1 });
}

/**
 * Get departments for a specific college
 */
async function getDepartmentsByCollege(collegeId) {
  const college = await College.findById(collegeId);
  if (!college) {
    throw new Error("College not found");
  }
  
  return college.departments.filter(d => d.isActive);
}

/**
 * Create a new college
 */
async function createCollege(data) {
  const { name, code, location, departments } = data;
  
  const college = await College.create({
    name,
    code,
    location,
    departments: departments || []
  });
  
  console.log(`✅ College created: ${name} (${code})`);
  return college;
}

/**
 * Add department to college
 */
async function addDepartment(collegeId, departmentData) {
  const college = await College.findById(collegeId);
  
  if (!college) {
    throw new Error("College not found");
  }
  
  college.departments.push(departmentData);
  await college.save();
  
  console.log(`✅ Department added to ${college.name}: ${departmentData.name}`);
  return college;
}

/**
 * Export analytics to CSV
 */
function exportToCSV(leaderboard) {
  const headers = ['Rank', 'Name', 'Email', 'Roll No', 'College', 'Department', 'Score', 'Total Questions', 'Percentage', 'Time Taken'];
  
  const rows = leaderboard.map(entry => [
    entry.rank,
    entry.name,
    entry.email,
    entry.rollNo,
    entry.college,
    entry.department,
    entry.score,
    entry.totalQuestions,
    entry.percentage,
    entry.timeTakenFormatted
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  return csvContent;
}

module.exports = {
  getEventAnalytics,
  getAllColleges,
  getDepartmentsByCollege,
  createCollege,
  addDepartment,
  exportToCSV
};