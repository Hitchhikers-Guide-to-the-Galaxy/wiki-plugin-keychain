// wiki-plugin-keychain — the macOS side: `security`, `pbcopy`, `pbpaste`.
// CommonJS (see sibling package.json). Every child process is spawned with an
// argument array — no shell, so no name can be read as shell code.
//
// The rule this file keeps: a secret value lives only in a Buffer/string inside
// one function call. It is never logged, never put in an Error message, never
// returned except by reveal() (whose caller asked to see it).

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const LOGIN_KEYCHAIN = path.join(os.homedir(), 'Library/Keychains/login.keychain-db')

// Run a command, optionally feeding stdin. Resolves {code, stdout: Buffer,
// stderr: string}; never rejects with the arguments in the message (Node's own
// execFile error text quotes argv, which for `add-generic-password -w` would
// quote the secret).
const run = (cmd, args, { input, timeout = 20000, maxBytes = 64 * 1024 * 1024 } = {}) =>
  new Promise(resolve => {
    let child
    try { child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }) }
    catch (e) { return resolve({ code: -1, stdout: Buffer.alloc(0), stderr: `${cmd} could not start` }) }
    const out = [], err = []
    let size = 0
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.stdout.on('data', d => { size += d.length; if (size <= maxBytes) out.push(d) })
    child.stderr.on('data', d => err.push(d))
    child.on('error', () => {})
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8').trim() })
    })
    child.stdin.on('error', () => {})
    if (input != null) child.stdin.end(input)
    else child.stdin.end()
  })

// ── Listing ─────────────────────────────────────────────────────────────────
//
// `security dump-keychain` WITHOUT -d prints attributes only, never secrets.
// A blob attribute looks like either
//     "svce"<blob>="example-api-token"
//     "svce"<blob>=0x4E657874...  "Next\303\244..."   (non-ASCII: hex + octal)
//     "svce"<blob>=<NULL>
// We prefer the hex (exact bytes), else the quoted text.

const blobValue = raw => {
  if (raw == null) return ''
  const s = raw.trim()
  if (s === '<NULL>') return ''
  const hex = s.match(/^0x([0-9A-Fa-f]+)/)
  if (hex) return Buffer.from(hex[1], 'hex').toString('utf8').replace(/\0+$/, '')
  const q = s.match(/^"(.*)"$/)
  return q ? q[1] : s
}

// "mdat"<timedate>=0x3230...  "20261020093000Z\000" → 2026-10-20T09:30:00Z
const dateValue = raw => {
  const t = blobValue(raw).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  return t ? `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}Z` : ''
}

const parseDump = text => {
  const items = []
  for (const chunk of String(text).split(/^keychain: /m)) {
    if (!/^class: "genp"/m.test(chunk)) continue
    // most attributes are named ("svce"); the label is listed by its raw
    // id, 0x00000007, on generic passwords
    const attr = name => {
      const key = name === 'labl' ? '(?:"labl"|0x00000007 )' : `"${name}"`
      const m = chunk.match(new RegExp(`^\\s+${key}<[a-z0-9]+>=(.*)$`, 'm'))
      return m ? m[1] : null
    }
    const service = blobValue(attr('svce'))
    if (!service) continue
    items.push({
      service,
      account: blobValue(attr('acct')),
      label: blobValue(attr('labl')),
      modified: dateValue(attr('mdat')),
    })
  }
  // one row per (service, account), newest first within a name
  const seen = new Set()
  return items
    .sort((a, b) => (b.modified || '').localeCompare(a.modified || ''))
    .filter(i => { const k = `${i.service}\u0000${i.account}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.service.localeCompare(b.service, 'en', { sensitivity: 'base' }) || a.account.localeCompare(b.account))
}

const list = async () => {
  const r = await run('security', ['dump-keychain', LOGIN_KEYCHAIN])
  if (r.code !== 0) return { ok: false, message: 'The Keychain could not be listed.' }
  return { ok: true, items: parseDump(r.stdout.toString('utf8')) }
}

// ── Known names ─────────────────────────────────────────────────────────────
//
// The token.localhost registry records each secret as
//   **Stored as:** Keychain service `example-api-token`, account `example`
//   ... services `example-api-key` and `example-api-secret`
// and the Terminal plugin's vault maps entry names to Keychain services.
// Both give names only; we use them to badge and link list rows.

const parseRegistryText = text => {
  const out = []
  const re = /services?\s+`([^`]+)`(?:\s*(?:,|and)\s*`([^`]+)`)*/g
  let m
  while ((m = re.exec(text))) {
    for (const n of m[0].matchAll(/`([^`]+)`/g)) out.push(n[1])
  }
  return out
}

const readRegistry = farmRoot => {
  const known = {}
  const dir = path.join(farmRoot, 'token.localhost', 'pages')
  let slugs = []
  try { slugs = fs.readdirSync(dir) } catch { slugs = [] }
  for (const slug of slugs) {
    try {
      const page = JSON.parse(fs.readFileSync(path.join(dir, slug), 'utf8'))
      for (const item of page.story || []) {
        if (!/Stored as|Keychain service/i.test(item.text || '')) continue
        for (const svc of parseRegistryText(item.text)) {
          known[svc] ||= { page: `http://token.localhost/view/${slug}`, title: page.title || slug }
        }
      }
    } catch {}
  }
  try {
    const vault = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/wiki-plugin-terminal/vault.json'), 'utf8'))
    for (const [entry, v] of Object.entries(vault)) {
      const svc = v && typeof v === 'object' ? v.service : null
      if (!svc) continue
      known[svc] ||= {}
      known[svc].vault = entry
    }
  } catch {}
  return known
}

// ── Names and values ────────────────────────────────────────────────────────

// Existing entries (made by Safari, Chrome, apps) have names with spaces,
// colons, slashes — allow any printable text for copy/reveal (no shell).
const okLookupName = s => typeof s === 'string' && s.length <= 300 && !/[\u0000-\u001f\u007f]/.test(s)
// New entries made here follow the house convention, a little looser.
const NEW_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._@:\/+-]{0,119}$/
const okNewName = s => typeof s === 'string' && NEW_NAME.test(s)

// What the clipboard must look like to be saved as a secret.
const checkValue = v => {
  if (!v) return 'The clipboard is empty. Copy the key or password first.'
  if (/[\r\n]/.test(v)) return 'The clipboard holds more than one line. Copy just the key.'
  if (v.length < 8) return `The clipboard holds only ${v.length} characters — that does not look like a key or password.`
  if (v.length > 8192) return 'The clipboard holds too much text to be a key or password.'
  if (/^https?:\/\//i.test(v)) return 'The clipboard holds a link, not a key. Copy the key itself.'
  return null
}

const lookupArgs = (service, account) => account ? ['-a', account, '-s', service] : ['-s', service]

const exists = async (service, account) =>
  (await run('security', ['find-generic-password', ...lookupArgs(service, account)])).code === 0

// pbpaste → checks → add-generic-password. Returns names and a length only.
// The value sits in argv of `security` for the moment it runs (the tool cannot
// read -w from stdin without a tty) — the one exception the keychain-secret
// skill already accepts.
const save = async ({ service, account, label, overwrite, clear }) => {
  const clip = await run('pbpaste', [])
  if (clip.code !== 0) return { ok: false, status: 500, message: 'The clipboard could not be read.' }
  const value = clip.stdout.toString('utf8').trim()
  const bad = checkValue(value)
  if (bad) return { ok: false, status: 400, message: bad }
  const had = await exists(service, account)
  if (had && !overwrite) return { ok: false, status: 409, exists: true, message: `The Keychain already holds ${service} / ${account || '(no account)'}. Replace it?` }
  const args = ['add-generic-password', '-U', '-s', service, '-a', account || '']
  if (label) args.push('-l', label)
  args.push('-w', value)
  const r = await run('security', args)
  if (r.code !== 0) return { ok: false, status: 500, message: 'The Keychain refused the entry (exit ' + r.code + ').' }
  if (clear) await run('pbcopy', [], { input: '' })
  return { ok: true, status: 200, replaced: had, length: value.length, cleared: !!clear,
    message: `${had ? 'Replaced' : 'Saved'} ${service} / ${account || '(no account)'} — ${value.length} characters${clear ? ', clipboard cleared' : ''}.` }
}

// Keychain → value (in memory here) → pbcopy. Only the length comes back.
const copy = async ({ service, account }) => {
  const r = await run('security', ['find-generic-password', ...lookupArgs(service, account), '-w'], { timeout: 120000 })
  if (r.code !== 0) return { ok: false, status: 404, message: notFound(r, service) }
  const value = r.stdout.toString('utf8').replace(/\n$/, '')
  const c = await run('pbcopy', [], { input: value })
  if (c.code !== 0) return { ok: false, status: 500, message: 'The clipboard could not be written.' }
  return { ok: true, status: 200, length: value.length, message: `Copied ${service} to the clipboard — ${value.length} characters.` }
}

const reveal = async ({ service, account }) => {
  const r = await run('security', ['find-generic-password', ...lookupArgs(service, account), '-w'], { timeout: 120000 })
  if (r.code !== 0) return { ok: false, status: 404, message: notFound(r, service) }
  return { ok: true, status: 200, value: r.stdout.toString('utf8').replace(/\n$/, '') }
}

// exit 44 = not found; 128/51 = the macOS access dialog was denied/cancelled
const notFound = (r, service) =>
  r.code === 44 ? `No Keychain entry named ${service}.`
    : (r.code === 128 || r.code === 51 || /User canceled|interaction/i.test(r.stderr)) ? 'Access was not allowed at the macOS Keychain dialog.'
    : `The Keychain would not give up ${service} (exit ${r.code}).`


// ── The registry card ───────────────────────────────────────────────────────
//
// Every new secret gets a page on token.localhost (Keychain Naming
// Convention). After a save whose service no registry page names yet, write
// one — names only — and list it on Token Inventory under "New Entries" for
// David to file under a category. Never overwrites an existing page.

const asSlug = title => title.replace(/\s/g, '-').replace(/[^A-Za-z0-9-]/g, '').toLowerCase()
const nid = () => require('node:crypto').randomBytes(8).toString('hex')
const titleFor = (service, label) => label || service.split(/[-_.]+/).filter(Boolean)
  .map(w => w.length <= 3 && /^(api|dns|s3|ssh|url|oidc)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(' ')
const TOOL = '[http://localhost/view/password-tool Password Tool]'

const writeJson = (file, value) => {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

const recordCard = ({ farmRoot, service, account, label, date = new Date() }) => {
  const site = path.join(farmRoot, 'token.localhost')
  const pages = path.join(site, 'pages')
  if (!fs.existsSync(pages)) return null
  if (readRegistry(farmRoot)[service]?.page) return null
  const title = titleFor(service, label)
  const slug = asSlug(title)
  if (!slug) return null
  const url = `http://token.localhost/view/${slug}`
  const file = path.join(pages, slug)
  if (fs.existsSync(file)) return { slug, url, title, existed: true }
  const day = date.toISOString().slice(0, 10)
  const item = (type, text) => ({ type, id: nid(), text })
  const story = [
    item('paragraph', `Saved with the ${TOOL} on ${day}. Say here what this secret authenticates, who issued it and what uses it.`),
    item('markdown', `# Details\n\n- **Stored as:** Keychain service \`${service}\`${account ? `, account \`${account}\`` : ''}\n- **Provider:** to be filled in\n- **Used by:** to be filled in`),
    item('markdown', `# Rotate\n\nMint a replacement with the provider, copy it, and Save it over this entry on the ${TOOL} — it asks before replacing.`),
    item('markdown', '# See\n\n[[Token Inventory]] - [[Rotation Schedule]]'),
  ]
  const now = date.getTime()
  writeJson(file, { title, story, journal: [{ type: 'create', item: { title, story }, date: now,
    provenance: 'Written by the Password Tool (wiki-plugin-keychain) when the secret was saved — names only, never the value.' }] })

  // list it on the inventory, in a New Entries section above See
  const inv = path.join(pages, 'token-inventory')
  try {
    const page = JSON.parse(fs.readFileSync(inv, 'utf8'))
    const line = `- [[${title}]]`
    if (!page.story.some(i => typeof i.text === 'string' && i.text.includes(`[[${title}]]`))) {
      let it = page.story.find(i => typeof i.text === 'string' && i.text.startsWith('# New Entries'))
      if (it) {
        it.text = `${it.text.trimEnd()}\n${line}`
        page.journal.push({ type: 'edit', id: it.id, item: { ...it }, date: now })
      } else {
        it = item('markdown', `# New Entries\n\nSaved with the ${TOOL} and waiting to be filed under a category above.\n\n${line}`)
        const see = page.story.findIndex(i => typeof i.text === 'string' && i.text.startsWith('# See'))
        const at = see === -1 ? page.story.length : see
        page.story.splice(at, 0, it)
        page.journal.push({ type: 'add', id: it.id, item: { ...it }, after: at > 0 ? page.story[at - 1].id : undefined, date: now })
      }
      writeJson(inv, page)
    }
  } catch {}
  // the sitemap and search index rebuild on the next view
  for (const f of ['sitemap.json', 'site-index.json']) fs.rmSync(path.join(site, 'status', f), { force: true })
  return { slug, url, title, existed: false }
}

// Delete — exact entries only. An empty account would let `security` pick the
// first entry of that service under ANY account, so it is allowed only when
// the service has exactly one entry. The registry card stays (history), with
// a dated line saying the secret is gone.
const del = async ({ service, account }) => {
  const listed = await list()
  if (!listed.ok) return { ok: false, status: 500, message: listed.message }
  const same = listed.items.filter(i => i.service === service)
  if (!account && same.length > 1) return { ok: false, status: 409, message: `${service} has ${same.length} entries; delete needs the account to say which.` }
  const target = account ? same.find(i => i.account === account) : same[0]
  if (!target) return { ok: false, status: 404, message: `No Keychain entry ${service} / ${account || '(no account)'}.` }
  account = target.account
  const r = await run('security', ['delete-generic-password', ...lookupArgs(service, account)])
  if (r.code !== 0) return { ok: false, status: 500, message: notFound(r, service) }
  return { ok: true, status: 200, message: `Deleted ${service} / ${account || '(no account)'} from the Keychain.` }
}

const markDeleted = ({ farmRoot, service, date = new Date() }) => {
  const known = readRegistry(farmRoot)[service]
  if (!known || !known.page) return null
  const slug = known.page.split('/view/')[1]
  const file = path.join(farmRoot, 'token.localhost', 'pages', slug)
  const page = JSON.parse(fs.readFileSync(file, 'utf8'))
  const it = page.story.find(i => typeof i.text === 'string' && i.text.includes(`\`${service}\``))
  if (!it) return null
  const day = date.toISOString().slice(0, 10)
  it.text = `${it.text.trimEnd()}\n- **Deleted from Keychain:** ${day}, \`${service}\`, with the Password Tool`
  page.journal.push({ type: 'edit', id: it.id, item: { ...it }, date: date.getTime() })
  writeJson(file, page)
  return { slug, url: known.page, title: known.title }
}

module.exports = { del, markDeleted, recordCard, titleFor, asSlug, run, parseDump, blobValue, dateValue, parseRegistryText, readRegistry, list, save, copy, reveal, exists, checkValue, okLookupName, okNewName, LOGIN_KEYCHAIN }
