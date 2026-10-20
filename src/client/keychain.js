// wiki-plugin-keychain — the Password Tool as a wiki item.
//
// Item text DSL (fedwiki-dsl: UPPERCASE first word is the command):
//   KEYCHAIN    save form + list (default when empty)
//   SAVE        the save-from-clipboard form only
//   LIST        the list only
// Lines after the command are shown above the tool as the page's own words.
//
// The value of a secret never passes through this file on Save or Copy: the
// server reads the clipboard and writes it, and answers with a length. Only
// Reveal brings a value into the page, into one element that is removed after
// fifteen seconds.
//
// The form can be prefilled from the address bar, names only:
//   http://localhost/view/password-tool#service=example-api-token&account=example&label=Example
// which is how Claude hands David a ready-to-save link without ever seeing the key.

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const REVEAL_SECONDS = 15
const DEFAULT_ACCOUNT = 'anarchive'

const CSS = `
.kc-item { font-size: 14px; line-height: 1.45; }
.kc-item .kc-note { margin: 0 0 8px; }
.kc-item .kc-who { font-size: 12px; color: #555; margin: 0 0 8px; }
.kc-item form, .kc-item .kc-list { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; background: #fafafa; margin-bottom: 10px; }
.kc-item h4 { margin: 0 0 6px; font-size: 13px; }
.kc-item label { display: block; margin: 6px 0 2px; font-weight: bold; font-size: 12px; color: #333; }
.kc-item label.kc-check { font-weight: normal; display: flex; gap: 6px; align-items: center; }
.kc-item input[type=text], .kc-item input[type=search] { width: 100%; box-sizing: border-box; font-size: 14px; padding: 5px 6px; border: 1px solid #bbb; border-radius: 4px; }
.kc-item button { font-size: 13px; padding: 4px 12px; border: 1px solid #888; border-radius: 4px; background: #fff; cursor: pointer; }
.kc-item form button[type=submit] { margin-top: 10px; }
.kc-item button[disabled] { opacity: .5; cursor: default; }
.kc-item .kc-result { margin-top: 8px; padding: 6px 8px; border-radius: 4px; font-size: 13px; }
.kc-item .kc-result.ok { background: #e3f5e3; color: #1e6b1e; }
.kc-item .kc-result.bad { background: #fde8e8; color: #9b1c1c; }
.kc-item .kc-result.off { background: #f3f3f3; color: #555; }
.kc-item .kc-bar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.kc-item .kc-bar input { flex: 1; }
.kc-item .kc-count { font-size: 12px; color: #666; margin: 4px 0; }
.kc-item .kc-rows { max-height: 420px; overflow-y: auto; }
.kc-item .kc-row { display: flex; gap: 6px; align-items: flex-start; padding: 5px 0; border-top: 1px solid #eee; }
.kc-item .kc-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.kc-item .kc-svc { font-weight: bold; font-size: 13px; cursor: pointer; }
.kc-item .kc-meta { font-size: 11px; color: #666; }
.kc-item .kc-badge { font-size: 10px; padding: 0 5px; border-radius: 8px; background: #e7eefc; color: #234; margin-left: 4px; text-decoration: none; }
.kc-item .kc-actions { display: flex; gap: 4px; flex-shrink: 0; }
.kc-item .kc-actions button { padding: 2px 8px; font-size: 12px; }
.kc-item .kc-actions button.kc-del { color: #9b1c1c; }
.kc-item .kc-actions button.kc-armed { background: #9b1c1c; color: #fff; border-color: #9b1c1c; }
.kc-item .kc-secret { display: block; margin-top: 3px; padding: 3px 6px; background: #222; color: #9f9; font-family: ui-monospace, Menlo, monospace; font-size: 12px; border-radius: 3px; overflow-wrap: anywhere; user-select: all; }
.kc-item details summary { cursor: pointer; font-size: 12px; color: #444; padding: 6px 0 2px; }
`
const ensureStyle = () => {
  if (typeof document === 'undefined' || document.getElementById('wiki-plugin-keychain-style')) return
  const s = document.createElement('style'); s.id = 'wiki-plugin-keychain-style'; s.textContent = CSS
  document.head.appendChild(s)
}

export const parse = text => {
  const lines = (text || '').split(/\r?\n/)
  const first = (lines[0] || '').trim()
  const m = first.match(/^(KEYCHAIN|SAVE|LIST):?\s*(.*)$/)
  const command = m ? m[1] : 'KEYCHAIN'
  const rest = m ? [m[2], ...lines.slice(1)] : lines
  return { command, note: rest.join('\n').trim() }
}

// #service=…&account=…&label=… → {service, account, label}; names only
export const prefill = hash => {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  const out = {}
  for (const k of ['service', 'account', 'label']) if (p.get(k)) out[k] = p.get(k).slice(0, 120)
  return out
}

const saveForm = () => `
  <form class="kc-save">
    <h4>Save the clipboard to the Keychain</h4>
    <label>Service</label><input type="text" name="service" placeholder="provider-purpose-token" autocomplete="off" spellcheck="false">
    <label>Account</label><input type="text" name="account" value="${DEFAULT_ACCOUNT}" autocomplete="off" spellcheck="false">
    <label>Label (optional, what Keychain Access shows)</label><input type="text" name="label" autocomplete="off">
    <label class="kc-check"><input type="checkbox" name="clear" checked> Clear the clipboard after saving</label>
    <button type="submit">Save clipboard to Keychain</button>
    <div class="kc-result" hidden></div>
  </form>`

const listBox = () => `
  <div class="kc-list">
    <h4>In the login Keychain</h4>
    <div class="kc-bar"><input type="search" placeholder="Search names…" spellcheck="false"><button class="kc-refresh" type="button">Refresh</button></div>
    <div class="kc-count"></div>
    <div class="kc-rows"></div>
    <div class="kc-result" hidden></div>
  </div>`

export const emit = (div, item) => {
  ensureStyle()
  const { command, note } = parse(item.text)
  div.html(`
    <div class="kc-item" data-mode="${command}">
      ${note ? `<p class="kc-note">${esc(note)}</p>` : ''}
      <p class="kc-who">Checking…</p>
      ${command !== 'LIST' ? saveForm() : ''}
      ${command !== 'SAVE' ? listBox() : ''}
    </div>`)
}

const show = (box, cls, html) => { box.className = `kc-result ${cls}`; box.innerHTML = html; box.hidden = false }

const API = '/system/api/keychain'
const isOwner = () => typeof window !== 'undefined' && window.isOwner === true

// The farm door answers a handler's result, or {error} with a status.
const call = async (route, body) => {
  const r = await fetch(`${API}/${route}.json`, body
    ? { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { credentials: 'same-origin', cache: 'no-store' })
  let d = {}
  try { d = await r.json() } catch { d = {} }
  if (r.ok) return { ok: true, ...d }
  if (r.status === 403 && /rights|owner/i.test(d.error || '')) return { ok: false, status: 403, message: 'Log in as the owner of this wiki (the key at the bottom of the page) to do that.' }
  const message = d.error || d.message || (r.status === 404
    ? 'This wiki has no Password Tool behind it (the Keychain plugin is not installed on its farm).'
    : `The server answered ${r.status}.`)
  return { ok: false, status: r.status, message }
}

const rowHtml = (i, n) => {
  const badge = i.known
    ? (i.known.page ? `<a class="kc-badge" href="${esc(i.known.page)}" target="_blank" title="${esc(i.known.title || '')}">registry</a>` : '')
      + (i.known.vault ? `<span class="kc-badge" title="Terminal vault entry">vault: ${esc(i.known.vault)}</span>` : '')
    : ''
  const meta = [i.account && `account ${i.account}`, i.label && i.label !== i.service && `label ${i.label}`, i.modified && i.modified.slice(0, 10)].filter(Boolean)
  return `<div class="kc-row" data-n="${n}">
    <div class="kc-name"><span class="kc-svc" title="Fill the save form with this name (to replace the value)">${esc(i.service)}</span>${badge}
      <div class="kc-meta">${esc(meta.join(' · '))}</div></div>
    <div class="kc-actions"><button type="button" data-act="delete" class="kc-del">Delete</button><button type="button" data-act="reveal">Reveal</button><button type="button" data-act="copy">Copy</button></div>
  </div>`
}

export const bind = async (div, item) => {
  const root = div.find('.kc-item')[0]
  if (!root) return
  const who = div.find('.kc-who')[0]
  const form = div.find('form.kc-save')[0]
  const listEl = div.find('.kc-list')[0]
  const off = msg => {
    who.textContent = msg
    root.querySelectorAll('input, button').forEach(el => { el.disabled = true })
  }

  const probe = await call('list').catch(() => ({ ok: false, message: 'The wiki server did not answer.' }))
  if (!probe.ok) return off(probe.message)
  const owner = isOwner()
  who.textContent = owner
    ? `Ready — this Mac's login Keychain, through ${location.hostname}.`
    : 'Names only: log in as the owner of this wiki (the key at the bottom of the page) to save, copy or reveal.'
  if (!owner && form) form.querySelectorAll('input, button').forEach(el => { el.disabled = true })

  let items = []
  let reload = async () => {}

  if (form) {
    const box = form.querySelector('.kc-result')
    const button = form.querySelector('button[type=submit]')
    const fill = p => { for (const [k, v] of Object.entries(p)) if (form.elements[k]) form.elements[k].value = v }
    fill(prefill(location.hash))
    window.addEventListener('hashchange', () => fill(prefill(location.hash)))

    const send = async overwrite => {
      const f = new FormData(form)
      const body = {
        service: String(f.get('service') || '').trim(),
        account: String(f.get('account') || '').trim(),
        label: String(f.get('label') || '').trim(),
        clear: !!f.get('clear'), overwrite,
      }
      if (!body.service) return show(box, 'bad', 'Give the entry a service name.')
      button.disabled = true
      show(box, 'off', 'Reading the clipboard on this Mac…')
      try {
        const d = await call('save', body)
        if (d.status === 409) {
          show(box, 'bad', `${esc(d.message)} <button type="button" class="kc-replace">Replace it</button>`)
          box.querySelector('.kc-replace').addEventListener('click', () => send(true))
          return
        }
        let html = esc(d.message)
        if (d.ok && d.card) html += ` ${d.card.existed ? 'Its page' : 'New registry card'}: <a href="${esc(d.card.url)}" target="_blank">${esc(d.card.title)}</a>${d.card.existed ? '' : ' — fill in what it is for'}.`
        show(box, d.ok ? 'ok' : 'bad', html)
        if (d.ok) { form.elements.label.value = ''; reload() }
      } catch (e) {
        show(box, 'bad', 'The wiki server did not answer. Nothing was saved.')
      } finally { button.disabled = false }
    }
    form.addEventListener('submit', ev => { ev.preventDefault(); send(false) })
  }

  if (listEl) {
    const rows = listEl.querySelector('.kc-rows')
    const count = listEl.querySelector('.kc-count')
    const search = listEl.querySelector('input[type=search]')
    const box = listEl.querySelector('.kc-result')
    let hideTimer = null

    const draw = () => {
      const q = search.value.trim().toLowerCase()
      const match = i => !q || [i.service, i.account, i.label, i.known && i.known.vault].some(s => (s || '').toLowerCase().includes(q))
      const shown = items.map((i, n) => [i, n]).filter(([i]) => match(i))
      const known = shown.filter(([i]) => i.known), other = shown.filter(([i]) => !i.known)
      count.textContent = q ? `${shown.length} of ${items.length} match` : `${items.length} entries — ${known.length} documented`
      const html = rs => rs.map(([i, n]) => rowHtml(i, n)).join('')
      rows.innerHTML = q
        ? html(known) + html(other)
        : html(known) + (other.length ? `<details><summary>Other entries (${other.length}) — apps, Wi-Fi, browsers, undocumented</summary>${html(other)}</details>` : '')
    }

    reload = async () => {
      count.textContent = 'Listing…'
      try {
        const r = await call('list')
        if (!r.ok) { count.textContent = ''; return show(box, 'bad', esc(r.message)) }
        items = r.items
        draw()
        if (!isOwner()) rows.querySelectorAll('button').forEach(b => { b.disabled = true })
      } catch (e) { count.textContent = ''; show(box, 'bad', 'The list did not load.') }
    }

    const hideSecret = row => {
      const s = row && row.querySelector('.kc-secret')
      if (s) { s.textContent = ''; s.remove() }
      const b = row && row.querySelector('[data-act=reveal]')
      if (b) b.textContent = 'Reveal'
    }
    const hideAll = () => { clearInterval(hideTimer); hideTimer = null; rows.querySelectorAll('.kc-row').forEach(hideSecret) }

    search.addEventListener("input", () => { hideAll(); draw(); if (!isOwner()) rows.querySelectorAll("button").forEach(b => { b.disabled = true }) })
    listEl.querySelector('.kc-refresh').addEventListener('click', () => { hideAll(); reload() })

    rows.addEventListener('click', async ev => {
      const row = ev.target.closest('.kc-row')
      if (!row) return
      const i = items[Number(row.dataset.n)]
      if (ev.target.classList.contains('kc-svc') && form) {
        form.elements.service.value = i.service
        form.elements.account.value = i.account
        form.elements.label.value = i.label && i.label !== i.service ? i.label : ''
        form.scrollIntoView({ block: 'nearest' })
        return
      }
      const act = ev.target.dataset && ev.target.dataset.act
      if (!act) return
      const btn = ev.target
      if (act === 'reveal' && row.querySelector('.kc-secret')) return hideAll()
      // Delete takes two clicks: the first arms the button for five seconds
      if (act === 'delete' && !btn.classList.contains('kc-armed')) {
        btn.classList.add('kc-armed'); btn.textContent = 'Confirm'
        show(box, 'bad', `Delete ${esc(i.service)}${i.account ? ` / ${esc(i.account)}` : ''} from the Keychain? This cannot be undone — press Confirm.`)
        setTimeout(() => { if (btn.isConnected) { btn.classList.remove('kc-armed'); btn.textContent = 'Delete' } }, 5000)
        return
      }
      btn.disabled = true
      show(box, 'off', act === 'copy' ? `Copying ${esc(i.service)}… (macOS may ask you to allow access)` : `Fetching ${esc(i.service)}… (macOS may ask you to allow access)`)
      try {
        const d = await call(act, act === 'delete'
          ? { service: i.service, account: i.account, confirm: i.service }
          : { service: i.service, account: i.account })
        if (!d.ok) return show(box, 'bad', esc(d.message))
        if (act === 'copy') return show(box, 'ok', esc(d.message))
        if (act === 'delete') {
          show(box, 'ok', esc(d.message) + (d.card ? ` Its card <a href="${esc(d.card.url)}" target="_blank">${esc(d.card.title)}</a> now says so.` : ''))
          return reload()
        }
        hideAll()
        box.hidden = true
        const el = document.createElement('code')
        el.className = 'kc-secret'
        el.textContent = d.value
        row.querySelector('.kc-name').appendChild(el)
        let left = REVEAL_SECONDS
        btn.textContent = `Hide ${left}`
        hideTimer = setInterval(() => {
          left -= 1
          if (left <= 0) return hideAll()
          btn.textContent = `Hide ${left}`
        }, 1000)
      } catch (e) {
        show(box, 'bad', 'The wiki server did not answer.')
      } finally { btn.disabled = false }
    })

    // never leave a revealed value behind when the page is hidden or closed
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideAll() })
    window.addEventListener('pagehide', hideAll)

    items = probe.items
    draw()
    if (!owner) rows.querySelectorAll('button').forEach(b => { b.disabled = true })
  }
}

if (typeof window !== 'undefined') {
  window.plugins = window.plugins || {}
  window.plugins.keychain = { emit, bind }
}
