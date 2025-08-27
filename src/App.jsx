"use client";
import "./App.css";

import React, { useState, useEffect, useMemo } from "react";
import { firebaseConfig, appId as importedAppId } from "./firebaseConfig";
import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
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

// --- Main App Component ---
export default function ExpenseManagerApp() {
  // --- Firebase State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);

  // --- Data State ---
  const [users, setUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // --- Admin Auth State ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const appId = importedAppId;

  useEffect(() => {
    let title = "Expense Manager"; // Default title
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

  // --- Firebase Initialization ---
  useEffect(() => {
    try {
      if (!firebaseConfig.apiKey) {
        setError("Firebase configuration is missing.");
        setLoading(false);
        return;
      }
      const app = initializeApp(firebaseConfig);
      const analytics = getAnalytics(app);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestoreDb);
      setAuth(firebaseAuth);
      setLogLevel("debug");
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          setUserId(user.uid);
          if (user.email === "admin@sharedexpenses.com") {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
          // Auth is ready, but don't stop loading until data is fetched.
        } else {
          // No user is signed in. Attempt to sign in anonymously.
          signInAnonymously(firebaseAuth).catch((error) => {
            console.error("Anonymous sign-in failed:", error);
            setError("Could not connect to the service.");
            setLoading(false);
          });
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase Init Error:", e);
      setError(
        "Could not initialize the application. Check console for details."
      );
      setLoading(false);
    }
  }, []);

  // --- Data Fetching Effect ---
  useEffect(() => {
    if (!userId || !db) return;

    const publicDataPath = `artifacts/${appId}/public/data`;

    let userUnsubscribe, expensesUnsubscribe, paymentsUnsubscribe;

    const checkDataLoaded = (() => {
      let loaded = { users: false, expenses: false, payments: false };
      return (type) => {
        loaded[type] = true;
        if (loaded.users && loaded.expenses && loaded.payments) {
          setInitialDataLoaded(true);
          setLoading(false);
        }
      };
    })();

    const usersQuery = query(collection(db, `${publicDataPath}/users`));
    userUnsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        checkDataLoaded("users");
      },
      (err) => {
        console.error("Error fetching users:", err);
        setError("Failed to load user data.");
      }
    );

    const expensesQuery = query(collection(db, `${publicDataPath}/expenses`));
    expensesUnsubscribe = onSnapshot(
      expensesQuery,
      async (snapshot) => {
        const expensesData = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const expense = { id: doc.id, ...doc.data() };
            const splitsQuery = query(
              collection(db, `${publicDataPath}/expenseSplits`),
              where("ExpenseID", "==", doc.id)
            );
            const splitsSnapshot = await getDocs(splitsQuery);
            expense.splits = splitsSnapshot.docs.map((splitDoc) => ({
              id: splitDoc.id,
              ...splitDoc.data(),
            }));
            return expense;
          })
        );
        setExpenses(expensesData);
        checkDataLoaded("expenses");
      },
      (err) => {
        console.error("Error fetching expenses:", err);
        setError("Failed to load expense data.");
      }
    );

    const paymentsQuery = query(collection(db, `${publicDataPath}/payments`));
    paymentsUnsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        setPayments(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
        checkDataLoaded("payments");
      },
      (err) => {
        console.error("Error fetching payments:", err);
        setError("Failed to load payment data.");
      }
    );

    return () => {
      if (userUnsubscribe) userUnsubscribe();
      if (expensesUnsubscribe) expensesUnsubscribe();
      if (paymentsUnsubscribe) paymentsUnsubscribe();
    };
  }, [userId, db, appId]);

  //--Handel settle debt
  // --- Add this new function ---
  const handleSettleDebt = async (debt) => {
    if (!db) {
      setError("Database connection is not available.");
      return;
    }
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      await addDoc(collection(db, `${publicDataPath}/payments`), {
        FromUserID: debt.from,
        ToUserID: debt.to,
        Amount: debt.amount,
        DateOfPayment: new Date().toISOString(),
      });
      setError(""); // Clear any previous errors
    } catch (err) {
      console.error("Error settling debt: ", err);
      setError("Failed to record the payment.");
    }
  };

  // --- Deletion Logic ---
  const handleDeleteUser = async (userIdToDelete) => {
    // Safety check: prevent deletion if user is involved in any transaction
    const isPayer = expenses.some((e) => e.PayerID === userIdToDelete);
    const isInSplit = expenses.some((e) =>
      e.splits.some((s) => s.UserID === userIdToDelete)
    );
    const isInPayment = payments.some(
      (p) => p.FromUserID === userIdToDelete || p.ToUserID === userIdToDelete
    );

    if (isPayer || isInSplit || isInPayment) {
      setError(
        "Cannot delete user. They are involved in existing financial records. Please settle all debts first."
      );
      setTimeout(() => setError(""), 5000); // Clear error after 5 seconds
      return;
    }

    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      await deleteDoc(doc(db, `${publicDataPath}/users`, userIdToDelete));
      setError("");
    } catch (err) {
      console.error("Error deleting user:", err);
      setError("Failed to delete user.");
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      // 1. Find and delete all related splits
      const splitsQuery = query(
        collection(db, `${publicDataPath}/expenseSplits`),
        where("ExpenseID", "==", expenseId)
      );
      const splitsSnapshot = await getDocs(splitsQuery);
      const deleteSplitPromises = splitsSnapshot.docs.map((docRef) =>
        deleteDoc(docRef.ref)
      );
      await Promise.all(deleteSplitPromises);

      // 2. Delete the expense itself
      await deleteDoc(doc(db, `${publicDataPath}/expenses`, expenseId));
      setError("");
    } catch (err) {
      console.error("Error deleting expense:", err);
      setError("Failed to delete expense.");
    }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      await deleteDoc(doc(db, `${publicDataPath}/payments`, paymentId));
      setError("");
    } catch (err) {
      console.error("Error deleting payment:", err);
      setError("Failed to delete payment.");
    }
  };

  // --- Admin Login Handler ---
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setError("Please enter email and password.");
      return;
    }
    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setShowLogin(false);
      setError("");
    } catch (err) {
      setShowLogin(false);
      setError("Login failed. Check your credentials.");
    }
  };

  // --- Admin Logout Handler ---
  const handleAdminLogout = async () => {
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
    setIsAdmin(false);
    setShowLogin(false);
  };

  // --- Balance Calculation ---
  const balances = useMemo(() => {
    if (users.length === 0) return { balances: [], simplifiedDebts: [] };
    const userBalances = {};
    users.forEach((user) => {
      userBalances[user.id] = 0;
    });

    expenses.forEach((expense) => {
      expense.splits.forEach((split) => {
        if (split.UserID !== expense.PayerID) {
          userBalances[split.UserID] -= split.OwedAmount;
          userBalances[expense.PayerID] += split.OwedAmount;
        }
      });
    });

    payments.forEach((payment) => {
      userBalances[payment.FromUserID] += payment.Amount;
      userBalances[payment.ToUserID] -= payment.Amount;
    });

    const balancesArray = Object.entries(userBalances).map(
      ([userId, balance]) => ({
        userId,
        userName: users.find((u) => u.id === userId)?.UserName || "Unknown",
        balance: parseFloat(balance.toFixed(2)),
      })
    );

    const debtors = balancesArray
      .filter((b) => b.balance < 0)
      .map((b) => ({ ...b, balance: -b.balance }))
      .sort((a, b) => a.balance - b.balance);
    const creditors = balancesArray
      .filter((b) => b.balance > 0)
      .sort((a, b) => a.balance - b.balance);
    const simplifiedDebts = [];

    while (debtors.length > 0 && creditors.length > 0) {
      const debtor = debtors[0];
      const creditor = creditors[0];
      const amount = Math.min(debtor.balance, creditor.balance);

      if (amount > 0.001) {
        simplifiedDebts.push({
          from: debtor.userId,
          fromName: debtor.userName,
          to: creditor.userId,
          toName: creditor.userName,
          amount: parseFloat(amount.toFixed(2)),
        });
      }
      debtor.balance -= amount;
      creditor.balance -= amount;
      if (debtor.balance < 0.001) debtors.shift();
      if (creditor.balance < 0.001) creditors.shift();
    }

    return { balances: balancesArray, simplifiedDebts };
  }, [users, expenses, payments]);

  // --- Render Helper ---
  const renderContent = () => {
    // Modal login form
    const loginModal = showLogin ? (
      <div className="flex items-center justify-center h-screen fixed inset-0 bg-black bg-opacity-60 z-50">
        <form
          onSubmit={handleAdminLogin}
          className="bg-gray-800 border border-gray-700 rounded-lg p-8 w-full max-w-md mx-auto relative"
        >
          <button
            type="button"
            onClick={() => setShowLogin(false)}
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
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              placeholder="admin@sharedexpenses.com"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              placeholder="Password"
            />
          </div>
          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-md w-full transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    ) : null;
    // Main content
    let tabContent;
    switch (activeTab) {
      case "dashboard":
        tabContent = (
          <Dashboard
            users={users}
            expenses={expenses}
            payments={payments}
            balances={balances}
            onDeleteExpense={handleDeleteExpense}
            onDeletePayment={handleDeletePayment}
            onSettleDebt={handleSettleDebt}
            isAdmin={isAdmin}
          />
        );
        break;
      case "addExpense":
        tabContent = isAdmin ? (
          <AddExpenseForm
            db={db}
            users={users}
            setError={setError}
            setActiveTab={setActiveTab}
            appId={appId}
          />
        ) : (
          <div className="text-center text-red-400">Admin access required.</div>
        );
        break;
      case "addPayment":
        tabContent = isAdmin ? (
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
        break;
      case "manageUsers":
        tabContent = isAdmin ? (
          <ManageUsers
            db={db}
            users={users}
            setError={setError}
            onDeleteUser={handleDeleteUser}
            appId={appId}
          />
        ) : (
          <div className="text-center text-red-400">Admin access required.</div>
        );
        break;
      default:
        tabContent = (
          <Dashboard
            users={users}
            expenses={expenses}
            payments={payments}
            balances={balances}
            onDeleteExpense={handleDeleteExpense}
            onDeletePayment={handleDeletePayment}
            onSettleDebt={handleSettleDebt}
            isAdmin={isAdmin}
          />
        );
    }
    return (
      <>
        {loginModal}
        {tabContent}
      </>
    );
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl">Initializing Expense Manager...</div>
      </div>
    );

  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen font-sans">
      <div className="container mx-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-4 md:mb-0">
            Expense Manager
          </h1>
          <div className="text-sm text-gray-400 flex items-center">
            {isAdmin && <span className="ml-4 text-green-400">(Admin)</span>}
            {isAdmin && (
              <button
                onClick={handleAdminLogout}
                className="ml-4 bg-red-700 hover:bg-red-800 text-white px-3 py-1 rounded-md text-xs"
              >
                Logout
              </button>
            )}
            {!isAdmin && (
              <button
                onClick={() => setShowLogin(true)}
                className="ml-4 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1 rounded-md text-xs"
              >
                Login
              </button>
            )}
          </div>
        </header>

        <nav className="flex flex-wrap border-b border-gray-700 mb-8">
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
        </nav>

        <main>
          {error && (
            <div
              className="bg-red-800/50 border border-red-600 text-red-200 p-3 rounded-md mb-6 text-center relative text-sm"
              role="alert"
            >
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 font-bold text-lg leading-none"
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

// --- UI Components ---
const TabButton = ({ name, activeTab, setActiveTab, children }) => (
  <button
    onClick={() => setActiveTab(name)}
    className={`px-4 py-3 text-sm font-medium transition-colors duration-200 focus:outline-none ${
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
    className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded-full hover:bg-red-900/50"
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
  onDeleteExpense,
  onDeletePayment,
  onSettleDebt, // Added prop
  isAdmin, // Added prop
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <Card>
          <CardTitle>
            <DollarSignIcon />
            Balance Summary
          </CardTitle>
          {balances.simplifiedDebts.length > 0 ? (
            <ul className="space-y-3">
              {balances.simplifiedDebts.map((debt, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-700 rounded-md text-sm"
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
                  {/* --- MODIFIED SECTION --- */}
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-lg">
                      ${debt.amount.toFixed(2)}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => onSettleDebt(debt)}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors"
                        title={`Record that ${debt.fromName} paid ${
                          debt.toName
                        } $${debt.amount.toFixed(2)}`}
                      >
                        Paid
                      </button>
                    )}
                  </div>
                  {/* --- END OF MODIFICATION --- */}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">Everyone is settled up!</p>
          )}
        </Card>
      </div>
      <div>
        <Card>
          <CardTitle>
            <UserIcon />
            Group Members
          </CardTitle>
          {users.length > 0 ? (
            <ul className="space-y-2">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex justify-between items-center text-gray-300"
                >
                  <span>{user.UserName}</span>
                  <span
                    className={`font-mono text-sm px-2 py-1 rounded ${
                      (balances.balances.find((b) => b.userId === user.id)
                        ?.balance ?? 0) >= 0
                        ? "text-green-300 bg-green-900/50"
                        : "text-red-300 bg-red-900/50"
                    }`}
                  >
                    $
                    {(
                      balances.balances.find((b) => b.userId === user.id)
                        ?.balance ?? 0
                    ).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">No users added yet.</p>
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
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {[...expenses]
                    .sort(
                      (a, b) =>
                        new Date(b.DateOfExpense) - new Date(a.DateOfExpense)
                    )
                    .slice(0, 5)
                    .map((expense) => (
                      <tr key={expense.id} className="hover:bg-gray-700/50">
                        <td className="p-2">
                          {new Date(expense.DateOfExpense).toLocaleDateString()}
                        </td>
                        <td className="p-2">{expense.Description}</td>
                        <td className="p-2">
                          {
                            users.find((u) => u.id === expense.PayerID)
                              ?.UserName
                          }
                        </td>
                        <td className="p-2 font-mono">
                          ${expense.TotalAmount.toFixed(2)}
                        </td>
                        <td className="p-2 text-xs text-gray-400">
                          {expense.splits
                            .map(
                              (s) =>
                                `${
                                  users.find((u) => u.id === s.UserID)?.UserName
                                }: $${s.OwedAmount.toFixed(2)}`
                            )
                            .join(", ")}
                        </td>
                        <td className="p-2">
                          <DeleteButton
                            onClick={() => onDeleteExpense(expense.id)}
                          />
                        </td>
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
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {[...payments]
                    .sort(
                      (a, b) =>
                        new Date(b.DateOfPayment) - new Date(a.DateOfPayment)
                    )
                    .slice(0, 5)
                    .map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-700/50">
                        <td className="p-2">
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
                        <td className="p-2 font-mono">
                          ${payment.Amount.toFixed(2)}
                        </td>
                        <td className="p-2">
                          <DeleteButton
                            onClick={() => onDeletePayment(payment.id)}
                          />
                        </td>
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

const ManageUsers = ({ db, users, setError, onDeleteUser, appId }) => {
  const [userName, setUserName] = useState("");

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError("User name cannot be empty.");
      return;
    }
    if (
      users.some(
        (u) => u.UserName.toLowerCase() === userName.trim().toLowerCase()
      )
    ) {
      setError("A user with this name already exists.");
      return;
    }
    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      await addDoc(collection(db, `${publicDataPath}/users`), {
        UserName: userName.trim(),
      });
      setUserName("");
      setError("");
    } catch (err) {
      console.error("Error adding user: ", err);
      setError("Failed to add user.");
    }
  };

  return (
    <Card>
      <CardTitle>Manage Users</CardTitle>
      <form
        onSubmit={handleAddUser}
        className="flex flex-col sm:flex-row gap-4 mb-6"
      >
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Enter new user's name"
          className="flex-grow bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
        >
          Add User
        </button>
      </form>
      <div>
        <h3 className="text-lg font-semibold mb-2">Existing Users:</h3>
        {users.length > 0 ? (
          <ul className="space-y-2">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between bg-gray-700 p-3 rounded-md"
              >
                <span>{user.UserName}</span>
                <DeleteButton onClick={() => onDeleteUser(user.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400">
            No users yet. Add one above to get started!
          </p>
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
    if (users.length > 0) {
      setSplitWith(users.map((u) => u.id));
    }
  }, [users]);
  const handleSplitToggle = (userId) => {
    setSplitWith((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(totalAmount);
    if (!description || !amount || !payerId || splitWith.length === 0) {
      setError("Please fill all fields and select users to split with.");
      return;
    }
    if (amount <= 0) {
      setError("Amount must be positive.");
      return;
    }

    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      const expenseDocRef = await addDoc(
        collection(db, `${publicDataPath}/expenses`),
        {
          Description: description,
          TotalAmount: amount,
          DateOfExpense: new Date().toISOString(),
          PayerID: payerId,
        }
      );
      const owedAmount = amount / splitWith.length;
      const splitPromises = splitWith.map((userId) =>
        addDoc(collection(db, `${publicDataPath}/expenseSplits`), {
          ExpenseID: expenseDocRef.id,
          UserID: userId,
          OwedAmount: owedAmount,
        })
      );
      await Promise.all(splitPromises);
      setDescription("");
      setTotalAmount("");
      setPayerId("");
      setActiveTab("dashboard");
      setError("");
    } catch (err) {
      console.error("Error adding expense: ", err);
      setError("Failed to add expense.");
    }
  };

  return (
    <Card>
      <CardTitle>Add a New Expense</CardTitle>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Total Amount ($)
            </label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Paid By
            </label>
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
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
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Split Equally With
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {users.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() => handleSplitToggle(user.id)}
                className={`p-3 rounded-md text-sm text-center transition-colors ${
                  splitWith.includes(user.id)
                    ? "bg-cyan-600 text-white ring-2 ring-cyan-400"
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
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-md transition-colors"
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
    const paymentAmount = parseFloat(amount);
    if (!fromUserId || !toUserId || !paymentAmount) {
      setError("Please fill all fields.");
      return;
    }
    if (fromUserId === toUserId) {
      setError("Cannot make a payment to the same user.");
      return;
    }
    if (paymentAmount <= 0) {
      setError("Amount must be positive.");
      return;
    }

    try {
      const publicDataPath = `artifacts/${appId}/public/data`;
      await addDoc(collection(db, `${publicDataPath}/payments`), {
        FromUserID: fromUserId,
        ToUserID: toUserId,
        Amount: paymentAmount,
        DateOfPayment: new Date().toISOString(),
      });
      setFromUserId("");
      setToUserId("");
      setAmount("");
      setActiveTab("dashboard");
      setError("");
    } catch (err) {
      console.error("Error adding payment: ", err);
      setError("Failed to record payment.");
    }
  };

  return (
    <Card>
      <CardTitle>Record a Payment</CardTitle>
      <p className="text-sm text-gray-400 mb-6">
        Use this to settle debts between users.
      </p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              From (who paid)
            </label>
            <select
              value={fromUserId}
              onChange={(e) => setFromUserId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
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
            <label className="block text-sm font-medium text-gray-300 mb-1">
              To (who received)
            </label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
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
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Amount ($)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.01"
            step="0.01"
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          />
        </div>
        <div className="text-right">
          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-md transition-colors"
          >
            Record Payment
          </button>
        </div>
      </form>
    </Card>
  );
};
