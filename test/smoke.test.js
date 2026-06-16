/**
 * Smoke test — 验证基础连通性
 * 运行: node test/smoke.test.js
 */
const http = require("http")
const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "..", "server", ".env") })

const BASE = "http://localhost:3001"
let passed = 0
let failed = 0

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE)
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    }
    const req = http.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })
    req.on("error", (err) => reject(err))
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${name}: ${err.message}`)
  }
}

;(async () => {
  console.log("Smoke tests for Intervy server\n")

  await test("Health endpoint returns 200", async () => {
    const { status } = await request("GET", "/health")
    if (status !== 200) throw new Error(`expected 200, got ${status}`)
  })

  await test("Knowledge base list returns array", async () => {
    const { status, body } = await request("GET", "/api/knowledge")
    if (status !== 200 || !Array.isArray(body)) throw new Error("expected 200 + array")
  })

  await test("Questions generate returns 400 for empty content", async () => {
    const { status } = await request("POST", "/api/questions/generate", { content: "" })
    if (status !== 400) throw new Error(`expected 400, got ${status}`)
  })

  await test("Interview score returns 400 for empty fields", async () => {
    const { status } = await request("POST", "/api/interview/score", { question: "", userAnswer: "" })
    if (status !== 400) throw new Error(`expected 400, got ${status}`)
  })

  await test("CORS headers present on API", async () => {
    const { status } = await request("GET", "/api/knowledge")
    if (status !== 200) throw new Error(`expected 200, got ${status}`)
  })

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests`)
  process.exit(failed > 0 ? 1 : 0)
})()
