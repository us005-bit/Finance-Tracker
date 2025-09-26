// ======= Global State =======
let transactions = [];
let categories = {};
let settings = {
  balance: 0,
  monthlyLimit: 0,
  startDate: null,
  endDate: null
};
let spendingChart = null;
let editingTransactionId = null;
let authToken = localStorage.getItem('authToken');

// ======= API Configuration =======
const API_BASE = ''; // Empty for same domain / deployed with same origin
const API_HEADERS = {
  'Content-Type': 'application/json'
};

function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  if (token) {
    return {
      ...API_HEADERS,
      'Authorization': `Bearer ${token}`
    };
  }
  return API_HEADERS;
}

// ======= Authentication Functions =======
function showLoginForm() {
  // build modal HTML (same as your original)
  const loginHTML = `
    <div id="loginModal" style="
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.8); z-index: 10000; display: flex; 
      align-items: center; justify-content: center;">
      <div style="
        background: #1f1f1f; padding: 2rem; border-radius: 12px; 
        width: 400px; max-width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
        <h2 style="color: #3b82f6; margin-bottom: 1.5rem; text-align: center;">Finance Tracker</h2>
        
        <div id="authTabs" style="display: flex; margin-bottom: 1rem;">
          <button onclick="showAuthTab('login')" id="loginTab" 
            style="flex: 1; padding: 0.5rem; background: #3b82f6; color: white; border: none; border-radius: 4px 0 0 4px;">
            Login
          </button>
          <button onclick="showAuthTab('register')" id="registerTab"
            style="flex: 1; padding: 0.5rem; background: #2c2c2c; color: white; border: none; border-radius: 0 4px 4px 0;">
            Register
          </button>
        </div>

        <form id="loginForm" onsubmit="handleLogin(event)">
          <input type="text" id="loginUsername" placeholder="Username" required 
            style="width: 100%; padding: 0.6rem; margin: 0.4rem 0; border: 1px solid #2c2c2c; 
            border-radius: 6px; background: #121212; color: #e8eaed;">
          <input type="password" id="loginPassword" placeholder="Password" required
            style="width: 100%; padding: 0.6rem; margin: 0.4rem 0; border: 1px solid #2c2c2c; 
            border-radius: 6px; background: #121212; color: #e8eaed;">
          <button type="submit" style="width: 100%; padding: 0.6rem; margin: 0.8rem 0; 
            background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: 500;">
            Login
          </button>
        </form>

        <form id="registerForm" onsubmit="handleRegister(event)" style="display: none;">
          <input type="text" id="registerUsername" placeholder="Username" required
            style="width: 100%; padding: 0.6rem; margin: 0.4rem 0; border: 1px solid #2c2c2c; 
            border-radius: 6px; background: #121212; color: #e8eaed;">
          <input type="email" id="registerEmail" placeholder="Email" required
            style="width: 100%; padding: 0.6rem; margin: 0.4rem 0; border: 1px solid #2c2c2c; 
            border-radius: 6px; background: #121212; color: #e8eaed;">
          <input type="password" id="registerPassword" placeholder="Password" required
            style="width: 100%; padding: 0.6rem; margin: 0.4rem 0; border: 1px solid #2c2c2c; 
            border-radius: 6px; background: #121212; color: #e8eaed;">
          <button type="submit" style="width: 100%; padding: 0.6rem; margin: 0.8rem 0; 
            background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: 500;">
            Register
          </button>
        </form>

        <div id="authMessage" style="color: #ef4444; text-align: center; margin-top: 1rem;"></div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', loginHTML);
}

function showAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  
  if (tab === 'login') {
    loginTab.style.background = '#3b82f6';
    registerTab.style.background = '#2c2c2c';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    registerTab.style.background = '#3b82f6';
    loginTab.style.background = '#2c2c2c';
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      localStorage.setItem('authToken', data.access_token);
      const modal = document.getElementById('loginModal');
      if (modal) modal.remove();
      await initializeApp();
    } else {
      document.getElementById('authMessage').textContent = data.detail || 'Login failed';
    }
  } catch (error) {
    document.getElementById('authMessage').textContent = 'Connection error';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      localStorage.setItem('authToken', data.access_token);
      const modal = document.getElementById('loginModal');
      if (modal) modal.remove();
      await initializeApp();
    } else {
      document.getElementById('authMessage').textContent = data.detail || 'Registration failed';
    }
  } catch (error) {
    document.getElementById('authMessage').textContent = 'Connection error';
  }
}

function logout() {
  localStorage.removeItem('authToken');
  location.reload();
}

// ======= API Functions =======
async function fetchTransactions() {
  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      transactions = await response.json();
      updateCategoriesFromTransactions();
    } else {
      // if unauthorized or other error, optionally show login
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        showLoginForm();
      }
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

async function fetchSettings() {
  try {
    const response = await fetch(`${API_BASE}/settings`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const settingsData = await response.json();
      settings = {
        balance: settingsData.balance || 0,
        monthlyLimit: settingsData.monthly_limit || settings.monthlyLimit || 0,
        startDate: settingsData.start_date,
        endDate: settingsData.end_date
      };
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
  }
}

async function fetchAnalytics() {
  try {
    const response = await fetch(`${API_BASE}/analytics`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const analytics = await response.json();
      categories = analytics.categories || {};
    }
  } catch (error) {
    console.error('Error fetching analytics:', error);
  }
}

function updateCategoriesFromTransactions() {
  categories = {};
  transactions.forEach(t => {
    if (!categories[t.category]) categories[t.category] = 0;
    categories[t.category] += t.amount;
  });
}

// ======= Initialize on page load =======
document.addEventListener('DOMContentLoaded', function() {
  const token = localStorage.getItem('authToken');
  if (token) {
    initializeApp();
  } else {
    showLoginForm();
  }
});

async function initializeApp() {
  await fetchTransactions();
  await fetchSettings();
  await fetchAnalytics();
  renderTransactions();
  updateDashboard();
  populateSettingsForm();
  showTab('dashboard');
  
  // Add logout button to sidebar
  const sidebar = document.querySelector('.sidebar');
  if (!document.getElementById('logoutBtn')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.textContent = 'Logout';
    logoutBtn.onclick = logout;
    logoutBtn.style.marginTop = 'auto';
    logoutBtn.style.background = '#d93025';
    logoutBtn.style.color = 'white';
    sidebar.appendChild(logoutBtn);
  }
}

// ======= Tab Switching =======
function showTab(tabId) {
  document.querySelectorAll("section").forEach(sec => sec.classList.remove("active"));
  const target = document.getElementById(tabId);
  if (target) target.classList.add("active");

  document.querySelectorAll(".sidebar button").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`.sidebar button[onclick="showTab('${tabId}')"]`);
  if (activeBtn) activeBtn.classList.add("active");

  if (tabId === "dashboard") updateDashboard();
}

// ======= Transactions =======
async function addTransaction(event) {
  event.preventDefault();

  let category = document.getElementById("dashCategory").value.trim();
  const amount = parseFloat(document.getElementById("dashAmount").value);
  const dateInput = document.getElementById("dashDate").value;
  const desc = document.getElementById("dashDesc").value.trim();

  if (!category || isNaN(amount)) {
    alert("Please enter category and amount");
    return;
  }

  const transactionDate = dateInput || new Date().toISOString().split('T')[0];

  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        category: category,
        amount: amount,
        description: desc || "",
        date: transactionDate
      })
    });

    if (response.ok) {
      await fetchTransactions();
      await fetchAnalytics();
      renderTransactions();
      updateDashboard();
      document.getElementById("dashboardTransactionForm").reset();
      showTemporaryMessage("Transaction added", "success");
    } else {
      const error = await response.json();
      showTemporaryMessage(error.detail || "Failed to add transaction", "error");
    }
  } catch (error) {
    showTemporaryMessage("Connection error", "error");
  }
}

function renderTransactions() {
  const list = document.getElementById("transactionsList");
  list.innerHTML = "";

  if (transactions.length === 0) {
    list.innerHTML = "<p>No transactions yet.</p>";
    return;
  }

  // Sort by date (most recent first)
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  sortedTransactions.forEach(t => {
    const card = document.createElement("div");
    card.className = "card";
    const formattedDate = t.date ? new Date(t.date).toLocaleDateString('en-IN') : '';
    const descriptionHTML = t.description ? `<small>${t.description}</small> <br>` : '';
    
    card.innerHTML = `
      <strong>${t.category}</strong> - ₹${parseFloat(t.amount).toFixed(2)} <br>
      ${descriptionHTML}
      <small>${formattedDate}</small><br>
      <button class="edit" onclick="openEditModal(${t.id})">Edit</button>
      <button class="delete" onclick="deleteTransaction(${t.id})">Delete</button>
    `;
    list.appendChild(card);
  });
}

async function deleteTransaction(id) {
  try {
    const response = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (response.ok) {
      await fetchTransactions();
      await fetchAnalytics();
      renderTransactions();
      updateDashboard();
      showTemporaryMessage("Transaction deleted", "success");
    } else {
      const error = await response.json();
      showTemporaryMessage(error.detail || "Failed to delete transaction", "error");
    }
  } catch (error) {
    showTemporaryMessage("Connection error", "error");
  }
}

// ======= Edit Transaction Functions =======
function openEditModal(id) {
  const transaction = transactions.find(t => t.id === id);
  if (!transaction) return;

  editingTransactionId = id;
  
  document.getElementById("editId").value = id;
  document.getElementById("editCategory").value = transaction.category;
  document.getElementById("editAmount").value = transaction.amount;
  document.getElementById("editDate").value = transaction.date;
  document.getElementById("editDesc").value = transaction.description;
  
  document.getElementById("editModal").style.display = "block";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  editingTransactionId = null;
}

async function updateTransaction(event) {
  event.preventDefault();
  
  const id = parseInt(document.getElementById("editId").value);
  const category = document.getElementById("editCategory").value.trim();
  const amount = parseFloat(document.getElementById("editAmount").value);
  const date = document.getElementById("editDate").value;
  const description = document.getElementById("editDesc").value.trim();
  
  if (!category || isNaN(amount)) {
    alert("Please enter category and amount");
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        category: category,
        amount: amount,
        description: description,
        date: date
      })
    });

    if (response.ok) {
      await fetchTransactions();
      await fetchAnalytics();
      renderTransactions();
      updateDashboard();
      closeEditModal();
      showTemporaryMessage("Transaction updated", "success");
    } else {
      const error = await response.json();
      showTemporaryMessage(error.detail || "Failed to update transaction", "error");
    }
  } catch (error) {
    showTemporaryMessage("Connection error", "error");
  }
}

// ======= Dashboard =======
function updateDashboard() {
  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const remaining = settings.monthlyLimit - totalSpent;
  const today = new Date();

  let daysLeft = 0;
  if (settings.endDate) {
    const end = new Date(settings.endDate);
    daysLeft = Math.max(0, Math.ceil((end - today) / (1000 * 60 * 60 * 24)));
  }
  const dailyBudget = daysLeft > 0 ? remaining / daysLeft : 0;

  const elements = {
    statBalance: settings.balance,
    statLimit: settings.monthlyLimit,
    statSpent: totalSpent.toFixed(2),
    statRemaining: remaining.toFixed(2),
    statDays: daysLeft,
    statDaily: dailyBudget.toFixed(2)
  };

  Object.entries(elements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });

  updateSpendingChart();
}

function updateSpendingChart() {
  const canvas = document.getElementById("spendingChart");
  if (!canvas) return;

  const labels = Object.keys(categories || {});
  const data = labels.map(l => categories[l]);

  // destroy previous chart if present
  if (spendingChart && spendingChart.destroy) {
    try { spendingChart.destroy(); } catch (e) { /* ignore */ }
    spendingChart = null;
  }

  // If no data, show empty state
  if (labels.length === 0) {
    if (spendingChart && spendingChart.clear) spendingChart.clear();
    // optionally clear canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  spendingChart = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
        },
      },
    }
  });
}

// ======= Settings =======
function populateSettingsForm() {
  document.getElementById('setBalance').value = settings.balance ?? 0;
  document.getElementById('setLimit').value = settings.monthlyLimit ?? 0;
  if (settings.startDate) document.getElementById('setStartDate').value = settings.startDate;
  if (settings.endDate) document.getElementById('setEndDate').value = settings.endDate;
}

async function updateSettings(event) {
  event.preventDefault();

  const newSettings = {
    balance: parseFloat(document.getElementById('setBalance').value) || 0,
    monthly_limit: parseFloat(document.getElementById('setLimit').value) || 0,
    start_date: document.getElementById('setStartDate').value || null,
    end_date: document.getElementById('setEndDate').value || null
  };

  try {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        balance: newSettings.balance,
        monthly_limit: newSettings.monthly_limit,
        start_date: newSettings.start_date,
        end_date: newSettings.end_date
      })
    });

    if (response.ok) {
      const data = await response.json();
      settings.balance = data.balance ?? newSettings.balance;
      settings.monthlyLimit = data.monthly_limit ?? newSettings.monthly_limit;
      settings.startDate = data.start_date ?? newSettings.start_date;
      settings.endDate = data.end_date ?? newSettings.end_date;

      populateSettingsForm();
      updateDashboard();
      showTemporaryMessage("Settings saved", "success");
    } else {
      const err = await response.json();
      showTemporaryMessage(err.detail || "Failed to save settings", "error");
    }
  } catch (err) {
    console.error(err);
    showTemporaryMessage("Connection error", "error");
  }
}

function showTemporaryMessage(text, type = "success") {
  // Reuse settingsMessage element if available; otherwise fallback to alert
  const el = document.getElementById('settingsMessage');
  if (el) {
    el.style.color = (type === 'success') ? '#34a853' : '#ef4444';
    el.textContent = text;
    setTimeout(() => { el.textContent = ''; }, 3000);
  } else {
    console[type === 'success' ? 'log' : 'warn'](text);
  }
}
