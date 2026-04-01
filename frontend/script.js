const STORAGE_KEY = "macrotrack.entries";
const GOAL_KEY = "macrotrack.goal";

const state = {
  selectedDate: getToday(),
  dailyGoal: 2200,
  entriesByDate: {},
  chart: null
};

const elements = {
  foodForm: document.getElementById("foodForm"),
  foodInput: document.getElementById("foodInput"),
  submitButton: document.getElementById("submitButton"),
  statusMessage: document.getElementById("statusMessage"),
  selectedDate: document.getElementById("selectedDate"),
  foodList: document.getElementById("foodList"),
  historyList: document.getElementById("historyList"),
  goalInput: document.getElementById("goalInput"),
  totalCalories: document.getElementById("totalCalories"),
  totalProtein: document.getElementById("totalProtein"),
  totalCarbs: document.getElementById("totalCarbs"),
  totalFat: document.getElementById("totalFat"),
  goalProgressText: document.getElementById("goalProgressText"),
  goalProgressBar: document.getElementById("goalProgressBar"),
  heroGoal: document.getElementById("heroGoal"),
  heroConsumed: document.getElementById("heroConsumed"),
  heroRemaining: document.getElementById("heroRemaining")
};

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  bindEvents();
  initializeChart();
  render();
});

function bindEvents() {
  elements.selectedDate.value = state.selectedDate;
  elements.goalInput.value = state.dailyGoal;

  elements.foodForm.addEventListener("submit", handleFoodSubmit);
  elements.selectedDate.addEventListener("change", (event) => {
    state.selectedDate = event.target.value || getToday();
    render();
  });

  elements.goalInput.addEventListener("change", (event) => {
    const goal = Number(event.target.value);
    state.dailyGoal = goal > 0 ? goal : 2200;
    localStorage.setItem(GOAL_KEY, String(state.dailyGoal));
    renderSummary();
  });
}

async function handleFoodSubmit(event) {
  event.preventDefault();

  const food = elements.foodInput.value.trim();
  if (!food) {
    setStatus("Digite um alimento antes de adicionar.", "error");
    return;
  }

  setLoading(true);
  setStatus("Consultando dados nutricionais...", "");

  try {
    const response = await fetch(`/api/nutrition?food=${encodeURIComponent(food)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.details || payload.error || "Nao foi possivel analisar o alimento.");
    }

    const entry = {
      id: crypto.randomUUID(),
      label: payload.label,
      quantity: payload.quantity,
      originalQuery: payload.originalQuery,
      calories: roundValue(payload.calories),
      protein: roundValue(payload.protein),
      carbs: roundValue(payload.carbs),
      fat: roundValue(payload.fat),
      createdAt: new Date().toISOString()
    };

    const entries = getEntriesForSelectedDate();
    state.entriesByDate[state.selectedDate] = [entry, ...entries];
    persistEntries();

    elements.foodForm.reset();
    setStatus(`${entry.label} adicionado com sucesso.`, "success");
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function loadState() {
  const savedEntries = safeParse(localStorage.getItem(STORAGE_KEY), {});
  const savedGoal = Number(localStorage.getItem(GOAL_KEY));

  state.entriesByDate = savedEntries && typeof savedEntries === "object" ? savedEntries : {};
  state.dailyGoal = savedGoal > 0 ? savedGoal : 2200;
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entriesByDate));
}

function getEntriesForSelectedDate() {
  return Array.isArray(state.entriesByDate[state.selectedDate])
    ? state.entriesByDate[state.selectedDate]
    : [];
}

function getTotals(entries = getEntriesForSelectedDate()) {
  return entries.reduce(
    (accumulator, entry) => {
      accumulator.calories += Number(entry.calories || 0);
      accumulator.protein += Number(entry.protein || 0);
      accumulator.carbs += Number(entry.carbs || 0);
      accumulator.fat += Number(entry.fat || 0);
      return accumulator;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function render() {
  elements.selectedDate.value = state.selectedDate;
  elements.goalInput.value = state.dailyGoal;
  renderFoodList();
  renderHistory();
  renderSummary();
}

function renderFoodList() {
  const entries = getEntriesForSelectedDate();

  if (!entries.length) {
    elements.foodList.innerHTML = `
      <div class="empty-state">
        Nenhum alimento registrado nesta data. Experimente adicionar "100g frango" ou "1 ovo".
      </div>
    `;
    return;
  }

  elements.foodList.innerHTML = entries
    .map(
      (entry) => `
        <article class="food-item">
          <div>
            <div class="food-item__title">
              <h3>${escapeHtml(entry.label)}</h3>
              <span class="food-item__badge">${escapeHtml(entry.quantity)}</span>
            </div>
            <span class="food-item__meta">Consulta: ${escapeHtml(entry.originalQuery)}</span>
            <div class="food-item__stats">
              <span><strong>${formatNumber(entry.calories)}</strong> kcal</span>
              <span><strong>${formatNumber(entry.protein)}</strong> g prot</span>
              <span><strong>${formatNumber(entry.carbs)}</strong> g carb</span>
              <span><strong>${formatNumber(entry.fat)}</strong> g gord</span>
            </div>
          </div>
          <button class="food-item__remove" data-entry-id="${entry.id}" type="button">Remover</button>
        </article>
      `
    )
    .join("");

  elements.foodList.querySelectorAll("[data-entry-id]").forEach((button) => {
    button.addEventListener("click", () => removeEntry(button.dataset.entryId));
  });
}

function renderHistory() {
  const dates = Object.keys(state.entriesByDate).sort((a, b) => b.localeCompare(a));

  if (!dates.length) {
    elements.historyList.innerHTML = `
      <div class="empty-state">Seu historico vai aparecer aqui conforme voce registrar as refeicoes.</div>
    `;
    return;
  }

  elements.historyList.innerHTML = dates
    .map((date) => {
      const totals = getTotals(state.entriesByDate[date]);
      const activeClass = date === state.selectedDate ? "is-active" : "";

      return `
        <button class="history-item ${activeClass}" type="button" data-date="${date}">
          <span>${formatDate(date)}</span>
          <strong>${formatNumber(totals.calories)} kcal</strong>
          <span>${formatNumber(totals.protein)}g prot | ${formatNumber(totals.carbs)}g carb | ${formatNumber(totals.fat)}g gord</span>
        </button>
      `;
    })
    .join("");

  elements.historyList.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      render();
    });
  });
}

function renderSummary() {
  const totals = getTotals();
  const goal = state.dailyGoal;
  const progress = goal > 0 ? Math.min((totals.calories / goal) * 100, 100) : 0;
  const remaining = Math.max(goal - totals.calories, 0);

  elements.totalCalories.textContent = `${formatNumber(totals.calories)} kcal`;
  elements.totalProtein.textContent = `${formatNumber(totals.protein)} g`;
  elements.totalCarbs.textContent = `${formatNumber(totals.carbs)} g`;
  elements.totalFat.textContent = `${formatNumber(totals.fat)} g`;
  elements.goalProgressText.textContent = `${formatNumber(progress)}%`;
  elements.goalProgressBar.style.width = `${progress}%`;
  elements.heroGoal.textContent = `${formatNumber(goal)} kcal`;
  elements.heroConsumed.textContent = `${formatNumber(totals.calories)} kcal`;
  elements.heroRemaining.textContent = `${formatNumber(remaining)} kcal`;

  updateChart(totals);
}

function removeEntry(entryId) {
  const nextEntries = getEntriesForSelectedDate().filter((entry) => entry.id !== entryId);

  if (nextEntries.length) {
    state.entriesByDate[state.selectedDate] = nextEntries;
  } else {
    delete state.entriesByDate[state.selectedDate];
  }

  persistEntries();
  setStatus("Item removido do dia selecionado.", "success");
  render();
}

function initializeChart() {
  const context = document.getElementById("macrosChart");
  state.chart = new Chart(context, {
    type: "pie",
    data: {
      labels: ["Proteinas", "Carboidratos", "Gorduras"],
      datasets: [
        {
          data: [0, 0, 0],
          backgroundColor: ["#22c55e", "#0f172a", "#94a3b8"],
          borderColor: "#ffffff",
          borderWidth: 4,
          hoverOffset: 10
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 18,
            color: "#1f2a24",
            font: {
              family: "Outfit",
              size: 13,
              weight: "600"
            }
          }
        }
      }
    }
  });
}

function updateChart(totals) {
  if (!state.chart) {
    return;
  }

  state.chart.data.datasets[0].data = [
    roundValue(totals.protein),
    roundValue(totals.carbs),
    roundValue(totals.fat)
  ];
  state.chart.update();
}

function setStatus(message, type) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = "status-message";

  if (type === "error") {
    elements.statusMessage.classList.add("is-error");
  }

  if (type === "success") {
    elements.statusMessage.classList.add("is-success");
  }
}

function setLoading(isLoading) {
  elements.submitButton.disabled = isLoading;
  elements.submitButton.textContent = isLoading ? "Adicionando..." : "Adicionar";
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function getToday() {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localDate = new Date(today.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

function roundValue(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
