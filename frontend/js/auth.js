//auth.js
import { auth } from "./firebase.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Check if user is authenticated
export function requireAuth(redirectTo = "index.html") {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // Unsubscribe after first call to prevent memory leaks
      if (user) {
        console.log("User authenticated:", user.uid);
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
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    alert("Error logging out: " + error.message);
  }
}

// Get current user
export function getCurrentUser() {
  return auth.currentUser;
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