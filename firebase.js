/**
 * firebase.js
 * -----------------------------------------------------------------------
 * Central Firebase / Firestore integration for the Lottery site.
 *
 * Load order on every page (see bottom of each .html file):
 *   1. firebase-app-compat.js
 *   2. firebase-firestore-compat.js
 *   3. firebase.js   (this file)
 *   4. the page's own inline <script>, which uses window.LotteryDB
 *
 * Data model
 * -----------------------------------------------------------------------
 * Everything lives in ONE Firestore document: lottery/data
 *   {
 *     users:   [ { username, password, createdAt }, ... ],
 *     entries: [ { username, displayName, trackCode, createdAt }, ... ]
 *   }
 *
 * localStorage is used ONLY to remember which user is logged in on this
 * browser (the session key "currentUser"). The users list and the
 * lottery entries are never stored in localStorage - they always come
 * from Firestore.
 *
 * Public API (window.LotteryDB)
 * -----------------------------------------------------------------------
 *   LotteryDB.init()                          -> Promise<{users,entries}>
 *   LotteryDB.getUsers()                      -> array (copy)
 *   LotteryDB.findUser(username)              -> user object | null
 *   LotteryDB.addUser(user)                   -> Promise<user>
 *   LotteryDB.getEntries()                    -> array (copy)
 *   LotteryDB.findEntryByUsername(username)   -> entry object | null
 *   LotteryDB.findEntryByCode(code)           -> entry object | null
 *   LotteryDB.addEntry(entry)                 -> Promise<entry>
 *   LotteryDB.session.get()                   -> string ("" if none)
 *   LotteryDB.session.set(username)           -> void
 *   LotteryDB.session.clear()                 -> void
 *   LotteryDB.requireLogin(redirectUrl)       -> string | null (redirects if not logged in)
 *
 * This module can be safely extended later (e.g. addUser could grow
 * password hashing, entries could gain new fields, etc.) without
 * touching any of the page scripts, since they only talk to LotteryDB.
 */

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // Firebase project config
  // ---------------------------------------------------------------------
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
    console.error(
      "firebase.js: the Firebase SDK scripts must be included BEFORE firebase.js"
    );
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  var db = firebase.firestore();
  var DOC_REF = db.collection("lottery").doc("data");

  var SESSION_KEY = "currentUser";

  // In-memory cache of the single Firestore document.
  var cache = { users: [], entries: [] };
  var readyPromise = null;

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function normalizeUsername(str) {
    return String(str || "").trim().toLowerCase();
  }

  function normalizeCode(str) {
    return String(str || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  async function loadFromCloud() {
    try {
      var snap = await DOC_REF.get();
      var data = snap.exists ? snap.data() || {} : {};
      cache.users = Array.isArray(data.users) ? data.users : [];
      cache.entries = Array.isArray(data.entries) ? data.entries : [];
    } catch (e) {
      console.error("LotteryDB: failed to load data from Firestore", e);
      cache.users = cache.users || [];
      cache.entries = cache.entries || [];
    }
    return cache;
  }

  async function persist() {
    try {
      await DOC_REF.set({ users: cache.users, entries: cache.entries });
    } catch (e) {
      console.error("LotteryDB: failed to save data to Firestore", e);
      throw e;
    }
  }

  // ---------------------------------------------------------------------
  // Public: init
  // ---------------------------------------------------------------------
  function init() {
    if (!readyPromise) {
      readyPromise = loadFromCloud();
    }
    return readyPromise;
  }

  // ---------------------------------------------------------------------
  // Public: users
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Public: entries
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Public: session (localStorage only - never Firestore)
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Expose
  // ---------------------------------------------------------------------
  global.LotteryDB = {
    init: init,
    getUsers: getUsers,
    findUser: findUser,
    addUser: addUser,
    getEntries: getEntries,
    findEntryByUsername: findEntryByUsername,
    findEntryByCode: findEntryByCode,
    addEntry: addEntry,
    session: session,
    requireLogin: requireLogin,
    normalizeUsername: normalizeUsername,
    normalizeCode: normalizeCode
  };
})(window);
