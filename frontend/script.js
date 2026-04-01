const STORAGE_KEY = "macrotrack.entries";
const GOAL_KEY = "macrotrack.goal";
const PROTEIN_GOAL_KEY = "macrotrack.proteinGoal";
const LOCAL_FOOD_CATALOG = Array.isArray(window.LOCAL_FOOD_CATALOG) ? window.LOCAL_FOOD_CATALOG : [];

const state = {
  selectedDate: getToday(),
  dailyGoal: 2200,
  proteinGoal: 160,
  entriesByDate: {},
  chart: null,
  entryMode: "api",
  catalogSearch: "",
  catalogCategory: "all",
  selectedCatalogFood: null,
  selectedCatalogQuantityMeta: null
};

const elements = {
  foodForm: document.getElementById("foodForm"),
  foodInput: document.getElementById("foodInput"),
  entryModeInputs: document.querySelectorAll('input[name="entryMode"]'),
  manualFields: document.getElementById("manualFields"),
  manualQuantity: document.getElementById("manualQuantity"),
  manualMultiplier: document.getElementById("manualMultiplier"),
  manualDecrease: document.getElementById("manualDecrease"),
  manualIncrease: document.getElementById("manualIncrease"),
  manualWeight: document.getElementById("manualWeight"),
  manualCalories: document.getElementById("manualCalories"),
  manualProtein: document.getElementById("manualProtein"),
  manualCarbs: document.getElementById("manualCarbs"),
  manualFat: document.getElementById("manualFat"),
  catalogSearch: document.getElementById("catalogSearch"),
  catalogCategory: document.getElementById("catalogCategory"),
  catalogResults: document.getElementById("catalogResults"),
  submitButton: document.getElementById("submitButton"),
  statusMessage: document.getElementById("statusMessage"),
  selectedDate: document.getElementById("selectedDate"),
  foodList: document.getElementById("foodList"),
  historyList: document.getElementById("historyList"),
  goalInput: document.getElementById("goalInput"),
  proteinGoalInput: document.getElementById("proteinGoalInput"),
  totalCalories: document.getElementById("totalCalories"),
  totalProtein: document.getElementById("totalProtein"),
  totalCarbs: document.getElementById("totalCarbs"),
  totalFat: document.getElementById("totalFat"),
  goalProgressText: document.getElementById("goalProgressText"),
  goalProgressBar: document.getElementById("goalProgressBar"),
  proteinGoalProgressText: document.getElementById("proteinGoalProgressText"),
  proteinGoalProgressBar: document.getElementById("proteinGoalProgressBar"),
  heroGoal: document.getElementById("heroGoal"),
  heroConsumed: document.getElementById("heroConsumed"),
  heroRemaining: document.getElementById("heroRemaining"),
  heroProteinGoal: document.getElementById("heroProteinGoal")
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
  elements.proteinGoalInput.value = state.proteinGoal;

  elements.foodForm.addEventListener("submit", handleFoodSubmit);
  elements.entryModeInputs.forEach((input) => {
    input.addEventListener("change", () => setEntryMode(input.value));
  });
  elements.catalogSearch.addEventListener("input", (event) => {
    state.catalogSearch = event.target.value.trim();
    renderCatalogResults();
  });
  elements.catalogCategory.addEventListener("change", (event) => {
    state.catalogCategory = event.target.value || "all";
    renderCatalogResults();
  });
  elements.manualIncrease.addEventListener("click", () => {
    updateManualMultiplier(Number(elements.manualMultiplier.value || 1) + 1);
  });
  elements.manualDecrease.addEventListener("click", () => {
    updateManualMultiplier(Number(elements.manualMultiplier.value || 1) - 1);
  });
  elements.manualMultiplier.addEventListener("input", (event) => {
    updateManualMultiplier(Number(event.target.value || 1));
  });
  elements.manualWeight.addEventListener("input", (event) => {
    updateManualWeight(Number(event.target.value || 0));
  });
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
  elements.proteinGoalInput.addEventListener("change", (event) => {
    const goal = Number(event.target.value);
    state.proteinGoal = goal > 0 ? goal : 160;
    localStorage.setItem(PROTEIN_GOAL_KEY, String(state.proteinGoal));
    renderSummary();
  });

  setEntryMode(state.entryMode);
  renderCatalogCategoryOptions();
  syncManualAdjustmentControls();
}

async function handleFoodSubmit(event) {
  event.preventDefault();

  const food = elements.foodInput.value.trim();
  if (!food) {
    setStatus("Digite um alimento antes de adicionar.", "error");
    return;
  }

  if (state.entryMode === "manual") {
    handleManualSubmit(food);
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

    const entry = createEntry({
      label: payload.label,
      quantity: payload.quantity,
      originalQuery: payload.originalQuery,
      calories: payload.calories,
      protein: payload.protein,
      carbs: payload.carbs,
      fat: payload.fat
    });

    addEntry(entry);
    elements.foodForm.reset();
    setEntryMode(state.entryMode);
    setStatus(`${entry.label} adicionado com sucesso.`, "success");
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function handleManualSubmit(food) {
  const calories = Number(elements.manualCalories.value);
  const protein = Number(elements.manualProtein.value);
  const carbs = Number(elements.manualCarbs.value);
  const fat = Number(elements.manualFat.value);
  const quantity = elements.manualQuantity.value.trim() || "Porcao manual";

  if ([calories, protein, carbs, fat].some((value) => Number.isNaN(value) || value < 0)) {
    setStatus("Preencha calorias, proteinas, carboidratos e gorduras com numeros validos.", "error");
    return;
  }

  const entry = createEntry({
    label: food,
    quantity,
    originalQuery: food,
    calories,
    protein,
    carbs,
    fat
  });

  addEntry(entry);
  elements.foodForm.reset();
  resetManualFormState();
  setEntryMode("manual");
  setStatus(`${entry.label} adicionado manualmente.`, "success");
  render();
}

function loadState() {
  const savedEntries = safeParse(localStorage.getItem(STORAGE_KEY), {});
  const savedGoal = Number(localStorage.getItem(GOAL_KEY));
  const savedProteinGoal = Number(localStorage.getItem(PROTEIN_GOAL_KEY));

  state.entriesByDate = savedEntries && typeof savedEntries === "object" ? savedEntries : {};
  state.dailyGoal = savedGoal > 0 ? savedGoal : 2200;
  state.proteinGoal = savedProteinGoal > 0 ? savedProteinGoal : 160;
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entriesByDate));
}

function addEntry(entry) {
  const entries = getEntriesForSelectedDate();
  state.entriesByDate[state.selectedDate] = [entry, ...entries];
  persistEntries();
}

function createEntry(entry) {
  return {
    id: crypto.randomUUID(),
    label: entry.label,
    quantity: entry.quantity,
    originalQuery: entry.originalQuery,
    calories: roundValue(entry.calories),
    protein: roundValue(entry.protein),
    carbs: roundValue(entry.carbs),
    fat: roundValue(entry.fat),
    createdAt: new Date().toISOString()
  };
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
  elements.proteinGoalInput.value = state.proteinGoal;
  renderFoodList();
  renderHistory();
  renderSummary();
  renderCatalogResults();
}

function renderFoodList() {
  const entries = getEntriesForSelectedDate();

  if (!entries.length) {
    elements.foodList.innerHTML = `
      <div class="empty-state">
        Nenhum alimento registrado nesta data. Use a API ou cadastre manualmente alimentos brasileiros.
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
  const calorieGoal = state.dailyGoal;
  const proteinGoal = state.proteinGoal;
  const calorieProgress = calorieGoal > 0 ? Math.min((totals.calories / calorieGoal) * 100, 100) : 0;
  const proteinProgress = proteinGoal > 0 ? Math.min((totals.protein / proteinGoal) * 100, 100) : 0;
  const remaining = Math.max(calorieGoal - totals.calories, 0);

  elements.totalCalories.textContent = `${formatNumber(totals.calories)} kcal`;
  elements.totalProtein.textContent = `${formatNumber(totals.protein)} g`;
  elements.totalCarbs.textContent = `${formatNumber(totals.carbs)} g`;
  elements.totalFat.textContent = `${formatNumber(totals.fat)} g`;
  elements.goalProgressText.textContent = `${formatNumber(calorieProgress)}%`;
  elements.goalProgressBar.style.width = `${calorieProgress}%`;
  elements.proteinGoalProgressText.textContent = `${formatNumber(proteinProgress)}%`;
  elements.proteinGoalProgressBar.style.width = `${proteinProgress}%`;
  elements.heroGoal.textContent = `${formatNumber(calorieGoal)} kcal`;
  elements.heroConsumed.textContent = `${formatNumber(totals.calories)} kcal`;
  elements.heroRemaining.textContent = `${formatNumber(remaining)} kcal`;
  elements.heroProteinGoal.textContent = `${formatNumber(proteinGoal)} g`;

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

function setEntryMode(mode) {
  state.entryMode = mode === "manual" ? "manual" : "api";
  const isManual = state.entryMode === "manual";

  elements.entryModeInputs.forEach((input) => {
    input.checked = input.value === state.entryMode;
  });

  elements.manualFields.classList.toggle("is-hidden", !isManual);
  elements.foodInput.placeholder = isManual
    ? "Ex: Feijao tropeiro, cuscuz, pao de queijo"
    : "Ex: 200g arroz, 150g frango, 1 banana";

  if (isManual && !elements.manualMultiplier.value) {
    elements.manualMultiplier.value = "1";
  }

  renderCatalogResults();
}

function renderCatalogResults() {
  if (!elements.catalogResults) {
    return;
  }

  const isManual = state.entryMode === "manual";
  const foods = getFilteredCatalog();

  if (!isManual) {
    elements.catalogResults.innerHTML = "";
    return;
  }

  if (!foods.length) {
    elements.catalogResults.innerHTML = `
      <div class="empty-state">
        Nenhum item encontrado. Voce ainda pode preencher os macros manualmente.
      </div>
    `;
    return;
  }

  elements.catalogResults.innerHTML = foods
    .map(
      (food, index) => `
        <button class="catalog-card" type="button" data-catalog-index="${index}">
          <div class="catalog-card__title">
            <strong>${escapeHtml(food.name)}</strong>
            <span>${escapeHtml(food.quantity)}</span>
          </div>
          <div class="catalog-card__category">${escapeHtml(inferCategory(food))}</div>
          <div class="catalog-card__stats">
            <span>${formatNumber(food.calories)} kcal</span>
            <span>${formatNumber(food.protein)}g prot</span>
            <span>${formatNumber(food.carbs)}g carb</span>
            <span>${formatNumber(food.fat)}g gord</span>
          </div>
        </button>
      `
    )
    .join("");

  elements.catalogResults.querySelectorAll("[data-catalog-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const food = foods[Number(button.dataset.catalogIndex)];
      applyCatalogFood(food);
    });
  });
}

function getFilteredCatalog() {
  const query = normalizeSearch(state.catalogSearch);
  const catalog = [...LOCAL_FOOD_CATALOG].filter((food) => {
    if (state.catalogCategory === "all") {
      return true;
    }

    return inferCategory(food) === state.catalogCategory;
  });

  if (!query) {
    return catalog.slice(0, 8);
  }

  return catalog
    .map((food) => ({
      food,
      score: getCatalogScore(food, query)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((item) => item.food);
}

function renderCatalogCategoryOptions() {
  if (!elements.catalogCategory) {
    return;
  }

  const categories = ["all", ...new Set(LOCAL_FOOD_CATALOG.map(inferCategory))];
  elements.catalogCategory.innerHTML = categories
    .map((category) => {
      const label = category === "all" ? "Todas" : category;
      const selected = state.catalogCategory === category ? "selected" : "";
      return `<option value="${escapeHtml(category)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function inferCategory(food) {
  const haystack = normalizeSearch([food.name, ...(food.tags || [])].join(" "));

  if (matchesAny(haystack, ["whey", "protein", "suplemento", "barra"])) {
    return "Suplementos";
  }

  if (matchesAny(haystack, ["refrigerante", "guarana", "suco", "cafe", "agua", "leite", "iogurte"])) {
    return "Bebidas";
  }

  if (matchesAny(haystack, ["banana", "maca", "pera", "mamao", "manga", "melancia", "melao", "abacaxi", "abacate", "fruta", "acai"])) {
    return "Frutas";
  }

  if (matchesAny(haystack, ["brigadeiro", "beijinho", "pudim", "mousse", "bolo", "doce", "acucar"])) {
    return "Doces";
  }

  if (matchesAny(haystack, ["big mac", "whopper", "mcdonalds", "burger king", "x-burger", "x-salada", "x-bacon", "x-tudo", "hamburguer", "pizza"])) {
    return "Fast food";
  }

  if (matchesAny(haystack, ["pastel", "coxinha", "esfiha", "empada", "hot dog", "croissant", "pao de queijo", "pao na chapa", "salgado"])) {
    return "Lanches";
  }

  if (matchesAny(haystack, ["pao", "aveia", "granola", "omelete", "ovo", "queijo", "requeijao", "cream cheese", "manteiga"])) {
    return "Cafe da manha";
  }

  return "Almoco e jantar";
}

function matchesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(normalizeSearch(needle)));
}

function getCatalogScore(food, query) {
  const name = normalizeSearch(food.name);
  const tags = (food.tags || []).map(normalizeSearch);
  let score = 0;

  if (name.includes(query)) {
    score += 10;
  }

  query.split(" ").filter(Boolean).forEach((token) => {
    if (name.includes(token)) {
      score += 4;
    }

    if (tags.some((tag) => tag.includes(token))) {
      score += 3;
    }
  });

  return score;
}

function applyCatalogFood(food) {
  if (!food) {
    return;
  }

  state.selectedCatalogFood = food;
  state.selectedCatalogQuantityMeta = parseCatalogQuantity(food.quantity);
  elements.foodInput.value = food.name;
  elements.manualMultiplier.value = "1";
  fillManualFieldsFromCatalog(food);
  syncManualAdjustmentControls();
  setStatus(`${food.name} preenchido automaticamente pela biblioteca local.`, "success");
}

function updateManualMultiplier(nextValue) {
  const multiplier = Math.max(1, Math.round(Number(nextValue) || 1));
  elements.manualMultiplier.value = String(multiplier);

  if (!state.selectedCatalogFood) {
    return;
  }

  if (state.selectedCatalogQuantityMeta?.isMetric) {
    return;
  }

  fillManualFieldsFromCatalog(state.selectedCatalogFood);
}

function updateManualWeight(nextValue) {
  if (!state.selectedCatalogFood || !state.selectedCatalogQuantityMeta?.isMetric) {
    return;
  }

  const weight = Math.max(1, Math.round(Number(nextValue) || state.selectedCatalogQuantityMeta.amount));
  elements.manualWeight.value = String(weight);
  fillManualFieldsFromCatalog(state.selectedCatalogFood);
}

function fillManualFieldsFromCatalog(food) {
  const meta = state.selectedCatalogQuantityMeta;
  let factor = 1;
  let quantity = food.quantity;

  if (meta?.isMetric) {
    const weight = Math.max(1, Number(elements.manualWeight.value || meta.amount));
    factor = weight / meta.amount;
    quantity = `${formatNumber(weight)} ${meta.unit}`;
  } else {
    const multiplier = Math.max(1, Number(elements.manualMultiplier.value || 1));
    factor = multiplier;
    quantity = scaleQuantityLabel(food.quantity, multiplier);
  }

  elements.manualQuantity.value = quantity;
  elements.manualCalories.value = roundValue(food.calories * factor);
  elements.manualProtein.value = roundValue(food.protein * factor);
  elements.manualCarbs.value = roundValue(food.carbs * factor);
  elements.manualFat.value = roundValue(food.fat * factor);
}

function resetManualFormState() {
  state.selectedCatalogFood = null;
  state.selectedCatalogQuantityMeta = null;
  elements.manualMultiplier.value = "1";
  elements.manualWeight.value = "";
  syncManualAdjustmentControls();
}

function scaleQuantityLabel(quantity, multiplier) {
  const value = String(quantity || "").trim();
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/i);

  if (!match) {
    return multiplier > 1 ? `${multiplier} x ${value}` : value;
  }

  const baseAmount = Number(match[1].replace(",", "."));
  const unit = match[2].trim();
  const scaledAmount = roundValue(baseAmount * multiplier);

  if (unit.startsWith("unidade")) {
    return `${scaledAmount} ${scaledAmount === 1 ? "unidade" : "unidades"}`;
  }

  return `${formatNumber(scaledAmount)}${unit ? ` ${unit}` : ""}`;
}

function parseCatalogQuantity(quantity) {
  const value = String(quantity || "").trim();
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/i);

  if (!match) {
    return { amount: 1, unit: "", isMetric: false };
  }

  const amount = Number(match[1].replace(",", "."));
  const unit = match[2].trim().toLowerCase();
  return {
    amount: amount > 0 ? amount : 1,
    unit,
    isMetric: unit === "g" || unit === "ml"
  };
}

function syncManualAdjustmentControls() {
  const isMetric = Boolean(state.selectedCatalogQuantityMeta?.isMetric);

  elements.manualWeight.disabled = !isMetric;
  elements.manualMultiplier.disabled = isMetric;
  elements.manualIncrease.disabled = isMetric;
  elements.manualDecrease.disabled = isMetric;

  if (isMetric) {
    elements.manualWeight.value = String(state.selectedCatalogQuantityMeta.amount);
  }
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
