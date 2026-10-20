const test = require('node:test')
const assert = require('node:assert')
const kc = require('../api/keychain.js')
const srv = require('../api/handlers.js')

const DUMP = `keychain: "/Users/x/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    0x00000007 <blob>="deSEC token"
    "acct"<blob>="example"
    "mdat"<timedate>=0x32303236313032303039333030305A00  "20261020093000Z\\000"
    "svce"<blob>="example-api-token"
keychain: "/Users/x/Library/Keychains/login.keychain-db"
version: 512
class: "inet"
attributes:
    "acct"<blob>="web"
    "srvr"<blob>="example.org"
keychain: "/Users/x/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>=0x4BC3A47365  "K\\303\\244se"
    "svce"<blob>="Wi Fi: café"
`

test('parseDump keeps generic passwords only, decodes hex', () => {
  const items = kc.parseDump(DUMP)
  assert.deepStrictEqual(items.map(i => [i.service, i.account]), [['example-api-token', 'example'], ['Wi Fi: café', 'Käse']])
  assert.strictEqual(items[0].modified, '2026-10-20T09:30:00Z')
  assert.strictEqual(items[0].label, 'deSEC token')
})

test('registry text yields service names', () => {
  assert.deepStrictEqual(kc.parseRegistryText('- **Stored as:** Keychain services `example-api-key` and `example-api-secret`, account `example`'), ['example-api-key', 'example-api-secret'])
  assert.deepStrictEqual(kc.parseRegistryText('Keychain service `example-api-token`, account `example`'), ['example-api-token'])
})

test('clipboard checks', () => {
  assert.ok(kc.checkValue(''))
  assert.ok(kc.checkValue('short'))
  assert.ok(kc.checkValue('https://example.org/token/abc'))
  assert.ok(kc.checkValue('line one\nline two'))
  assert.strictEqual(kc.checkValue('sk-abcdef0123456789'), null)
})

test('names', () => {
  assert.ok(kc.okNewName('cloudflare-seed-token'))
  assert.ok(!kc.okNewName('-rm'))
  assert.ok(!kc.okNewName('a;b`c`'))
  assert.ok(kc.okLookupName('GitHub - https://api.github.com'))
  assert.ok(!kc.okLookupName('bad\nname'))
})

test('handlers refuse bad names before touching the Keychain', async () => {
  await assert.rejects(srv.copy({ service: 'bad\nname' }), e => e.status === 400)
  await assert.rejects(srv.save({ service: ';rm -rf' }), e => e.status === 400)
})

test('recordCard writes a names-only card once and lists it', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const farm = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-farm-'))
  const pages = path.join(farm, 'token.localhost', 'pages')
  fs.mkdirSync(pages, { recursive: true }); fs.mkdirSync(path.join(farm, 'token.localhost', 'status'))
  fs.writeFileSync(path.join(pages, 'token-inventory'), JSON.stringify({ title: 'Token Inventory', story: [{ type: 'markdown', id: 'a', text: '# See\n\n[[Rotation Schedule]]' }], journal: [] }))
  const c = kc.recordCard({ farmRoot: farm, service: 'arena-access-token', account: 'anarchive', label: '' })
  assert.strictEqual(c.title, 'Arena Access Token')
  const card = JSON.parse(fs.readFileSync(path.join(pages, c.slug), 'utf8'))
  assert.match(card.story[1].text, /Keychain service `arena-access-token`, account `anarchive`/)
  const inv = JSON.parse(fs.readFileSync(path.join(pages, 'token-inventory'), 'utf8'))
  assert.match(inv.story[0].text, /^# New Entries[\s\S]*\[\[Arena Access Token\]\]/)
  assert.strictEqual(inv.story[1].text.slice(0, 5), '# See')
  assert.strictEqual(kc.recordCard({ farmRoot: farm, service: 'arena-access-token', account: 'anarchive' }), null) // now documented
  kc.recordCard({ farmRoot: farm, service: 'b-api-key', account: '' })
  const inv2 = JSON.parse(fs.readFileSync(path.join(pages, 'token-inventory'), 'utf8'))
  assert.match(inv2.story[0].text, /\[\[Arena Access Token\]\]\n- \[\[B API Key\]\]/)
  fs.rmSync(farm, { recursive: true })
})

test('delete removes one exact entry, refuses ambiguity (live Keychain, dummy values)', { skip: process.platform !== 'darwin' }, async () => {
  const S = 'wiki-plugin-keychain-selftest'
  for (const a of ['one', 'two']) await kc.run('security', ['add-generic-password', '-U', '-s', S, '-a', a, '-w', 'not-a-secret'])
  try {
    const amb = await kc.del({ service: S, account: '' })
    assert.strictEqual(amb.status, 409)
    const ok = await kc.del({ service: S, account: 'one' })
    assert.ok(ok.ok, ok.message)
    assert.ok(!(await kc.exists(S, 'one')))
    assert.ok(await kc.exists(S, 'two'))
    const none = await kc.del({ service: S, account: 'one' })
    assert.strictEqual(none.status, 404)
  } finally {
    for (const a of ['one', 'two']) await kc.run('security', ['delete-generic-password', '-s', S, '-a', a])
  }
})

test('handler delete demands confirm', async () => {
  await assert.rejects(srv.delete({ service: 'x-any', account: 'y' }), e => e.status === 400)
})

test('markDeleted adds a dated line to the card', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const farm = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-farm-'))
  const pages = path.join(farm, 'token.localhost', 'pages'); fs.mkdirSync(pages, { recursive: true })
  fs.writeFileSync(path.join(pages, 'x-token'), JSON.stringify({ title: 'X Token', story: [{ type: 'markdown', id: 'd', text: '# Details\n\n- **Stored as:** Keychain service `x-token`, account `a`' }], journal: [] }))
  const c = kc.markDeleted({ farmRoot: farm, service: 'x-token', date: new Date('2026-10-20T00:00:00Z') })
  assert.strictEqual(c.slug, 'x-token')
  const p = JSON.parse(fs.readFileSync(path.join(pages, 'x-token'), 'utf8'))
  assert.match(p.story[0].text, /Deleted from Keychain:\*\* 2026-10-20/)
  fs.rmSync(farm, { recursive: true })
})
