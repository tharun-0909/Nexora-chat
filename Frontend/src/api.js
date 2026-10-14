const TOKEN_KEY = "nexora_token";

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const saveToken = (token) => sessionStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
};

export async function api(path, options = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };
  if (isFormData && !options.headers?.["Content-Type"]) delete headers["Content-Type"];
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body
      ? isFormData ? options.body : JSON.stringify(options.body)
      : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) clearToken();
    throw new Error(data.message || "Something went wrong. Please try again.");
  }
  return data;
}
