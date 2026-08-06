/**
 * firebase.js
 * Central Firebase layer for the Lottery site (Auth + Firestore)
 *
 * Load order on every page:
 *   1. firebase-app-compat.js
 *   2. firebase-auth-compat.js   (needed for admin)
 *   3. firebase-firestore-compat.js
 *   4. firebase.js  (this file)
 *   5. page script
 *
 * Data model (single doc: lottery/data)
 * {
 *   users:   [ { username, password, createdAt } ],
 *   entries: [ { username, displayName, trackCode, createdAt } ],
 *   lotteryStatus: "pending" | "finished",
 *   winner: null | { username, displayName, trackCode },
 *   scheduledAt: null | ISO string,
 *   drawnAt: null | ISO string
 * }
 */

(function (global) {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyDFoF03yoqqucbltqR8zEZoC3JiTVM-4Jc",
    authDomain: "lottery-b17ca.firebaseapp.com",
    projectId: "lottery-b17ca",
    storageBucket: "lottery-b17ca.firebasestorage.app",
    messagingSenderId: "281297582115",
    appId: "1:281297582115:web:185e500d2c0bc1e46ed996",
    measurementId: "G-N9GHM30GMG"
  };

  if (typeof firebase === "undefined") {
    console.error("firebase.js: Firebase SDK must be loaded BEFORE this file");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  var auth = firebase.auth();
  var db = firebase.firestore();
  var DOC_REF = db.collection("lottery").doc("data");
  var SESSION_KEY = "currentUser";

  var cache = {
    users: [],
    entries: [],
    lotteryStatus: "pending",
    winner: null,
    scheduledAt: null,
    drawnAt: null
  };
  var readyPromise = null;

  // ── Helpers ──────────────────────────────────────────
  function normalizeUsername(str) {
    return String(str || "").trim().toLowerCase();
  }

  function normalizeCode(str) {
    return String(str || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function applyData(data) {
    data = data || {};
    cache.users = Array.isArray(data.users) ? data.users : [];
    cache.entries = Array.isArray(data.entries) ? data.entries : [];
    cache.lotteryStatus = data.lotteryStatus === "finished" ? "finished" : "pending";
    cache.winner = data.winner || null;
    cache.scheduledAt = data.scheduledAt || null;
    cache.drawnAt = data.drawnAt || null;
  }

  async function loadFromCloud() {
    try {
      var snap = await DOC_REF.get();
      applyData(snap.exists ? snap.data() : {});
    } catch (e) {
      console.error("LotteryDB: load failed", e);
      applyData({});
    }
    return cache;
  }

  async function persist() {
    try {
      await DOC_REF.set({
        users: cache.users,
        entries: cache.entries,
        lotteryStatus: cache.lotteryStatus,
        winner: cache.winner,
        scheduledAt: cache.scheduledAt,
        drawnAt: cache.drawnAt
      });
    } catch (e) {
      console.error("LotteryDB: save failed", e);
      throw e;
    }
  }

  // ── Init ─────────────────────────────────────────────
  function init() {
    if (!readyPromise) {
      readyPromise = loadFromCloud();
    }
    return readyPromise;
  }

  // ── Users ────────────────────────────────────────────
  function getUsers() {
    return cache.users.slice();
  }

  function findUser(username) {
    var target = normalizeUsername(username);
    for (var i = 0; i < cache.users.length; i++) {
      if (normalizeUsername(cache.users[i].username) === target) {
        return cache.users[i];
      }
    }
    return null;
  }

  async function addUser(user) {
    cache.users.push(user);
    await persist();
    return user;
  }

  // ── Entries ──────────────────────────────────────────
  function getEntries() {
    return cache.entries.slice();
  }

  function findEntryByUsername(username) {
    var target = normalizeUsername(username);
    for (var i = 0; i < cache.entries.length; i++) {
      if (normalizeUsername(cache.entries[i].username) === target) {
        return cache.entries[i];
      }
    }
    return null;
  }

  function findEntryByCode(code) {
    var target = normalizeCode(code);
    if (!target) return null;
    for (var i = 0; i < cache.entries.length; i++) {
      var c = normalizeCode(cache.entries[i].trackCode || cache.entries[i].code);
      if (c && c === target) return cache.entries[i];
    }
    return null;
  }

  async function addEntry(entry) {
    cache.entries.push(entry);
    await persist();
    return entry;
  }

  // ── Admin: Ban (remove from lottery) ─────────────────
  async function banEntry(username) {
    var target = normalizeUsername(username);
    cache.entries = cache.entries.filter(function (e) {
      return normalizeUsername(e.username) !== target;
    });
    // اگر برنده همین نفر بود، برنده رو هم پاک کن
    if (cache.winner && normalizeUsername(cache.winner.username) === target) {
      cache.winner = null;
      cache.lotteryStatus = "pending";
      cache.drawnAt = null;
    }
    await persist();
  }

  // ── Admin: Reset entries ─────────────────────────────
  async function resetEntries() {
    cache.entries = [];
    cache.winner = null;
    cache.lotteryStatus = "pending";
    cache.drawnAt = null;
    await persist();
  }

  // ── Admin: Schedule ──────────────────────────────────
  async function setSchedule(isoString) {
    cache.scheduledAt = isoString || null;
    await persist();
  }

  // ── Admin: Draw winner ───────────────────────────────
  async function drawWinner() {
    if (!cache.entries.length) {
      throw new Error("هیچ شرکت‌کننده‌ای وجود ندارد");
    }
    if (cache.lotteryStatus === "finished" && cache.winner) {
      throw new Error("قرعه‌کشی قبلاً انجام شده است");
    }
    var idx = Math.floor(Math.random() * cache.entries.length);
    var winner = cache.entries[idx];
    cache.winner = {
      username: winner.username,
      displayName: winner.displayName,
      trackCode: winner.trackCode
    };
    cache.lotteryStatus = "finished";
    cache.drawnAt = new Date().toISOString();
    await persist();
    return cache.winner;
  }

  // ── Lottery status helpers ───────────────────────────
  function getLotteryStatus() {
    return cache.lotteryStatus;
  }

  function getWinner() {
    return cache.winner ? Object.assign({}, cache.winner) : null;
  }

  function getScheduledAt() {
    return cache.scheduledAt;
  }

  function getDrawnAt() {
    return cache.drawnAt;
  }

  // ── Session (localStorage only) ──────────────────────
  var session = {
    get: function () {
      return localStorage.getItem(SESSION_KEY) || "";
    },
    set: function (username) {
      localStorage.setItem(SESSION_KEY, String(username || ""));
    },
    clear: function () {
      localStorage.removeItem(SESSION_KEY);
    }
  };

  function requireLogin(redirectUrl) {
    var user = session.get();
    if (!user) {
      window.location.href = redirectUrl || "index.html";
      return null;
    }
    return user;
  }

  // ── Firebase Auth (for Admin) ────────────────────────
  function adminLogin(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }

  function adminLogout() {
    return auth.signOut();
  }

  function onAdminAuth(callback) {
    return auth.onAuthStateChanged(callback);
  }

  function getAdminUser() {
    return auth.currentUser;
  }

  // ── Expose ───────────────────────────────────────────
  global.LotteryDB = {
    init: init,
    getUsers: getUsers,
    findUser: findUser,
    addUser: addUser,
    getEntries: getEntries,
    findEntryByUsername: findEntryByUsername,
    findEntryByCode: findEntryByCode,
    addEntry: addEntry,
    banEntry: banEntry,
    resetEntries: resetEntries,
    setSchedule: setSchedule,
    drawWinner: drawWinner,
    getLotteryStatus: getLotteryStatus,
    getWinner: getWinner,
    getScheduledAt: getScheduledAt,
    getDrawnAt: getDrawnAt,
    session: session,
    requireLogin: requireLogin,
    normalizeUsername: normalizeUsername,
    normalizeCode: normalizeCode,
    // Auth
    adminLogin: adminLogin,
    adminLogout: adminLogout,
    onAdminAuth: onAdminAuth,
    getAdminUser: getAdminUser
  };
})(window);
