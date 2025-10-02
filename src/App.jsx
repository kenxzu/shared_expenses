"use client";
import "./App.css";

import React, { useState, useEffect, useMemo } from "react";
import { firebaseConfig, appId as importedAppId } from "./firebaseConfig";
import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  doc,
  getDocs,
  where,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { setLogLevel } from "firebase/firestore";

// --- Helper Icon Components ---
const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 mr-2"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);
const DollarSignIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 mr-2"
  >
    <line x1="12" y1="1" x2="12" y2="23"></line>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
  </svg>
);
const ArrowRightIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4 mx-2"
  >
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);
const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);
const MenuIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
  >
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

// --- Main App Component ---
export default function ExpenseManagerApp() {
  // --- Firebase State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);

  // --- Data State ---
  const [users, setUsers] = useState([]);
  const [expensesBase, setExpensesBase] = useState([]);
  const [expenseSplits, setExpenseSplits] = useState([]);
  const [payments, setPayments] = useState([]);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); // <-- NEW: State to prevent login flash

  // --- App Auth State ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoginEmail, setAdminLoginEmail] = useState("");
  const [adminLoginPassword, setAdminLoginPassword] = useState("");
  const appId = importedAppId;

  useEffect(() => {
    let title = "Expense Manager";
    switch (activeTab) {
      case "dashboard":
        title = "Dashboard | Expense Manager";
        break;
      case "addExpense":
        title = "Add Expense | Expense Manager";
        break;
      case "addPayment":
        title = "Add Payment | Expense Manager";
        break;
      case "manageUsers":
        title = "Manage Users | Expense Manager";
        break;
      default:
        title = "Expense Manager";
    }
    document.title = title;
  }, [activeTab]);

  // --- Firebase Initialization & Auth State Change ---
  useEffect(() => {
    try {
      if (!firebaseConfig.apiKey) {
        setError("Firebase configuration is missing.");
        setLoading(false);
        return;
      }
      const app = initializeApp(firebaseConfig);
      getAnalytics(app);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestoreDb);
      setAuth(firebaseAuth);
      setLogLevel("debug");

      const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
        // --- MODIFIED: Prevent setting user during registration flow ---
        if (isRegistering) return;

        setUser(currentUser);
        setIsAdmin(currentUser?.email === "admin@sharedexpenses.com");
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase Init Error:", e);
      setError("Could not initialize the application.");
      setLoading(false);
    }
  }, [isRegistering]); // Dependency on isRegistering ensures the listener is aware of the state

  // --- Data Fetching Effect ---
  useEffect(() => {
    if (!user || !db) return;
    const publicDataPath = `artifacts/${appId}/public/data`;
    const unsubscribes = [
      onSnapshot(query(collection(db, `${publicDataPath}/users`)), (snapshot) =>
        setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
      ),
      onSnapshot(
        query(collection(db, `${publicDataPath}/expenses`)),
        (snapshot) =>
          setExpensesBase(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          )
      ),
      onSnapshot(
        query(collection(db, `${publicDataPath}/expenseSplits`)),
        (snapshot) =>
          setExpenseSplits(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          )
      ),
      onSnapshot(
        query(collection(db, `${publicDataPath}/payments`)),
        (snapshot) =>
          setPayments(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          )
      ),
    ];
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [user, db, appId]);

  // Join expenses with latest splits reactively
  const expensesJoined = useMemo(() => {
    if (!expensesBase || expensesBase.length === 0) return [];
    const splitsByExpense = new Map();
    (expenseSplits || []).forEach((s) => {
      const key = s.ExpenseID;
      if (!splitsByExpense.has(key)) splitsByExpense.set(key, []);
      splitsByExpense.get(key).push(s);
    });
    return expensesBase.map((e) => ({
      ...e,
      splits: splitsByExpense.get(e.id) || [],
    }));
  }, [expensesBase, expenseSplits]);

  // --- Logic Handlers ---
  const handleSettleDebt = async (debt) => {
    if (!db) return;
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      await addDoc(collection(db, `${publicDataPath}/payments`), {
        FromUserID: debt.from,
        ToUserID: debt.to,
        Amount: Number(Number(debt.amount).toFixed(2)),
        DateOfPayment: new Date().toISOString(),
      });
    } catch (err) {
      setError("Failed to record the payment.");
    }
  };

  const handleSettleAllDebts = async (debts) => {
    if (!db || !Array.isArray(debts) || debts.length === 0) return;
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      const nowIso = new Date().toISOString();
      await Promise.all(
        debts.map((debt) =>
          addDoc(collection(db, `${publicDataPath}/payments`), {
            FromUserID: debt.from,
            ToUserID: debt.to,
            Amount: Number(Number(debt.amount).toFixed(2)),
            DateOfPayment: nowIso,
          })
        )
      );
    } catch (err) {
      setError("Failed to settle all balances.");
    }
  };

  const handleDeleteUser = async (userIdToDelete) => {
    if (
      expensesJoined.some(
        (e) =>
          e.PayerID === userIdToDelete ||
          e.splits.some((s) => s.UserID === userIdToDelete)
      ) ||
      payments.some(
        (p) => p.FromUserID === userIdToDelete || p.ToUserID === userIdToDelete
      )
    ) {
      setError("Cannot delete user involved in transactions.");
      setTimeout(() => setError(""), 5000);
      return;
    }
    try {
      await deleteDoc(
        doc(db, `artifacts/${appId}/public/data/users`, userIdToDelete)
      );
    } catch (err) {
      setError("Failed to delete user.");
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      const splitsQuery = query(
        collection(db, `${publicDataPath}/expenseSplits`),
        where("ExpenseID", "==", expenseId)
      );
      const splitsSnapshot = await getDocs(splitsQuery);
      await Promise.all(
        splitsSnapshot.docs.map((docRef) => deleteDoc(docRef.ref))
      );
      await deleteDoc(doc(db, `${publicDataPath}/expenses`, expenseId));
    } catch (err) {
      setError("Failed to delete expense.");
    }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await deleteDoc(
        doc(db, `artifacts/${appId}/public/data/payments`, paymentId)
      );
    } catch (err) {
      setError("Failed to delete payment.");
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!adminLoginEmail || !adminLoginPassword) {
      setError("Please enter admin email and password.");
      return;
    }
    try {
      await signInWithEmailAndPassword(
        auth,
        adminLoginEmail,
        adminLoginPassword
      );
      setShowAdminLogin(false);
      setAdminLoginEmail("");
      setAdminLoginPassword("");
    } catch (err) {
      setError("Admin login failed. Check credentials.");
    }
  };

  const balances = useMemo(() => {
    if (users.length === 0) return { balances: [], simplifiedDebts: [] };

    const userBalances = {};
    users.forEach((user) => (userBalances[user.id] = 0));
    // Build per-expense who-owes-who list
    const perExpenseDebtsByExpense = [];

    expensesJoined.forEach((expense) => {
      const payerId = expense.PayerID;
      if (!(payerId in userBalances)) userBalances[payerId] = 0;

      // Use stored splits exactly as the source of truth (in cents)
      const sharesCents = (expense.splits || []).map((s) =>
        Math.round((Number(s.OwedAmount) || 0) * 100)
      );

      // Prepare expense-level debt items
      const expenseGroup = {
        expenseId: expense.id,
        description: expense.Description || "",
        date: expense.DateOfExpense || null,
        payerId,
        payerName: users.find((u) => u.id === payerId)?.UserName || "Unknown",
        items: [],
      };

      (expense.splits || []).forEach((split, idx) => {
        const splitUserId = split.UserID;
        const owedCents = sharesCents[idx] || 0;
        const owedAmount = owedCents / 100;

        if (!(splitUserId in userBalances)) userBalances[splitUserId] = 0;

        if (splitUserId !== payerId && owedCents > 0) {
          // Update balances
          userBalances[splitUserId] -= owedAmount;
          userBalances[payerId] += owedAmount;
          // Add to per-expense debts list
          expenseGroup.items.push({
            from: splitUserId,
            fromName:
              users.find((u) => u.id === splitUserId)?.UserName || "Unknown",
            to: payerId,
            toName: users.find((u) => u.id === payerId)?.UserName || "Unknown",
            amount: Number((owedCents / 100).toFixed(2)),
          });
        }
      });

      if (expenseGroup.items.length > 0)
        perExpenseDebtsByExpense.push(expenseGroup);
    });

    payments.forEach((payment) => {
      const fromId = payment.FromUserID;
      const toId = payment.ToUserID;
      const paymentAmount = Number(payment.Amount) || 0;

      if (!(fromId in userBalances)) userBalances[fromId] = 0;
      if (!(toId in userBalances)) userBalances[toId] = 0;

      userBalances[fromId] += paymentAmount;
      userBalances[toId] -= paymentAmount;
    });

    const EPSILON = 0.005; // smooth out rounding noise below half a cent

    const balancesArray = Object.entries(userBalances).map(
      ([userId, balance]) => {
        const numericBalance = Number(balance) || 0;
        const normalizedBalance =
          Math.abs(numericBalance) < EPSILON ? 0 : numericBalance;
        const balanceCents = Math.round(normalizedBalance * 100);

        return {
          userId,
          userName: users.find((u) => u.id === userId)?.UserName || "Unknown",
          balanceCents,
        };
      }
    );

    let totalCents = balancesArray.reduce(
      (sum, entry) => sum + entry.balanceCents,
      0
    );

    if (totalCents !== 0 && balancesArray.length > 0) {
      const adjustTarget = balancesArray.reduce(
        (prev, current) =>
          Math.abs(current.balanceCents) > Math.abs(prev.balanceCents)
            ? current
            : prev,
        balancesArray[0]
      );
      adjustTarget.balanceCents -= totalCents;
      totalCents = 0;
    }

    balancesArray.forEach((entry) => {
      entry.balance = Number((entry.balanceCents / 100).toFixed(2));
    });

    const debtorsQueue = balancesArray
      .filter((b) => b.balanceCents < 0)
      .map((b) => ({
        userId: b.userId,
        userName: b.userName,
        remainingCents: -b.balanceCents,
      }))
      .sort((a, b) => a.remainingCents - b.remainingCents);

    const creditorsQueue = balancesArray
      .filter((b) => b.balanceCents > 0)
      .map((b) => ({
        userId: b.userId,
        userName: b.userName,
        remainingCents: b.balanceCents,
      }))
      .sort((a, b) => a.remainingCents - b.remainingCents);

    const simplifiedDebts = [];
    while (debtorsQueue.length > 0 && creditorsQueue.length > 0) {
      const debtor = debtorsQueue[0];
      const creditor = creditorsQueue[0];
      const settlementCents = Math.min(
        debtor.remainingCents,
        creditor.remainingCents
      );

      if (settlementCents > 0) {
        simplifiedDebts.push({
          from: debtor.userId,
          fromName: debtor.userName,
          to: creditor.userId,
          toName: creditor.userName,
          amount: Number((settlementCents / 100).toFixed(2)),
        });
      }

      debtor.remainingCents -= settlementCents;
      creditor.remainingCents -= settlementCents;

      if (debtor.remainingCents === 0) debtorsQueue.shift();
      if (creditor.remainingCents === 0) creditorsQueue.shift();
    }

    if (simplifiedDebts.length === 0) {
      balancesArray.forEach((entry) => {
        entry.balance = 0;
        entry.balanceCents = 0;
      });
    }

    // Flatten per-expense debts for convenient bulk actions
    const perExpenseDebtsFlat = perExpenseDebtsByExpense.flatMap(
      (g) => g.items
    );

    // Compute remaining debts by applying payments to earlier debts only (time-aware)
    // 1) Flatten debts with dates and work in cents
    const debtsFlat = perExpenseDebtsByExpense
      .flatMap((g) =>
        g.items.map((it) => ({
          expenseId: g.expenseId,
          description: g.description,
          date: g.date ? new Date(g.date).getTime() : 0,
          payerId: g.payerId,
          payerName: g.payerName,
          from: it.from,
          fromName: it.fromName,
          to: it.to,
          toName: it.toName,
          remainingCents: Math.round((Number(it.amount) || 0) * 100),
        }))
      )
      .sort((a, b) => a.date - b.date);

    // 2) Sort payments by time and apply to earliest matching debts (same direction) with older/equal date
    const paymentsSorted = [...payments]
      .map((p) => ({
        from: p.FromUserID,
        to: p.ToUserID,
        cents: Math.round((Number(p.Amount) || 0) * 100),
        date: p.DateOfPayment ? new Date(p.DateOfPayment).getTime() : 0,
      }))
      .sort((a, b) => a.date - b.date);

    paymentsSorted.forEach((pay) => {
      if (!pay.cents) return;
      for (let i = 0; i < debtsFlat.length && pay.cents > 0; i++) {
        const d = debtsFlat[i];
        if (d.remainingCents <= 0) continue;
        if (d.date > pay.date) break; // future debt; later payments will handle
        if (d.from === pay.from && d.to === pay.to) {
          const applied = Math.min(d.remainingCents, pay.cents);
          d.remainingCents -= applied;
          pay.cents -= applied;
        }
      }
    });

    // 3) Rebuild remaining group list
    const remainingByExpense = new Map();
    debtsFlat.forEach((d) => {
      if (d.remainingCents <= 0) return;
      if (!remainingByExpense.has(d.expenseId)) {
        remainingByExpense.set(d.expenseId, {
          expenseId: d.expenseId,
          description: d.description,
          date: d.date ? new Date(d.date).toISOString() : null,
          payerId: d.payerId,
          payerName: d.payerName,
          items: [],
        });
      }
      remainingByExpense.get(d.expenseId).items.push({
        from: d.from,
        fromName: d.fromName,
        to: d.to,
        toName: d.toName,
        amount: Number((d.remainingCents / 100).toFixed(2)),
      });
    });

    const perExpenseDebtsByExpenseRemaining = Array.from(
      remainingByExpense.values()
    );
    const perExpenseDebtsFlatRemaining = debtsFlat
      .filter((d) => d.remainingCents > 0)
      .map((d) => ({
        from: d.from,
        fromName: d.fromName,
        to: d.to,
        toName: d.toName,
        amount: Number((d.remainingCents / 100).toFixed(2)),
      }));

    return {
      balances: balancesArray,
      simplifiedDebts,
      perExpenseDebtsByExpense,
      perExpenseDebtsFlat,
      perExpenseDebtsByExpenseRemaining,
      perExpenseDebtsFlatRemaining,
    };
  }, [users, expensesJoined, payments]);

  // --- Render Logic ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl w-screen">Intern A 1207 Please Wait...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPage
        auth={auth}
        db={db}
        parentSetError={setError}
        appId={appId}
        setIsRegistering={setIsRegistering}
      />
    );
  }

  const handleMobileNavClick = (tabName) => {
    setActiveTab(tabName);
    setIsMenuOpen(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
            users={users}
            expenses={expensesJoined}
            payments={payments}
            balances={balances}
            onDeleteExpense={handleDeleteExpense}
            onDeletePayment={handleDeletePayment}
            onSettleDebt={handleSettleDebt}
            onSettleAllDebts={handleSettleAllDebts}
            isAdmin={isAdmin}
            loggedInUserId={user.uid}
          />
        );
      case "addExpense":
        return (
          <AddExpenseForm
            db={db}
            users={users}
            setError={setError}
            setActiveTab={setActiveTab}
            appId={appId}
          />
        );
      case "addPayment":
        return isAdmin ? (
          <AddPaymentForm
            db={db}
            users={users}
            setError={setError}
            setActiveTab={setActiveTab}
            appId={appId}
          />
        ) : (
          <div className="text-center text-red-400">Admin access required.</div>
        );
      case "manageUsers":
        return isAdmin ? (
          <ManageUsers users={users} onDeleteUser={handleDeleteUser} />
        ) : (
          <div className="text-center text-red-400">Admin access required.</div>
        );
      default:
        return (
          <Dashboard
            users={users}
            expenses={expensesJoined}
            payments={payments}
            balances={balances}
            onDeleteExpense={handleDeleteExpense}
            onDeletePayment={handleDeletePayment}
            onSettleDebt={handleSettleDebt}
            onSettleAllDebts={handleSettleAllDebts}
            isAdmin={isAdmin}
            loggedInUserId={user.uid}
          />
        );
    }
  };

  // --- Main App JSX ---
  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen font-sans flex flex-col w-screen">
      {showAdminLogin && (
        <div className="flex items-center justify-center h-screen fixed inset-0 bg-black bg-opacity-60 z-50">
          <form
            onSubmit={handleAdminLogin}
            className="bg-gray-800 border border-gray-700 rounded-lg p-8 w-full max-w-md mx-auto relative"
          >
            <button
              type="button"
              onClick={() => setShowAdminLogin(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              &times;
            </button>
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
              Admin Login
            </h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={adminLoginEmail}
                onChange={(e) => setAdminLoginEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={adminLoginPassword}
                onChange={(e) => setAdminLoginPassword(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2"
                placeholder="Password"
              />
            </div>
            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-md w-full"
            >
              Login
            </button>
          </form>
        </div>
      )}

      <div className="w-full max-w-7xl p-4 sm:p-6 lg:p-8 flex-grow flex flex-col">
        <header className="flex flex-col md:flex-row justify-between items-center mb-4 md:mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-cyan-400">
              Expense Manager
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              InternA 1207 12th floor
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm flex-wrap justify-center">
            <span className="text-gray-300">
              {user.email}{" "}
              {isAdmin && <span className="text-green-400">(Admin)</span>}
            </span>
            <button
              onClick={handleLogout}
              className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-md text-xs"
            >
              Logout
            </button>
            {!isAdmin && (
              <button
                onClick={() => setShowAdminLogin(true)}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1 rounded-md text-xs"
              >
                Admin Login
              </button>
            )}
          </div>
        </header>

        <nav className="relative mb-8">
          <div className="hidden md:flex flex-wrap border-b border-gray-700 justify-start">
            <TabButton
              name="dashboard"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Dashboard
            </TabButton>
            <TabButton
              name="addExpense"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            >
              Add Expense
            </TabButton>
            {isAdmin && (
              <>
                <TabButton
                  name="addPayment"
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                >
                  Add Payment
                </TabButton>
                <TabButton
                  name="manageUsers"
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                >
                  Manage Users
                </TabButton>
              </>
            )}
          </div>
          <div className="md:hidden flex justify-between items-center border-b border-gray-700 p-2">
            <span className="text-lg font-semibold text-white ml-2 capitalize">
              {activeTab.replace(/([A-Z])/g, " $1").trim()}
            </span>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
              <MenuIcon />
            </button>
          </div>
          {isMenuOpen && (
            <div className="md:hidden absolute top-full right-0 mt-1 w-full bg-gray-800 border-gray-700 rounded-md shadow-lg z-20">
              <a
                href="#dashboard"
                onClick={(e) => {
                  e.preventDefault();
                  handleMobileNavClick("dashboard");
                }}
                className={`block px-4 py-3 text-sm ${
                  activeTab === "dashboard"
                    ? "text-cyan-400 bg-gray-700"
                    : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                Dashboard
              </a>
              <a
                href="#addExpense"
                onClick={(e) => {
                  e.preventDefault();
                  handleMobileNavClick("addExpense");
                }}
                className={`block px-4 py-3 text-sm ${
                  activeTab === "addExpense"
                    ? "text-cyan-400 bg-gray-700"
                    : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                Add Expense
              </a>
              {isAdmin && (
                <>
                  <a
                    href="#addPayment"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMobileNavClick("addPayment");
                    }}
                    className={`block px-4 py-3 text-sm ${
                      activeTab === "addPayment"
                        ? "text-cyan-400 bg-gray-700"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Add Payment
                  </a>
                  <a
                    href="#manageUsers"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMobileNavClick("manageUsers");
                    }}
                    className={`block px-4 py-3 text-sm ${
                      activeTab === "manageUsers"
                        ? "text-cyan-400 bg-gray-700"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Manage Users
                  </a>
                </>
              )}
            </div>
          )}
        </nav>

        <main className="flex-grow">
          {error && (
            <div className="bg-red-800/50 border-red-600 text-red-200 p-3 rounded-md mb-6 text-center relative text-sm">
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 font-bold text-lg"
              >
                &times;
              </button>
            </div>
          )}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// --- Authentication Page Component ---
const AuthPage = ({ auth, db, parentSetError, appId, setIsRegistering }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    parentSetError("");

    if (!isLogin && password.length < 6) {
      setError("Your password must be at least 6 characters long.");
      return;
    }

    // Set registering state in parent to prevent login flash
    if (!isLogin) setIsRegistering(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!userName.trim()) {
          setError("Please enter a user name.");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const publicDataPath = `artifacts/${appId}/public/data`;
        await setDoc(
          doc(db, `${publicDataPath}/users`, userCredential.user.uid),
          {
            UserName: userName.trim(),
          }
        );

        await signOut(auth);
        setRegistrationSuccess(true);
        setEmail("");
        setPassword("");
        setUserName("");
      }
    } catch (err) {
      switch (err.code) {
        case "auth/weak-password":
          setError("Your password must be at least 6 characters long.");
          break;
        case "auth/wrong-password":
        case "auth/user-not-found":
          setError("Incorrect email or password. Please try again.");
          break;
        case "auth/email-already-in-use":
          setError("An account with this email address already exists.");
          break;
        default:
          setError("An error occurred. Please try again.");
          console.error("Firebase auth error:", err);
          break;
      }
    } finally {
      // Always reset registering state
      if (!isLogin) setIsRegistering(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      {registrationSuccess && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black bg-opacity-75">
          <div className="w-full max-w-sm p-8 space-y-6 text-center bg-gray-800 border border-gray-700 rounded-lg">
            <h2 className="text-2xl font-bold text-green-400">
              Successfully Registered!
            </h2>
            <p className="text-gray-300">
              You can now log in with your new account.
            </p>
            <button
              onClick={() => {
                setRegistrationSuccess(false);
                setIsLogin(true);
              }}
              className="w-full py-2 font-bold text-white bg-cyan-600 rounded-md hover:bg-cyan-700"
            >
              Login Now
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 border border-gray-700 rounded-lg">
        <h2 className="text-2xl font-bold text-center text-cyan-400">
          {isLogin ? "Login" : "Register"}
        </h2>
        {error && (
          <div className="p-3 text-center text-sm text-red-200 bg-red-800/50 border border-red-600 rounded-md">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-300">
                User Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                className="w-full px-4 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 font-bold text-white bg-cyan-600 rounded-md hover:bg-cyan-700"
          >
            {isLogin ? "Login" : "Register"}
          </button>
        </form>
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError("");
          }}
          className="w-full text-sm text-center text-cyan-400 hover:underline"
        >
          {isLogin ? "Need an account? Register" : "Have an account? Login"}
        </button>
      </div>
    </div>
  );
};

// --- Other UI Components ---
const TabButton = ({ name, activeTab, setActiveTab, children }) => (
  <button
    onClick={() => setActiveTab(name)}
    className={`px-4 py-3 text-sm font-medium -mb-px ml-1 mb-3 ${
      activeTab === name
        ? "border-b-2 border-cyan-400 text-cyan-400"
        : "border-b-2 border-transparent text-gray-400 hover:text-white"
    }`}
  >
    {children}
  </button>
);
const Card = ({ children, className = "" }) => (
  <div
    className={`bg-gray-800 border border-gray-700 rounded-lg p-6 ${className}`}
  >
    {children}
  </div>
);
const CardTitle = ({ children }) => (
  <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
    {children}
  </h2>
);
const DeleteButton = ({ onClick }) => (
  <button
    onClick={onClick}
    className="text-gray-500 hover:text-red-400 p-1 rounded-full hover:bg-red-900/50"
  >
    <TrashIcon />
  </button>
);

// --- Page/Tab Components ---
const Dashboard = ({
  users,
  expenses,
  payments,
  balances,
  onSettleDebt,
  onSettleAllDebts,
  isAdmin,
  loggedInUserId,
  onDeleteExpense, // <-- ADD THIS
  onDeletePayment, // <-- AND THIS
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-3">
        <Card>
          <CardTitle>
            <DollarSignIcon />
            Balance Summary
          </CardTitle>
          {isAdmin && (
            <div className="flex justify-end mb-3 gap-2">
              {balances.perExpenseDebtsFlatRemaining &&
                balances.perExpenseDebtsFlatRemaining.length > 0 && (
                  <button
                    onClick={() =>
                      onSettleAllDebts(balances.perExpenseDebtsFlatRemaining)
                    }
                    className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-3 rounded-md text-xs"
                  >
                    Settle All (per expense)
                  </button>
                )}
            </div>
          )}
          {balances.perExpenseDebtsByExpenseRemaining &&
          balances.perExpenseDebtsByExpenseRemaining.length > 0 ? (
            <div className="space-y-4">
              {[...balances.perExpenseDebtsByExpenseRemaining]
                .sort((a, b) => {
                  const ad = a.date ? new Date(a.date).getTime() : 0;
                  const bd = b.date ? new Date(b.date).getTime() : 0;
                  return bd - ad; // newest first
                })
                .map((grp) => (
                  <div
                    key={grp.expenseId}
                    className="bg-gray-700/40 rounded-md p-3"
                  >
                    <div className="flex items-center justify-between mb-2 text-sm text-gray-300">
                      <div>
                        <span className="font-semibold text-white">
                          {grp.description || "(No description)"}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">
                          {grp.date
                            ? new Date(grp.date).toLocaleDateString()
                            : ""}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        Paid by {grp.payerName}
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {grp.items.map((debt, idx) => (
                        <li
                          key={`${grp.expenseId}-${idx}`}
                          className="flex items-center justify-between p-2 bg-gray-700 rounded-md text-sm flex-wrap gap-2"
                        >
                          <div className="flex items-center">
                            <span className="font-bold text-cyan-400">
                              {debt.fromName}
                            </span>
                            <ArrowRightIcon />
                            <span className="font-bold text-green-400">
                              {debt.toName}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-base">Rp{debt.amount.toFixed(2)}</span>
                            {loggedInUserId === debt.to && (
                              <button
                                onClick={() => onSettleDebt(debt)}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md text-xs"
                              >
                                paid
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-gray-400">Tidak ada yang berhutang!</p>
          )}
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card>
          <CardTitle>Recent Expenses</CardTitle>
          {expenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-gray-400 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Payer</th>
                    <th className="p-2">Amount</th>
                    <th className="p-2">Split Details</th>
                    {isAdmin && <th className="p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {[...expenses]
                    .sort(
                      (a, b) =>
                        new Date(b.DateOfExpense) - new Date(a.DateOfExpense)
                    )

                    .map((expense) => (
                      <tr key={expense.id} className="hover:bg-gray-700/50">
                        <td className="p-2 whitespace-nowrap">
                          {new Date(expense.DateOfExpense).toLocaleDateString()}
                        </td>
                        <td className="p-2">{expense.Description}</td>
                        <td className="p-2">
                          {
                            users.find((u) => u.id === expense.PayerID)
                              ?.UserName
                          }
                        </td>
                        <td className="p-2 font-mono whitespace-nowrap">Rp{expense.TotalAmount.toFixed(2)}</td>
                        <td className="p-2 text-xs text-gray-400">
                          {expense.splits
                            .map(
                              (s) =>
                                `${
                                  users.find((u) => u.id === s.UserID)?.UserName
                                }: Rp${s.OwedAmount.toFixed(2)}`
                            )
                            .join(", ")}
                        </td>
                        {isAdmin && (
                          <td className="p-2">
                            <DeleteButton
                              onClick={() => onDeleteExpense(expense.id)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400">No expenses recorded yet.</p>
          )}
        </Card>
      </div>
      <div className="lg:col-span-3">
        <Card>
          <CardTitle>Recent Payments</CardTitle>
          {payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-gray-400 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">From</th>
                    <th className="p-2">To</th>
                    <th className="p-2">Amount</th>
                    {isAdmin && <th className="p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {[...payments]
                    .sort(
                      (a, b) =>
                        new Date(b.DateOfPayment) - new Date(a.DateOfPayment)
                    )

                    .map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-700/50">
                        <td className="p-2 whitespace-nowrap">
                          {new Date(payment.DateOfPayment).toLocaleDateString()}
                        </td>
                        <td className="p-2">
                          {
                            users.find((u) => u.id === payment.FromUserID)
                              ?.UserName
                          }
                        </td>
                        <td className="p-2">
                          {
                            users.find((u) => u.id === payment.ToUserID)
                              ?.UserName
                          }
                        </td>
                        <td className="p-2 font-mono whitespace-nowrap">Rp{payment.Amount.toFixed(2)}</td>
                        {isAdmin && (
                          <td className="p-2">
                            <DeleteButton
                              onClick={() => onDeletePayment(payment.id)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400">No payments recorded yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
};

const ManageUsers = ({ users, onDeleteUser }) => {
  return (
    <Card>
      <CardTitle>Manage Users</CardTitle>
      <div className="mb-6 bg-gray-700/50 p-3 rounded-md border border-gray-600">
        <p className="text-sm text-gray-300">
          Group members are now added automatically when they register for a new
          account. You can use this panel to view and remove existing members.
        </p>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2">Existing Users:</h3>
        {users.length > 0 ? (
          <ul className="space-y-2">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between bg-gray-700 p-3 rounded-md"
              >
                <div>
                  <span className="font-bold">{user.UserName}</span>
                  <span className="block text-xs text-gray-400 mt-1 font-mono">
                    ID: {user.id}
                  </span>
                </div>
                <DeleteButton onClick={() => onDeleteUser(user.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400">No users have registered yet.</p>
        )}
      </div>
    </Card>
  );
};

const AddExpenseForm = ({ db, users, setError, setActiveTab, appId }) => {
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [splitWith, setSplitWith] = useState([]);
  useEffect(() => {
    if (users.length > 0) setSplitWith(users.map((u) => u.id));
  }, [users]);
  const handleSplitToggle = (userId) =>
    setSplitWith((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Parse to integer cents from the raw input to avoid any FP errors
    const raw = String(totalAmount).trim();
    const normalizedRaw = raw
      .replace(/,/g, ".") // support comma decimals
      .replace(/[^0-9.]/g, "");
    const [intPart = "0", decRaw = ""] = normalizedRaw.split(".");
    const decPart = (decRaw + "00").slice(0, 2);
    const totalCents =
      (parseInt(intPart || "0", 10) || 0) * 100 +
      (parseInt(decPart || "0", 10) || 0);

    if (!description || totalCents === 0 || !payerId || splitWith.length === 0)
      return setError("Please fill all fields.");
    if (totalCents <= 0) return setError("Amount must be positive.");
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      const expenseDocRef = await addDoc(
        collection(db, `${publicDataPath}/expenses`),
        {
          Description: description,
          // Store normalized amount derived from integer cents
          TotalAmount: Number((totalCents / 100).toFixed(2)),
          DateOfExpense: new Date().toISOString(),
          PayerID: payerId,
        }
      );
      // Compute equal split from integer cents and distribute remainder fairly (no extra rounding)
      const n = splitWith.length;
      const baseShare = Math.floor(totalCents / n);
      const remainder = totalCents - baseShare * n; // number of users that get +1 cent

      // Use a stable order so remainder distribution is deterministic
      const recipients = [...splitWith];
      await Promise.all(
        recipients.map((userId, idx) => {
          const rawShareCents = baseShare + (idx < remainder ? 1 : 0);
          return addDoc(collection(db, `${publicDataPath}/expenseSplits`), {
            ExpenseID: expenseDocRef.id,
            UserID: userId,
            OwedAmount: Number((rawShareCents / 100).toFixed(2)),
          });
        })
      );
      setActiveTab("dashboard");
    } catch (err) {
      setError("Failed to add expense.");
    }
  };
  return (
    <Card>
      <CardTitle>Add a New Expense</CardTitle>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-700 border-gray-600 rounded-md px-4 py-2"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm mb-1">Total Amount (Rp)</label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full bg-gray-700 border-gray-600 rounded-md px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Paid By</label>
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full bg-gray-700 border-gray-600 rounded-md px-4 py-2"
            >
              <option value="" disabled>
                Select a user
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.UserName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm mb-2">Split Equally With</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {users.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() => handleSplitToggle(user.id)}
                className={`p-3 rounded-md text-sm ${
                  splitWith.includes(user.id)
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                {user.UserName}
              </button>
            ))}
          </div>
        </div>
        <div className="text-right">
          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-md"
          >
            Add Expense
          </button>
        </div>
      </form>
    </Card>
  );
};

const AddPaymentForm = ({ db, users, setError, setActiveTab, appId }) => {
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Robustly parse to integer cents
    const raw = String(amount).trim();
    const normalizedRaw = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const [intPart = "0", decRaw = ""] = normalizedRaw.split(".");
    const decPart = (decRaw + "00").slice(0, 2);
    const amountCents =
      (parseInt(intPart || "0", 10) || 0) * 100 +
      (parseInt(decPart || "0", 10) || 0);

    if (!fromUserId || !toUserId || amountCents === 0)
      return setError("Please fill all fields.");
    if (fromUserId === toUserId)
      return setError("Cannot make a payment to the same user.");
    if (amountCents <= 0) return setError("Amount must be positive.");
    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/payments`), {
        FromUserID: fromUserId,
        ToUserID: toUserId,
        Amount: Number((amountCents / 100).toFixed(2)),
        DateOfPayment: new Date().toISOString(),
      });
      setActiveTab("dashboard");
    } catch (err) {
      setError("Failed to record payment.");
    }
  };

  // (admin migration removed per revert to decimal precision)
  return (
    <Card>
      <CardTitle>Record a Payment</CardTitle>
      <p className="text-sm text-gray-400 mb-6">
        Use this to settle debts between users.
      </p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm mb-1">From (who paid)</label>
            <select
              value={fromUserId}
              onChange={(e) => setFromUserId(e.target.value)}
              className="w-full bg-gray-700 border-gray-600 rounded-md px-4 py-2"
            >
              <option value="" disabled>
                Select a user
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.UserName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">To (who received)</label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full bg-gray-700 border-gray-600 rounded-md px-4 py-2"
            >
              <option value="" disabled>
                Select a user
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.UserName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm mb-1">Amount (Rp)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.01"
            step="0.01"
            className="w-full bg-gray-700 border-gray-600 rounded-md px-4 py-2"
          />
        </div>
        <div className="text-right">
          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-md"
          >
            Record Payment
          </button>
        </div>
      </form>
    </Card>
  );
};
