async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...options,
  })
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}))
    throw new Error(error ?? `request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

export const listItems = () => request("/items")
export const createItem = (name) => request("/items", { method: "POST", body: JSON.stringify({ name }) })
export const updateItem = (id, patch) => request(`/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
export const deleteItem = (id) => request(`/items/${id}`, { method: "DELETE" })
