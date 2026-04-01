const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 3000;
const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;
const FATSECRET_SCOPE = process.env.FATSECRET_SCOPE || "basic";
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");
const FATSECRET_API_BASE_URL = "https://platform.fatsecret.com";
const FATSECRET_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";

const tokenCache = {
  accessToken: null,
  expiresAt: 0
};

const PT_BR_ALIASES = [
  { pattern: /\bbatata\s+doce\b/gi, value: "sweet potato" },
  { pattern: /\bfrango\b/gi, value: "chicken breast" },
  { pattern: /\barroz\b/gi, value: "rice" },
  { pattern: /\bovo\b/gi, value: "egg" }
];

app.use(express.static(FRONTEND_DIR));

app.get("/api/nutrition", async (req, res) => {
  const food = `${req.query.food || ""}`.trim();

  if (!food) {
    return res.status(400).json({ error: "Informe um alimento para analisar." });
  }

  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    return res.status(500).json({
      error:
        "Credenciais da FatSecret nao configuradas. Preencha FATSECRET_CLIENT_ID e FATSECRET_CLIENT_SECRET no arquivo .env."
    });
  }

  try {
    const parsedInput = parseFoodInput(food);
    const searchExpression = translateSearchExpression(parsedInput.foodName);
    const searchData = await fatSecretRequest("/rest/foods/search/v1", {
      search_expression: searchExpression,
      max_results: 8,
      format: "json"
    });
    const foods = normalizeToArray(searchData?.foods?.food);

    if (!foods.length) {
      return res.status(404).json({
        error: "Nenhum alimento correspondente foi encontrado na FatSecret."
      });
    }

    const selectedFood = chooseBestFoodMatch(foods, searchExpression);
    const foodData = await fatSecretRequest("/rest/food/v5", {
      food_id: selectedFood.food_id,
      format: "json"
    });
    const selectedServing = chooseServing(foodData?.food?.servings?.serving, parsedInput);

    if (!selectedServing) {
      return res.status(404).json({
        error: "A FatSecret nao retornou porcoes suficientes para calcular esse alimento."
      });
    }

    const factor = calculateScalingFactor(selectedServing, parsedInput);
    const displayLabel = [foodData?.food?.food_name, foodData?.food?.brand_name].filter(Boolean).join(" - ");

    const result = {
      label: displayLabel || selectedFood.food_name || parsedInput.foodName,
      originalQuery: food,
      quantity: formatQuantity(parsedInput, selectedServing),
      calories: roundNumber(Number(selectedServing.calories || 0) * factor),
      protein: roundNumber(Number(selectedServing.protein || 0) * factor),
      carbs: roundNumber(Number(selectedServing.carbohydrate || 0) * factor),
      fat: roundNumber(Number(selectedServing.fat || 0) * factor),
      serving: selectedServing.serving_description || null,
      source: "FatSecret Platform API"
    };

    return res.json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      error: "Erro ao consultar a API de nutricao na FatSecret.",
      details: error.message,
      statusCode
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`MacroTrack rodando em http://localhost:${PORT}`);
});

async function fatSecretRequest(endpoint, params, retry = true) {
  const accessToken = await getFatSecretAccessToken();
  const url = new URL(`${FATSECRET_API_BASE_URL}${endpoint}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json();

  if (response.status === 401 && retry) {
    tokenCache.accessToken = null;
    tokenCache.expiresAt = 0;
    return fatSecretRequest(endpoint, params, false);
  }

  if (!response.ok || data?.error) {
    const details = data?.error?.message || data?.error || data?.message || "Falha na resposta da FatSecret.";
    const error = new Error(details);
    error.statusCode = response.ok ? 502 : response.status;
    throw error;
  }

  return data;
}

async function getFatSecretAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60 * 1000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(FATSECRET_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: FATSECRET_SCOPE
    })
  });

  const data = await response.json();

  if (!response.ok || !data?.access_token) {
    const details = data?.error_description || data?.error || "Nao foi possivel obter o token OAuth da FatSecret.";
    const error = new Error(details);
    error.statusCode = response.ok ? 502 : response.status;
    throw error;
  }

  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt = Date.now() + Number(data.expires_in || 0) * 1000;
  return tokenCache.accessToken;
}

function parseFoodInput(input) {
  const normalizedInput = `${input || ""}`.trim();
  const match = normalizedInput.match(
    /^\s*(?<amount>\d+(?:[.,]\d+)?)?\s*(?<unit>kg|g|grama|gramas|grams?|ml|l|oz|unidade|unidades|unit|units?)?\s*(?<food>.+?)\s*$/i
  );

  const amount = match?.groups?.amount ? Number(match.groups.amount.replace(",", ".")) : 1;
  const unit = normalizeUnit(match?.groups?.unit, match?.groups?.amount);
  const foodName = (match?.groups?.food || normalizedInput).trim();

  if (unit === "g" && match?.groups?.unit?.toLowerCase() === "kg") {
    return { amount: amount * 1000, unit, foodName };
  }

  if (unit === "ml" && match?.groups?.unit?.toLowerCase() === "l") {
    return { amount: amount * 1000, unit, foodName };
  }

  return { amount, unit, foodName };
}

function normalizeUnit(unit, hasAmount) {
  const value = `${unit || ""}`.toLowerCase().trim();

  if (["g", "grama", "gramas", "gram", "grams", "kg"].includes(value)) {
    return "g";
  }

  if (["ml", "l"].includes(value)) {
    return "ml";
  }

  if (["unidade", "unidades", "unit", "units"].includes(value)) {
    return "unit";
  }

  if (hasAmount) {
    return "unit";
  }

  return "serving";
}

function translateSearchExpression(foodName) {
  let translated = `${foodName || ""}`;

  PT_BR_ALIASES.forEach(({ pattern, value }) => {
    translated = translated.replace(pattern, value);
  });

  return translated.trim();
}

function chooseBestFoodMatch(foods, searchExpression) {
  const target = normalizeText(searchExpression);

  return [...foods].sort((left, right) => {
    const leftScore = calculateFoodScore(left, target);
    const rightScore = calculateFoodScore(right, target);
    return rightScore - leftScore;
  })[0];
}

function calculateFoodScore(food, target) {
  const name = normalizeText([food.food_name, food.brand_name].filter(Boolean).join(" "));
  let score = 0;

  if (food.food_type === "Generic") {
    score += 3;
  }

  if (name.includes(target)) {
    score += 5;
  }

  const targetTokens = target.split(" ").filter((token) => token.length > 2);
  targetTokens.forEach((token) => {
    if (name.includes(token)) {
      score += 2;
    }
  });

  return score;
}

function chooseServing(servingsInput, parsedInput) {
  const servings = normalizeToArray(servingsInput).filter(Boolean);
  if (!servings.length) {
    return null;
  }

  const desiredUnit = parsedInput.unit;
  const amount = Number(parsedInput.amount || 1);

  if (desiredUnit === "g" || desiredUnit === "ml") {
    const metricCandidates = servings
      .filter((serving) => normalizeMetricUnit(serving.metric_serving_unit) === desiredUnit)
      .filter((serving) => Number(serving.metric_serving_amount) > 0);

    if (metricCandidates.length) {
      return metricCandidates.sort((left, right) => {
        const leftDelta = Math.abs(Number(left.metric_serving_amount) - amount);
        const rightDelta = Math.abs(Number(right.metric_serving_amount) - amount);
        if (leftDelta === rightDelta) {
          return Math.abs(Number(left.metric_serving_amount) - 100) - Math.abs(Number(right.metric_serving_amount) - 100);
        }
        return leftDelta - rightDelta;
      })[0];
    }
  }

  if (desiredUnit === "unit") {
    const unitCandidates = servings
      .filter((serving) => {
        const measurement = normalizeMeasurement(serving.measurement_description);
        const description = normalizeText(serving.serving_description);
        return !["g", "ml", "oz"].includes(measurement) && !description.startsWith("100 g");
      })
      .filter((serving) => Number(serving.number_of_units || 1) > 0);

    if (unitCandidates.length) {
      return unitCandidates.sort((left, right) => scoreUnitServing(right, amount) - scoreUnitServing(left, amount))[0];
    }
  }

  const defaultServing = servings.find((serving) => Number(serving.is_default || 0) === 1);
  if (defaultServing) {
    return defaultServing;
  }

  const metricHundred = servings.find((serving) => Number(serving.metric_serving_amount || 0) === 100);
  return metricHundred || servings[0];
}

function scoreUnitServing(serving, amount) {
  let score = 0;
  const units = Number(serving.number_of_units || 1);
  const description = normalizeText(serving.serving_description);

  if (description.startsWith("1 ")) {
    score += 4;
  }

  if (description.includes("medium") || description.includes("large") || description.includes("small")) {
    score += 2;
  }

  score -= Math.abs(units - amount);
  return score;
}

function calculateScalingFactor(serving, parsedInput) {
  const amount = Number(parsedInput.amount || 1);

  if (parsedInput.unit === "g" || parsedInput.unit === "ml") {
    const metricAmount = Number(serving.metric_serving_amount || 0);
    return metricAmount > 0 ? amount / metricAmount : 1;
  }

  if (parsedInput.unit === "unit") {
    const numberOfUnits = Number(serving.number_of_units || 1);
    return numberOfUnits > 0 ? amount / numberOfUnits : amount;
  }

  return 1;
}

function formatQuantity(parsedInput, serving) {
  if (parsedInput.unit === "g" || parsedInput.unit === "ml") {
    return `${roundNumber(parsedInput.amount)} ${parsedInput.unit}`;
  }

  if (parsedInput.unit === "unit") {
    const suffix = Number(parsedInput.amount) > 1 ? "unidades" : "unidade";
    return `${roundNumber(parsedInput.amount)} ${suffix}`;
  }

  return serving?.serving_description || "1 porcao";
}

function normalizeToArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeMetricUnit(unit) {
  const normalized = `${unit || ""}`.toLowerCase();
  if (normalized === "g") {
    return "g";
  }
  if (normalized === "ml") {
    return "ml";
  }
  return normalized;
}

function normalizeMeasurement(value) {
  return `${value || ""}`.toLowerCase().trim();
}

function normalizeText(value) {
  return `${value || ""}`
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
