import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "PUT_YOUR_API_KEY_HERE",
  authDomain: "PUT_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PUT_YOUR_PROJECT_ID",
  storageBucket: "PUT_YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PUT_YOUR_SENDER_ID_HERE",
  appId: "PUT_YOUR_APP_ID_HERE"
};

const ROLE_PAGES = {
  admin: "admin.html",
  manager: "admin.html",
  chef: "chef.html",
  waiter: "waiter.html"
};

const ALL_PERMISSIONS = [
  "dashboard_view","users_manage","permissions_manage","menu_manage",
  "orders_view","orders_prepare","orders_ready","orders_pickup","orders_serve",
  "sales_view","finance_view","profit_view","inventory_view","inventory_manage",
  "reports_view","settings_manage"
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
  if (!message) return;
  message.textContent = text;
  message.className = `message ${type}`;
}

function setLoading(loading) {
  if (!loginBtn) return;
  loginBtn.disabled = loading;
  if (spinner) spinner.classList.toggle("hidden", !loading);
  if (btnText) btnText.textContent = loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول";
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function getFriendlyAuthError(error) {
  switch (error?.code) {
    case "auth/invalid-email": return "البريد الإلكتروني غير صحيح.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    case "auth/user-disabled": return "هذا الحساب معطل من قبل المدير.";
    case "auth/too-many-requests": return "تم إجراء محاولات تسجيل دخول كثيرة. حاول لاحقًا.";
    case "auth/network-request-failed": return "تعذر الاتصال بالإنترنت.";
    default: return "حدث خطأ أثناء تسجيل الدخول.";
  }
}

function normalizePermissions(data, role) {
  if (role === "admin" || role === "manager") {
    return Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true]));
  }
  const source = data?.permissions || {};
  return Object.fromEntries(ALL_PERMISSIONS.map(p => [p, source[p] === true]));
}

async function getUserProfile(uid) {
  if (!uid) throw new Error("USER_UID_MISSING");

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) throw new Error("USER_PROFILE_NOT_FOUND");

  const data = snap.data();
  const role = normalizeRole(data.role);

  if (!role) throw new Error("ROLE_MISSING");
  if (!ROLE_PAGES[role]) throw new Error("UNKNOWN_ROLE");
  if (data.active === false) throw new Error("USER_DISABLED");

  return {
    uid,
    name: data.name || "",
    email: data.email || "",
    role,
    active: data.active !== false,
    permissions: normalizePermissions(data, role)
  };
}

function saveUserSession(profile) {
  sessionStorage.setItem("restaurantUser", JSON.stringify(profile));
}

async function redirectByRole(firebaseUser) {
  const profile = await getUserProfile(firebaseUser.uid);
  saveUserSession(profile);
  window.location.replace(ROLE_PAGES[profile.role]);
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) return showMessage("أدخل البريد الإلكتروني.");
    if (!password) return showMessage("أدخل كلمة المرور.");

    setLoading(true);
    showMessage("");

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await redirectByRole(credential.user);
    } catch (error) {
      console.error("Login Error:", error);

      const messages = {
        USER_PROFILE_NOT_FOUND: "تم تسجيل الدخول، لكن لم يتم العثور على هذا المستخدم داخل users في Firestore.",
        ROLE_MISSING: "تم العثور على المستخدم، لكن حقل role غير موجود في Firestore.",
        UNKNOWN_ROLE: "دور هذا المستخدم غير معروف. يجب أن يكون admin أو chef أو waiter.",
        USER_DISABLED: "هذا الحساب معطل من قبل المدير.",
        USER_UID_MISSING: "تعذر الحصول على UID الخاص بالمستخدم."
      };

      showMessage(messages[error.message] || getFriendlyAuthError(error));

      try { await signOut(auth); } catch (_) {}
    } finally {
      setLoading(false);
    }
  });
}

if (togglePassword) {
  togglePassword.addEventListener("click", () => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePassword.textContent = show ? "🙈" : "👁";
  });
}

// لا يوجد onAuthStateChanged هنا.
// فتح login.html لا يعيد التوجيه تلقائيًا.

export async function logoutUser() {
  try {
    sessionStorage.removeItem("restaurantUser");
    await signOut(auth);
  } finally {
    window.location.replace("login.html");
  }
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
});
    
