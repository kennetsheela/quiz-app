// utils/timeUtils.js
function minutesBetween(start, end) {
  return (end - start) / 60000;
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

module.exports = { 
  minutesBetween, 
  formatTime 
};