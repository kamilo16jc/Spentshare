import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc, getDocs, setDoc, getDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const app = initializeApp({
  apiKey:"AIzaSyB-KQnjwvoRvUciDDFR5eHOjwGZbh8DBZI",
  authDomain:"spendshare-ed3fa.firebaseapp.com",
  projectId:"spendshare-ed3fa",
  storageBucket:"spendshare-ed3fa.firebasestorage.app",
  messagingSenderId:"142707923361",
  appId:"1:142707923361:web:55b965b821dfa336b413e0"
});

const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-east1');
const gProvider = new GoogleAuthProvider();

window._callFn = (name, data) => httpsCallable(functions, name)(data);

window._db=db; window._auth=auth;
window._addDoc=addDoc; window._col=collection; window._srvTs=serverTimestamp;
window._delDoc=deleteDoc; window._docRef=doc; window._getDocs=getDocs;
window._setDoc=setDoc; window._getDoc=getDoc; window._query=query;
window._where=where; window._orderBy=orderBy; window._onSnap=onSnapshot;

onAuthStateChanged(auth, async user => {
  window._curUser = user;
  if (user) {
    const initial = (user.displayName||user.email||'?')[0].toUpperCase();
    document.getElementById('userInitialCircle').textContent = initial;
    await setDoc(doc(db,'users',user.uid),{
      uid:user.uid, name:user.displayName||user.email.split('@')[0],
      email:user.email, updatedAt:serverTimestamp()
    },{merge:true});
    window._afterAuthCallback();
  }
});

window._doSignUp = async (email,pass,name) => {
  const c = await createUserWithEmailAndPassword(auth,email,pass);
  await updateProfile(c.user,{displayName:name});
  return c.user;
};
window._doSignIn = (e,p) => signInWithEmailAndPassword(auth,e,p);
window._doGoogle = () => signInWithPopup(auth,gProvider);
window._doSignOut = () => signOut(auth);
