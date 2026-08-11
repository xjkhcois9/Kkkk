import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  ضع إعدادات Firebase الخاصة بمشروع مطعمي هنا.
*/
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqWQHxs7icdXVL2PuWAPtmnHUjPR2kpKc",
  authDomain: "project-ac9d8.firebaseapp.com",
  projectId: "project-ac9d8",
  storageBucket: "project-ac9d8.firebasestorage.app",
  messagingSenderId: "439451492727",
  appId: "1:439451492727:web:acb3007ff68060a7300172"
};

/*
  غيّر أسماء الملفات إذا كانت صفحات نظامك تحمل أسماء مختلفة.
*/
const ROLE_PAGES = {
  admin: "finance.html",
  manager: "finance.html",
  chef: "chef.html",
  waiter: "waiter.html"
};

const ALL_PERMISSIONS = [
  "dashboard_view",
  "users_manage",
  "permissions_manage",
  "menu_manage",
  "orders_view",
  "orders_prepare",
  "orders_ready",
  "orders_pickup",
  "orders_serve",
  "sales_view",
  "finance_view",
  "profit_view",
  "inventory_view",
  "inventory_manage",
  "reports_view",
  "settings_manage"
];

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const btnText = document.getElementById("btnText");
const spinner = document.getElementById("spinner");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message ${type}`;
}

function setLoading(loading) {
  loginBtn.disabled = loading;
  spinner.classList.toggle("hidden", !loading);
  btnText.textContent = loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول";
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function getFriendlyAuthError(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "البريد الإلكتروني غير صحيح.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    case "auth/user-disabled":
      return "هذا الحساب معطل. تواصل مع المدير.";
    case "auth/too-many-requests":
      return "تمت محاولات دخول كثيرة. حاول لاحقًا.";
    case "auth/network-request-failed":
      return "تعذر الاتصال بالإنترنت.";
    default:
      return "حدث خطأ أثناء تسجيل الدخول.";
  }
}

function normalizePermissions(data, role) {
  // المدير يمتلك كل الصلاحيات.
  if (role === "admin" || role === "manager") {
    return Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true]));
  }

  const source = data?.permissions || {};
  return Object.fromEntries(
    ALL_PERMISSIONS.map(p => [p, source[p] === true])
  );
}

async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));

  if (!snap.exists()) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const data = snap.data();
  const role = normalizeRole(data.role);

  if (!role || !ROLE_PAGES[role]) {
    throw new Error("UNKNOWN_ROLE");
  }

  if (data.active === false) {
    throw new Error("USER_DISABLED");
  }

  return {
    ...data,
    uid,
    role,
    permissions: normalizePermissions(data, role)
  };
}

async function redirectByRole(user) {
  const profile = await getUserProfile(user.uid);

  sessionStorage.setItem("restaurantUser", JSON.stringify({
    uid: profile.uid,
    name: profile.name || "",
    email: profile.email || user.email || "",
    role: profile.role,
    permissions: profile.permissions
  }));

  window.location.replace(ROLE_PAGES[profile.role]);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    await redirectByRole(user);
  } catch (error) {
    console.error(error);

    if (error.message === "USER_PROFILE_NOT_FOUND") {
      showMessage("الحساب موجود، لكن بياناته غير موجودة في users داخل Firestore.");
    } else if (error.message === "UNKNOWN_ROLE") {
      showMessage("دور المستخدم غير محدد أو غير مدعوم.");
    } else if (error.message === "USER_DISABLED") {
      showMessage("هذا المستخدم معطل من قبل المدير.");
    } else {
      showMessage("تعذر تحديد صلاحيات المستخدم.");
    }
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }

  setLoading(true);
  showMessage("");

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await redirectByRole(credential.user);
  } catch (error) {
    console.error(error);
    showMessage(
      error.message === "USER_PROFILE_NOT_FOUND"
        ? "الحساب موجود لكن لم تتم إضافة بياناته في Firestore."
        : error.message === "UNKNOWN_ROLE"
        ? "دور هذا المستخدم غير معروف."
        : error.message === "USER_DISABLED"
        ? "هذا الحساب معطل."
        : getFriendlyAuthError(error)
    );
  } finally {
    setLoading(false);
  }
});

togglePassword.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  togglePassword.textContent = show ? "🙈" : "👁";
}); ما هو 
async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));

  if (!snap.exists()) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const data = snap.data();
  const role = normalizeRole(data.role);

  if (!role || !ROLE_PAGES[role]) {
    throw new Error("UNKNOWN_ROLE");
  }

  if (data.active === false) {
    throw new Error("USER_DISABLED");
  }

  return {
    ...data,
    uid,
    role,
    permissions: normalizePermissions(data, role)
  };
}

async function redirectByRole(user) {
  const profile = await getUserProfile(user.uid);

  sessionStorage.setItem("restaurantUser", JSON.stringify({
    uid: profile.uid,
    name: profile.name || "",
    email: profile.email || user.email || "",
    role: profile.role,
    permissions: profile.permissions
  }));

  window.location.replace(ROLE_PAGES[profile.role]);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    await redirectByRole(user);
  } catch (error) {
    console.error(error);

    if (error.message === "USER_PROFILE_NOT_FOUND") {
      showMessage("الحساب موجود، لكن بياناته غير موجودة في users داخل Firestore.");
    } else if (error.message === "UNKNOWN_ROLE") {
      showMessage("دور المستخدم غير محدد أو غير مدعوم.");
    } else if (error.message === "USER_DISABLED") {
      showMessage("هذا المستخدم معطل من قبل المدير.");
    } else {
      showMessage("تعذر تحديد صلاحيات المستخدم.");
    }
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }

  setLoading(true);
  showMessage("");

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await redirectByRole(credential.user);
  } catch (error) {
    console.error(error);
    showMessage(
      error.message === "USER_PROFILE_NOT_FOUND"
        ? "الحساب موجود لكن لم تتم إضافة بياناته في Firestore."
        : error.message === "UNKNOWN_ROLE"
        ? "دور هذا المستخدم غير معروف."
        : error.message === "USER_DISABLED"
        ? "هذا الحساب معطل."
        : getFriendlyAuthError(error)
    );
  } finally {
    setLoading(false);
  }
});

togglePassword.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  togglePassword.textContent = show ? "🙈" : "👁";
});
