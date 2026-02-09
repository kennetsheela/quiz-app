//api.js
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const API_BASE_URL = "http://localhost:5000/api";

// Feature flag to use localStorage fallback when backend is unavailable
const USE_FALLBACK = false;

// Get authentication token - waits for auth state if needed
async function getAuthToken() {
  return new Promise((resolve, reject) => {
    // If user is already authenticated, return immediately
    if (auth.currentUser) {
      auth.currentUser.getIdToken(true)
        .then(resolve)
        .catch(reject);
      return;
    }
    
    // Otherwise, wait for auth state to initialize
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      if (user) {
        user.getIdToken(true)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error("Not authenticated"));
      }
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      unsubscribe();
      reject(new Error("Authentication timeout"));
    }, 5000);
  });
}

// Generic API call wrapper with fallback
async function apiCall(endpoint, options = {}) {
  try {
    const token = await getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "API request failed");
    }

    return data;
  } catch (error) {
    console.error("API call error:", error);
    
    // If backend is unavailable and fallback is enabled
    if (USE_FALLBACK && (error.message.includes("Failed to fetch") || error.message.includes("404"))) {
      console.warn("Backend unavailable, using localStorage fallback");
      return handleFallback(endpoint, options);
    }
    
    if (error.message.includes("auth/") || error.message === "Not authenticated") {
      window.location.href = "index.html";
    }
    
    throw error;
  }
}

// Fallback to localStorage when backend is unavailable
function handleFallback(endpoint, options) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  // Handle GET /auth/profile
  if (endpoint === "/auth/profile" && options.method !== "POST") {
    const profileKey = `profile_${user.uid}`;
    const savedProfile = localStorage.getItem(profileKey);
    
    if (savedProfile) {
      return JSON.parse(savedProfile);
    }
    
    // Return basic profile from Firebase user
    return {
      uid: user.uid,
      email: user.email,
      username: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL,
      provider: user.providerData[0]?.providerId === 'google.com' ? 'google' : 'email',
      createdAt: new Date().toISOString()
    };
  }
  
  // Handle POST /auth/profile
  if (endpoint === "/auth/profile" && options.method === "POST") {
    const profileData = JSON.parse(options.body);
    const profileKey = `profile_${user.uid}`;
    
    const profile = {
      ...profileData,
      uid: user.uid,
      email: user.email,
      createdAt: localStorage.getItem(profileKey) 
        ? JSON.parse(localStorage.getItem(profileKey)).createdAt 
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem(profileKey, JSON.stringify(profile));
    console.log("Profile saved to localStorage:", profile);
    
    return { message: "Profile saved successfully (localStorage)", user: profile };
  }
  
  // Handle POST /auth/login
  if (endpoint === "/auth/login") {
    const loginKey = `login_${user.uid}`;
    const loginData = {
      uid: user.uid,
      email: user.email,
      lastLogin: new Date().toISOString()
    };
    localStorage.setItem(loginKey, JSON.stringify(loginData));
    return { message: "Login recorded (localStorage)" };
  }
  
  throw new Error("Fallback not implemented for this endpoint");
}

// Auth APIs
export const authAPI = {
  saveProfile: (profileData) => apiCall("/auth/profile", {
    method: "POST",
    body: JSON.stringify(profileData)
  }),
  
  getProfile: () => apiCall("/auth/profile"),
  
  recordLogin: () => apiCall("/auth/login", { method: "POST" })
};

// Practice APIs
export const practiceAPI = {
  getSets: (category, topic, level) => 
    apiCall(`/practice/sets?category=${category}&topic=${topic}&level=${level}`),
  
  getQuestions: (setId) => apiCall(`/practice/sets/${setId}/questions`),
  
  startSet: (data) => apiCall("/practice/sets/start", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  
  submitSet: (data) => {
    // Debug: Log what we're sending
    console.log("📤 [api.js] submitSet payload:", {
      category: data.category,
      topic: data.topic,
      level: data.level,
      setNumber: data.setNumber,
      answersCount: data.answers?.length,
      timingsCount: data.timings?.length,
      hasTimings: !!data.timings,
      timingsSample: data.timings ? data.timings.slice(0, 3) : null
    });
    
    // Verify timings structure
    if (!data.timings || data.timings.length === 0) {
      console.error("❌ [api.js] NO TIMINGS in submission data!");
    } else {
      console.log("✅ [api.js] Timings present:", data.timings.length, "items");
      
      // Check for invalid values
      const invalidTimings = data.timings.filter(t => 
        t === undefined || t === null || isNaN(t) || t < 0
      );
      if (invalidTimings.length > 0) {
        console.warn(`⚠️ [api.js] ${invalidTimings.length} invalid timing values found`);
      }
    }
    
    return apiCall("/practice/sets/submit", {
      method: "POST",
      body: JSON.stringify(data)
    }).then(result => {
      // Debug: Log what we received
      console.log("📥 [api.js] submitSet response received");
      console.log("📋 [api.js] Response has results:", !!result.results);
      console.log("📋 [api.js] Results count:", result.results?.length);
      
      if (result.results && result.results.length > 0) {
        const firstResult = result.results[0];
        console.log("🔍 [api.js] First result analysis:", {
          hasQuestion: !!firstResult.question,
          hasTimeSpent: 'timeSpent' in firstResult,
          timeSpentValue: firstResult.timeSpent,
          timeSpentType: typeof firstResult.timeSpent,
          allKeys: Object.keys(firstResult)
        });
        
        // Count results with timing data
        const withTime = result.results.filter(r => 
          r.timeSpent !== undefined && r.timeSpent !== null && !isNaN(r.timeSpent)
        );
        
        console.log(`⏱️ [api.js] ${withTime.length}/${result.results.length} results have valid timing data`);
        
        if (withTime.length === 0) {
          console.error("❌ [api.js] CRITICAL: Backend returned NO per-question timing data!");
        } else if (withTime.length < result.results.length) {
          console.warn(`⚠️ [api.js] Only ${withTime.length}/${result.results.length} results have timing data`);
        } else {
          console.log("✅ [api.js] All results have timing data!");
        }
      }
      
      return result;
    }).catch(error => {
      console.error("❌ [api.js] submitSet error:", error);
      throw error;
    });
  },
  
  getProgress: () => apiCall("/practice/progress"),
  
  getCategories: () => fetch(`${API_BASE_URL}/practice/categories`).then(r => r.json()),
  
  getTopics: (category) => 
    fetch(`${API_BASE_URL}/practice/categories/${category}/topics`).then(r => r.json())
};

// Event APIs
export const eventAPI = {
  getAll: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/events`);
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      return await response.json();
    } catch (error) {
      console.error("Get events error:", error);
      throw error;
    }
  },
  
  getAllEvents: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/events`);
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      return await response.json();
    } catch (error) {
      console.error("Get all events error:", error);
      throw error;
    }
  },
  
  getEvent: async (eventId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events/${eventId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch event");
      }
      return await response.json();
    } catch (error) {
      console.error("Get event error:", error);
      throw error;
    }
  },
  
  createEvent: async (formData) => {
    const token = await getAuthToken();
    const response = await fetch(`${API_BASE_URL}/events/create`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create event");
    }
    
    return response.json();
  },
  
  studentLogin: (data) => apiCall("/events/student-login", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  
  getActiveSet: async (eventId) => {
    try {
      console.log("Fetching active set for event:", eventId);
      const response = await fetch(`${API_BASE_URL}/events/${eventId}/active-set`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get active set");
      }
      
      const data = await response.json();
      console.log("Active set response:", data);
      return data;
    } catch (error) {
      console.error("Get active set error:", error);
      throw error;
    }
  },
  
  startSet: async (data) => {
    try {
      console.log("Starting set with data:", data);
      const result = await apiCall("/events/start-set", {
        method: "POST",
        body: JSON.stringify(data)
      });
      console.log("Start set response:", result);
      return result;
    } catch (error) {
      console.error("Start set error:", error);
      throw error;
    }
  },
  
  submitSet: async (data) => {
    try {
      console.log("Submitting set with data:", data);
      const result = await apiCall("/events/submit-set", {
        method: "POST",
        body: JSON.stringify(data)
      });
      console.log("Submit set response:", result);
      return result;
    } catch (error) {
      console.error("Submit set error:", error);
      throw error;
    }
  },
  
  toggleSet: (data) => apiCall("/events/toggle-set", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  
  getParticipants: (eventId) => apiCall(`/events/${eventId}/participants`),
  
  // ⭐ NEW: Get single participant data
  getParticipant: async (participantId) => {
    try {
      console.log("📋 Fetching participant:", participantId);
      const result = await apiCall(`/events/participants/${participantId}`, {
        method: "GET"
      });
      console.log("✅ Participant data:", result);
      return result.participant;
    } catch (error) {
      console.error("❌ Get participant error:", error);
      throw error;
    }
  },
  
  getStats: (eventId) => apiCall(`/events/${eventId}/stats`),
  
  deleteEvent: (eventId, adminPassword) => apiCall(`/events/${eventId}`, {
    method: "DELETE",
    body: JSON.stringify({ adminPassword })
  })
};

export default {
  authAPI,
  practiceAPI,
  eventAPI
};