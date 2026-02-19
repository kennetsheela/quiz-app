// superAdminAPI.js
import API_CONFIG from './config.js';

const API_BASE = API_CONFIG.API_URL;

/**
 * Robust API helper for Super Admin
 */
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('superAdminToken');
    const isFormData = options.body instanceof FormData;
    const defaultHeaders = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                // Unauthorized - clear token and redirect unless on login page
                if (!window.location.pathname.includes('super-admin-login.html')) {
                    localStorage.removeItem('superAdminToken');
                    window.location.href = 'super-admin-login.html';
                }
            }
            throw new Error(data.error || 'API Request failed');
        }

        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

export const auth = {
    isLoggedIn: () => !!localStorage.getItem('superAdminToken'),
    getToken: () => localStorage.getItem('superAdminToken'),
    login: (token) => {
        localStorage.setItem('superAdminToken', token);
    },
    logout: () => {
        localStorage.removeItem('superAdminToken');
        window.location.href = 'super-admin-login.html';
    }
};

export const settingsAPI = {
    /**
     * Get all platform settings
     */
    async getSettings() {
        return apiRequest('/super-admin/settings');
    },

    /**
     * Load a single setting by key (public)
     */
    async getPublicSetting(key) {
        const response = await fetch(`${API_BASE}/public/settings/${key}`);
        return await response.json();
    },

    /**
     * Update or create a platform setting
     */
    async updateSetting(key, value) {
        return apiRequest('/super-admin/settings', {
            method: 'POST',
            body: JSON.stringify({ key, value })
        });
    }
};

export const questionsAPI = {
    async getQuestions(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`/super-admin/questions?${queryString}`);
    },

    async addQuestion(data) {
        return apiRequest('/super-admin/questions', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async uploadBulk(formData) {
        // When sending FormData, we must NOT set Content-Type header manually
        // fetch will set it correctly with the boundary
        return apiRequest('/super-admin/questions/upload', {
            method: 'POST',
            // headers will be merged in apiRequest, so we pass an indicator
            // or just rely on apiRequest detecting FormData
            body: formData
        });
    },

    async runPipeline(formData) {
        return apiRequest('/super-admin/questions/pipeline', {
            method: 'POST',
            body: formData
        });
    }
};


export const superAdminAPI = {
    auth,
    settingsAPI,
    questionsAPI
};

export default superAdminAPI;

