// handlers.js — the Password Tool's operations, mounted by the Farm plugin
// (node) or natively by sweet-server, beneath /system/api/keychain/.
// CommonJS (see sibling package.json).
//
// Like the Live and Voice tools, keychain has no server of its own: the
// operations are declared in package.json (fedwiki.api) and api/openapi.json.
// That buys three things a plain node route could not:
//
//   - it works on sweet-served sites, whose sessions node cannot read;
//   - save, copy and reveal are WRITES, so whichever server answers refuses
//     them unless the caller is signed in as the site's owner, and refuses
//     them outright on a public site;
//   - writes are never offered to agents through the farm's MCP door. Only
//     list (names, never values) is.
//
//   list    — Keychain entries by name: service, account, label, date
//   save    — the server's own clipboard → a new or replaced entry; a length back
//   copy    — an entry → the clipboard; a length back
//   reveal  — an entry's value, for the page to show for fifteen seconds
//   delete  — remove one exact entry; its registry card gets a dated note
//
// Logs carry the action and the name, never a value.

const path = require('node:path')
const kc = require('./keychain.js')

const problem = (status, message) => Object.assign(new Error(message), { status })
const log = (...a) => console.log('[keychain]', ...a)

const usable = () => {
  if (process.platform !== 'darwin') throw problem(501, 'The Password Tool works only on a Mac — this wiki is not running on one.')
  if (/^(0|off|no|false)$/i.test(process.env.WIKI_KEYCHAIN || '')) throw problem(403, 'The Password Tool is switched off on this farm (WIKI_KEYCHAIN).')
}

const lookupNames = ({ service, account = '' }) => {
  if (!service || !kc.okLookupName(service) || !kc.okLookupName(account)) throw problem(400, 'That is not a Keychain name this tool can look up.')
  return { service, account }
}

const newNames = ({ service, account = '', label = '' }) => {
  const s = String(service || '').trim(), a = String(account || '').trim(), l = String(label || '').trim()
  if (!kc.okNewName(s) || (a && !kc.okNewName(a)) || (l && !kc.okNewName(l))) {
    throw problem(400, 'Names start with a letter or digit and use letters, digits, spaces and . _ @ : / + - (up to 120).')
  }
  return { service: s, account: a, label: l }
}

// a few actions a second is plenty for a person; stops a runaway loop
let stamps = []
const pace = () => {
  const now = Date.now()
  stamps = stamps.filter(t => now - t < 60000)
  if (stamps.length >= 40) throw problem(429, 'Too many Keychain actions in a minute. Wait a moment.')
  stamps.push(now)
}

const answer = (r, what, n) => {
  log(`${what} ${n.service} / ${n.account}: ${r.ok ? 'ok' : r.status}`)
  if (!r.ok) throw problem(r.status, r.message)
  const { status, ...body } = r
  return body
}

const list = async ({ status } = {}) => {
  usable()
  const r = await kc.list()
  if (!r.ok) throw problem(500, r.message)
  const farmRoot = status ? path.dirname(path.dirname(status)) : ''
  const known = farmRoot ? kc.readRegistry(farmRoot) : {}
  const items = r.items.map(i => ({ ...i, known: known[i.service] || null }))
  return { ok: true, keychain: 'login', count: items.length, items }
}

const save = async args => {
  usable(); pace()
  const n = newNames(args)
  const body = answer(await kc.save({ ...n, overwrite: !!args.overwrite, clear: !!args.clear }), 'save', n)
  if (args.status) {
    try {
      const card = kc.recordCard({ farmRoot: path.dirname(path.dirname(args.status)), ...n })
      if (card) {
        body.card = card
        if (!card.existed) log(`card ${card.slug} for ${n.service}`)
      }
    } catch (e) { log(`card for ${n.service} failed: ${e.message}`) }
  }
  return body
}

const copy = async args => {
  usable(); pace()
  const n = lookupNames(args)
  return answer(await kc.copy(n), 'copy', n)
}

const reveal = async args => {
  usable(); pace()
  const n = lookupNames(args)
  return answer(await kc.reveal(n), 'reveal', n)
}

// Delete asks the caller to name the service twice (confirm), so a stray
// call with the wrong row cannot remove anything.
const del = async args => {
  usable(); pace()
  const n = lookupNames(args)
  if (args.confirm !== n.service) throw problem(400, 'Delete needs confirm set to the service name.')
  const body = answer(await kc.del(n), 'delete', n)
  if (args.status) {
    try {
      const card = kc.markDeleted({ farmRoot: path.dirname(path.dirname(args.status)), service: n.service })
      if (card) body.card = card
    } catch (e) { log(`card note for ${n.service} failed: ${e.message}`) }
  }
  return body
}

module.exports = { list, save, copy, reveal, delete: del }
