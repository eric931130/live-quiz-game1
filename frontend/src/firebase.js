import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBWTe05Veeo12Fo9yFVeZ0mgk-GDm3Z39w",
  authDomain: "empath-os.firebaseapp.com",
  projectId: "empath-os",
  storageBucket: "empath-os.firebasestorage.app",
  messagingSenderId: "723285383886",
  appId: "1:723285383886:web:cb73ae3fc6a89313b38e9f",
  measurementId: "G-M58JJDZWC7"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, analytics, db, auth };
