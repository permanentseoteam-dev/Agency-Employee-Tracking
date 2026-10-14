// Drives a test copy of the app through the Chrome DevTools Protocol: launch,
// click, type, read the page, take screenshots. Shared by the test environment
// (scripts/test-env) and the automated suites (scripts/e2e).
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '..', '..', '..')
/** The test build: out-test/, never the out/ folder a running app may be using. */
export const TEST_ENTRY = join(ROOT, 'out-test', 'main', 'index.js')
const ELECTRON = join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Starts a test copy of the app with its own profile folder and a DevTools port,
 * and returns helpers to drive its window. `shots` is where screenshots go.
 */
export async function launch({ port, userData, shots, entry = TEST_ENTRY, keepAlive = false }) {
  if (shots) mkdirSync(shots, { recursive: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // set by VS Code; it would start Electron as plain Node
  const proc = spawn(ELECTRON, [entry, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    env,
    stdio: 'ignore',
    detached: keepAlive
  })
  if (keepAlive) proc.unref()

  let target
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250)
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
    } catch {}
  }
  if (!target) throw new Error(`the test app did not open a window (DevTools port ${port})`)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const exceptions = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
    }
  }
  const send = (method, params = {}) => {
    const msg = { id: ++id, method, params }
    ws.send(JSON.stringify(msg))
    return new Promise((res, rej) => pending.set(msg.id, { res, rej }))
  }
  await send('Runtime.enable')
  await send('Page.enable')

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''))
    return r.result.value
  }
  /** Polls `expr` until it is truthy; returns false (does not throw) on timeout. */
  const waitFor = async (expr, timeout = 8000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      try {
        if (await evaluate(expr)) return true
      } catch {}
      await sleep(150)
    }
    return false
  }
  const clickSel = async (selector) => {
    const box = await evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`
    )
    if (!box) throw new Error('not found: ' + selector)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, pointerType: 'mouse' })
    await sleep(150)
  }
  const clickText = async (selector, text) => {
    const found = await evaluate(
      `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].reverse().find(e => e.offsetParent !== null && e.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.setAttribute('data-e2e', 'target'); return true })()`
    )
    if (!found) throw new Error(`no ${selector} with text "${text}"`)
    await clickSel('[data-e2e="target"]')
    await evaluate(`document.querySelector('[data-e2e="target"]')?.removeAttribute('data-e2e')`)
  }
  /** Sets an input, textarea or select the way React sees typing. */
  const setValue = (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('not found: ${selector.replace(/'/g, "\\'")}');
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      if (el.tagName === 'SELECT') el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
  /** Picks the option of a <select> whose text contains `optionText`. */
  const choose = (selector, optionText) =>
    evaluate(
      `(() => { const s = document.querySelector(${JSON.stringify(selector)}); const o = [...s.options].find(o => o.textContent.includes(${JSON.stringify(optionText)})); if (!o) throw new Error('no option ${optionText}'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })) })()`
    )
  const shot = async (name) => {
    if (!shots) return
    const r = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(shots, name + '.png'), Buffer.from(r.data, 'base64'))
  }
  const text = () => evaluate('document.body.innerText')
  const hash = () => evaluate('location.hash')
  const go = async (h) => {
    await evaluate(`location.hash = ${JSON.stringify(h)}`)
    await sleep(300)
  }
  const login = async (email, password) => {
    await waitFor(`!!document.querySelector('#email')`, 15000)
    await setValue('#email', email)
    await setValue('#password', password)
    await clickText('button', 'Sign in')
  }

  return {
    proc,
    userData,
    exceptions,
    sleep,
    evaluate,
    waitFor,
    clickSel,
    clickText,
    setValue,
    choose,
    shot,
    text,
    hash,
    go,
    login,
    /** Drops the DevTools connection but leaves the app running (test:app). */
    detach: () => ws.close(),
    /** Stops this test app (by its own PID only). */
    close: () => {
      try {
        ws.close()
      } catch {}
      proc.kill()
    }
  }
}
