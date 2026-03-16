const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

async function handleResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function withAuthHeaders(authToken, headers = {}) {
  if (!authToken) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${authToken}`
  };
}

export async function fetchStations(query = "", options = {}) {
  const params = new URLSearchParams();

  if (query) {
    params.set("query", query);
  }

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  const queryString = params.toString();
  const url = `${API_BASE}/stations${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, { cache: "no-store" });
  return handleResponse(response);
}

export async function calculateFare(payload) {
  const response = await fetch(`${API_BASE}/fare/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function fetchRuleInfo() {
  const response = await fetch(`${API_BASE}/fare/rules`, { cache: "no-store" });
  return handleResponse(response);
}

export async function loginAdmin(payload) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function fetchAdminMe(authToken) {
  const response = await fetch(`${API_BASE}/auth/me`, {
    cache: "no-store",
    headers: withAuthHeaders(authToken)
  });

  return handleResponse(response);
}

export async function uploadChart(formData, authToken) {
  const response = await fetch(`${API_BASE}/admin/chart`, {
    method: "POST",
    headers: withAuthHeaders(authToken),
    body: formData
  });

  return handleResponse(response);
}

export async function activateChart(chartId, authToken, options = {}) {
  const params = new URLSearchParams();
  if (options.force) {
    params.set("force", "true");
  }

  const response = await fetch(
    `${API_BASE}/admin/charts/${encodeURIComponent(chartId)}/activate${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "PUT",
      headers: withAuthHeaders(authToken)
    }
  );

  return handleResponse(response);
}

export async function updateChartAndActivate(chartId, payload, authToken) {
  const response = await fetch(`${API_BASE}/admin/charts/${encodeURIComponent(chartId)}/update-and-activate`, {
    method: "PUT",
    headers: withAuthHeaders(authToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function fetchCharts(authToken) {
  const response = await fetch(`${API_BASE}/admin/charts`, {
    cache: "no-store",
    headers: withAuthHeaders(authToken)
  });

  return handleResponse(response);
}

export async function deleteChartPackage(chartId, authToken) {
  const response = await fetch(`${API_BASE}/admin/charts/${encodeURIComponent(chartId)}`, {
    method: "DELETE",
    headers: withAuthHeaders(authToken)
  });

  return handleResponse(response);
}
