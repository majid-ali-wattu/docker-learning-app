import { useEffect, useState } from "react"
import { createItem, deleteItem, listItems, updateItem } from "./api.js"

export default function App() {
  const [items, setItems] = useState([])
  const [name, setName] = useState("")
  const [error, setError] = useState(null)

  // Run an API action, surface any failure, and refresh the list afterwards.
  const act = async (fn) => {
    try {
      setError(null)
      await fn()
      setItems(await listItems())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    act(async () => {})
  }, [])

  const add = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    act(() => createItem(name)).then(() => setName(""))
  }

  return (
    <main>
      <h1>Items</h1>
      <form onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New item" />
        <button>Add</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul>
        {items.map((item) => (
          <li key={item._id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => act(() => updateItem(item._id, { done: !item.done }))}
              />
              {item.name}
            </label>
            <button onClick={() => act(() => deleteItem(item._id))}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
