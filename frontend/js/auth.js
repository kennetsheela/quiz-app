// auth.js
// FIX: Tokens are no longer stored in localStorage.
// JWTs for institution admins/HODs are now handled via HttpOnly cookies set by the backend.
// Firebase tokens for students are kept in memory only (Firebase SDK manages its own session).
// This eliminates XSS-based token theft via localStorage.

import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ── Auth Check ────────────────────────────────────────────────────────────────
/**
 * Check if the user is authenticated.
 * For Firebase users (students): checks Firebase auth state.
 * For JWT users (inst-admin, HOD): the cookie is HttpOnly and managed by the browser
 * automatically — we just check if a `userRole` marker exists in sessionStorage.
 * @param {string} redirectTo - Page to redirect to if not authenticated
 */
export function requireAuth(redirectTo = "index.html") {
  return new Promise((resolve, reject) => {
    // Check for institution admin / HOD session marker (role stored in sessionStorage,
    // NOT the token itself — the HttpOnly cookie carries the token transparently)
    const roleMarker = sessionStorage.getItem("userRole");
    if (roleMarker) {
      console.log("Authenticated via session role marker:", roleMarker);
      return resolve({ role: roleMarker, isLocal: true });
    }

    // Fallback: Check Firebase auth state (for student users)
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

// ── Logout ────────────────────────────────────────────────────────────────────
export async function logout() {
  try {
    // Clear non-sensitive session markers (NOT tokens)
    sessionStorage.removeItem("userRole");
    sessionStorage.removeItem("institutionId");
    sessionStorage.removeItem("userName");

    // FIX: No longer clearing token from localStorage
    // The HttpOnly cookie is cleared server-side via a logout API call
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include", // Sends the HttpOnly cookie so server can clear it
      });
    } catch (e) {
      // Non-fatal — proceed with client-side logout even if server call fails
      console.warn("Server logout call failed:", e.message);
    }

    // Sign out of Firebase (for student users)
    await signOut(auth);

    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    alert("Error logging out. Please try again.");
  }
}

// ── Get Current User ──────────────────────────────────────────────────────────
export function getCurrentUser() {
  // Firebase user (students)
  if (auth.currentUser) return auth.currentUser;

  // JWT user (inst-admin, HOD) — identified only by session marker, not by token
  const roleMarker = sessionStorage.getItem("userRole");
  if (roleMarker) return { uid: "local-user", role: roleMarker };

  return null;
}

// ── Get Fresh Token ──────────────────────────────────────────────────────────
/**
 * For Firebase users: returns a fresh Firebase ID token (in-memory only).
 * For JWT users (inst-admin/HOD): returns null — the HttpOnly cookie is sent
 * automatically by the browser with credentials:'include'. No token needed here.
 */
export async function getFreshToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (user) {
    // Firebase token — kept in memory by Firebase SDK, NOT stored in localStorage
    return user.getIdToken(forceRefresh);
  }

  // For JWT cookie users, return null — the cookie is sent transparently
  // by the browser on every request that uses credentials: 'include'
  return null;
}

// ── Setup Logout Button ───────────────────────────────────────────────────────
export function setupLogoutButton(buttonId = "logoutBtn") {
  const logoutBtn = document.getElementById(buttonId);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await logout();
    });
  }
}