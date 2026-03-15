// config.js
const getApiBaseUrl = () => {
    const hostname = window.location.hostname;

    // Support for local development (including file:// protocol)
    const isLocal = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.');

    if (isLocal) {
        return 'http://localhost:5000';
    }

    // Support for Firebase hosting
    if (hostname.includes('web.app') || hostname.includes('firebaseapp.com')) {
        return window.location.origin;
    }

    return 'http://localhost:5000'; // Default fallback
};

const BASE_URL = getApiBaseUrl();

const API_CONFIG = {
    BASE_URL: BASE_URL,
    API_URL: `${BASE_URL}/api`
};

export default API_CONFIG;
export { BASE_URL };
