// institution-dashboard.js
import API_CONFIG from './config.js';

const API_BASE = API_CONFIG.API_URL;

async function initDashboard() {
    const token = await getAuthToken();
    if (!token) {
        window.location.href = 'institution-login.html';
        return;
    }

    try {
        await fetchInstitutionData(token);
        await fetchStats(token);
    } catch (error) {
        console.error('Dashboard init error:', error);
    }
}

async function getAuthToken() {
    // This should interface with your auth system (Firebase or custom)
    // For now, assume it's stored or handled by firebase.js
    const { auth } = await import('./firebase.js');
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                const token = await user.getIdToken();
                resolve(token);
            } else {
                resolve(null);
            }
        });
    });
}

async function fetchInstitutionData(token) {
    const response = await fetch(`${API_BASE}/institutions/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    document.getElementById('instNameDisplay').textContent = data.name;
    document.getElementById('instToken').textContent = data._id; // Example usage
}

async function fetchStats(token) {
    const response = await fetch(`${API_BASE}/analytics/dashboard-summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const stats = await response.json();

    // Update UI elements (assuming these IDs exist in HTML)
    if (document.getElementById('totalStudents'))
        document.getElementById('totalStudents').textContent = stats.totalStudents || 0;
    if (document.getElementById('totalEvents'))
        document.getElementById('totalEvents').textContent = stats.totalEvents || 0;
}

// Sidebar Toggles
window.toggleSidebar = () => {
    document.querySelector('.sidebar').classList.toggle('active');
};

document.addEventListener('DOMContentLoaded', initDashboard);
