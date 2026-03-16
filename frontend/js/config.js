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

    // Firebase Hosting → backend is on Hostinger, NOT window.location.origin
    if (hostname.includes('web.app') || hostname.includes('firebaseapp.com')) {
        return 'https://slategray-skunk-723064.hostingersite.com';
    }

    return window.location.origin; // Final fallback: use current origin (essential for Hostinger/Production)
};

const BASE_URL = getApiBaseUrl();

const API_CONFIG = {
    BASE_URL: BASE_URL,
    API_URL: `${BASE_URL}/api`
};

export default API_CONFIG;
export { BASE_URL };
