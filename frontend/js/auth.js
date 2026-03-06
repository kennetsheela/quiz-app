//auth.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Check if user is authenticated (supports both Firebase and Local JWT)
export function requireAuth(redirectTo = "index.html") {
  return new Promise((resolve, reject) => {
    // 1. Check for Local JWT first (Fastest)
    const localToken = localStorage.getItem('token');
    if (localToken) {
      console.log("Authenticated via Local JWT");
      return resolve({ uid: 'local-user', isLocal: true });
    }

    // 2. Fallback to Firebase
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) {
        console.log("User authenticated via Firebase:", user.uid);
        resolve(user);
      } else {
        console.log("No user authenticated, redirecting...");
        reject(new Error("Not authenticated"));
        window.location.href = redirectTo;
      }
    });
  });
}

// Logout function
export async function logout() {
  try {
    localStorage.removeItem('token'); // Clear local JWT
    sessionStorage.removeItem('token');
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    alert("Error logging out: " + error.message);
  }
}

// Get current user
export function getCurrentUser() {
  return auth.currentUser || (localStorage.getItem('token') ? { uid: 'local-user' } : null);
}

// Get fresh token (supports both Firebase and Local JWT)
export async function getFreshToken(forceRefresh = false) {
  // 1. Check Firebase first if a user is already signed in
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(forceRefresh);
    localStorage.setItem("token", token);
    return token;
  }

  // 2. Otherwise try Local JWT from localStorage
  const localToken = localStorage.getItem('token');
  return localToken || null;
}

// Setup logout button
export function setupLogoutButton(buttonId = "logoutBtn") {
  const logoutBtn = document.getElementById(buttonId);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await logout();
    });
  }
}