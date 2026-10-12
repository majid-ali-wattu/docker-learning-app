import express from "express"
import { MongoClient, ObjectId } from "mongodb"

const PORT = process.env.PORT ?? 3000
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://admin:password@localhost:27017"

const client = new MongoClient(MONGO_URL)
await client.connect()
const items = client.db("app").collection("items")

const app = express()
app.use(express.json())

// Reject malformed ids before they reach the driver.
app.param("id", (req, res, next, id) => {
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" })
  req.oid = new ObjectId(id)
  next()
})

const body = (req) => {
  const { name, done } = req.body ?? {}
  return { name, done }
}

app.get("/health", async (req, res) => {
  await client.db("admin").command({ ping: 1 })
  res.json({ status: "ok" })
})

app.get("/items", async (req, res) => {
  res.json(await items.find().toArray())
})

app.post("/items", async (req, res) => {
  const { name, done = false } = body(req)
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" })
  }
  const doc = { name: name.trim(), done: Boolean(done), createdAt: new Date() }
  const { insertedId } = await items.insertOne(doc)
  res.status(201).json({ _id: insertedId, ...doc })
})

app.get("/items/:id", async (req, res) => {
  const doc = await items.findOne({ _id: req.oid })
  if (!doc) return res.status(404).json({ error: "not found" })
  res.json(doc)
})

app.patch("/items/:id", async (req, res) => {
  const { name, done } = body(req)
  const $set = {}
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name must be a non-empty string" })
    }
    $set.name = name.trim()
  }
  if (done !== undefined) $set.done = Boolean(done)
  if (!Object.keys($set).length) return res.status(400).json({ error: "nothing to update" })

  const doc = await items.findOneAndUpdate({ _id: req.oid }, { $set }, { returnDocument: "after" })
  if (!doc) return res.status(404).json({ error: "not found" })
  res.json(doc)
})

app.delete("/items/:id", async (req, res) => {
  const { deletedCount } = await items.deleteOne({ _id: req.oid })
  if (!deletedCount) return res.status(404).json({ error: "not found" })
  res.status(204).end()
})

app.use((req, res) => res.status(404).json({ error: "not found" }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.status ? err.message : "internal error" })
})

const server = app.listen(PORT, () => console.log(`listening on :${PORT}`))

const shutdown = () => server.close(async () => {
  await client.close()
  process.exit(0)
})
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
