import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcRtgd-z14UvwmbheL-yngJatMSzoMmfU",
  authDomain: "quiz-app-3e991.firebaseapp.com",
  projectId: "quiz-app-3e991",
  storageBucket: "quiz-app-3e991.firebasestorage.app",
  messagingSenderId: "102955195852",
  appId: "1:102955195852:web:cb197f01bba5209bcd1169"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);