import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaMpUtQfCYq0739QFFM7GT2yZvUxM4w2I",
  authDomain: "aptiogen-56f98.firebaseapp.com",
  projectId: "aptiogen-56f98",
  storageBucket: "aptiogen-56f98.firebasestorage.app",
  messagingSenderId: "335276471623",
  appId: "1:335276471623:web:399017e6ab4475071a8862"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

