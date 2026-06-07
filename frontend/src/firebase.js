import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAhA2OgpI8UWTSv0ZV9Je61G1b6Lo15490",
  authDomain: "teach999-53c2d.firebaseapp.com",
  projectId: "teach999-53c2d",
  storageBucket: "teach999-53c2d.firebasestorage.app",
  messagingSenderId: "405133175597",
  appId: "1:405133175597:web:302a4ed2a32b96fb16c1a4",
  measurementId: "G-C60VFTTFP0"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, analytics, db, auth };
