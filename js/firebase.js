import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc, getDocs, setDoc, getDoc, updateDoc, where, arrayUnion, arrayRemove, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Pruebas locales con los emuladores de Firebase: abrir la app con ?emu=1 en
// localhost. Usa el proyecto "demo-spentshare", que nunca toca producción.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let EMU = false;
try {
  const p = new URLSearchParams(location.search);
  if (p.get('emu') === '1') sessionStorage.setItem('ss_emu', '1');
  if (p.get('emu') === '0') sessionStorage.removeItem('ss_emu');
  EMU = LOCAL && sessionStorage.getItem('ss_emu') === '1';
} catch (e) {}

const app = initializeApp(EMU ? {
  apiKey: "fake-api-key", projectId: "demo-spentshare", authDomain: "demo-spentshare.firebaseapp.com",
} : {
  apiKey:"AIzaSyB-KQnjwvoRvUciDDFR5eHOjwGZbh8DBZI",
  authDomain:"spendshare-ed3fa.firebaseapp.com",
  projectId:"spendshare-ed3fa",
  storageBucket:"spendshare-ed3fa.firebasestorage.app",
  messagingSenderId:"142707923361",
  appId:"1:142707923361:web:55b965b821dfa336b413e0"
});

// Caché offline: carga instantánea desde el teléfono, sincroniza por detrás
let db;
try {
  db = initializeFirestore(app, {
    localCache: EMU ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch(e) {
  db = initializeFirestore(app, {});
}
const auth = getAuth(app);
const functions = getFunctions(app, 'us-east1');
const gProvider = new GoogleAuthProvider();

if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  window._emu = true;
}

window._callFn = (name, data) => httpsCallable(functions, name)(data);

window._db=db; window._auth=auth;
window._addDoc=addDoc; window._col=collection; window._srvTs=serverTimestamp;
window._delDoc=deleteDoc; window._docRef=doc; window._getDocs=getDocs;
window._setDoc=setDoc; window._getDoc=getDoc; window._updateDoc=updateDoc; window._query=query;
window._where=where; window._orderBy=orderBy; window._onSnap=onSnapshot;
window._arrayUnion=arrayUnion; window._arrayRemove=arrayRemove; window._Timestamp=Timestamp;

// Idioma con el que la persona ve la app: los correos le llegan en ese idioma
function uiLang(){
  try { const l = localStorage.getItem('lang'); if (l === 'es' || l === 'en') return l; } catch(e) {}
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

onAuthStateChanged(auth, async user => {
  window._curUser = user;
  if (user) {
    try {
      const ref = doc(db,'users',user.uid);
      const snap = await getDoc(ref);
      const data = { uid:user.uid, email:user.email, lang:uiLang(), updatedAt:serverTimestamp() };
      // El nombre solo se pone la primera vez: después lo cambia la persona en su perfil
      if (!snap.exists() || !snap.data().name) data.name = user.displayName || (user.email||'').split('@')[0];
      await setDoc(ref, data, { merge:true });
    } catch(e) { console.error('users upsert', e); }
  }
  if (window._onAuthChange) window._onAuthChange(user);
  else window._pendingAuth = { user };
});

window._doSignUp = async (email,pass,name) => {
  const c = await createUserWithEmailAndPassword(auth,email,pass);
  await updateProfile(c.user,{displayName:name});
  await setDoc(doc(db,'users',c.user.uid),{ name, email, lang:uiLang() },{merge:true});
  return c.user;
};
window._doSignIn = (e,p) => signInWithEmailAndPassword(auth,e,p);
window._doGoogle = () => signInWithPopup(auth,gProvider);
window._doSignOut = () => signOut(auth);
window._doResetPassword = (e) => sendPasswordResetEmail(auth,e);
window._setDisplayName = (name) => auth.currentUser ? updateProfile(auth.currentUser,{displayName:name}) : Promise.resolve();
