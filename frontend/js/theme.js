// Theme Manager
const THEME_KEY = "quiz-app-theme";

export function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);
  updateThemeIcon(savedTheme);
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme(newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
  updateThemeIcon(newTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function updateThemeIcon(theme) {
  const themeIcon = document.querySelector(".theme-toggle");
  if (themeIcon) {
    themeIcon.className = theme === "light" ? "fa-solid fa-moon theme-toggle" : "fa-solid fa-sun theme-toggle";
  }
}

// Setup theme toggle button
export function setupThemeToggle() {
  const themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupThemeToggle();
});