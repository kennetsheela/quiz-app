// config.js
const getApiBaseUrl = () => {
    const hostname = window.location.hostname;

    // Support for local development (including file:// protocol)
    const isLocal = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.');

    const url = isLocal ? 'http://localhost:5000' : 
                (hostname.includes('web.app') || hostname.includes('firebaseapp.com')) ? 'https://slategray-skunk-723064.hostingersite.com' : 
                window.location.origin;

    console.log(`[API_CONFIG] Host: ${hostname}, API Base: ${url}`);
    return url;
};

const BASE_URL = getApiBaseUrl();

const API_CONFIG = {
    BASE_URL: BASE_URL,
    API_URL: `${BASE_URL}/api`
};

export default API_CONFIG;
export { BASE_URL };
