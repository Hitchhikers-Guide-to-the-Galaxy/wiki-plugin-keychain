# wiki-plugin-keychain

The working part of the **Password Tool**: a Federated Wiki item that, on a Mac's own localhost wiki,

- **saves the clipboard** into the macOS login Keychain under a service/account name you type,
- **lists** the Keychain's generic passwords by name (search, documented entries first),
- **copies** a value to the clipboard (Keychain → `pbcopy`, the value never reaches the browser),
- **reveals** a value for fifteen seconds when you ask to see it,
- **deletes** one exact entry after a second click (its token.localhost card is kept, with a dated note).

The point: an AI agent can hand you a prefilled link (`/view/password-tool#service=x&account=y`), you save the key yourself, and the agent then reads it by name with `security find-generic-password -s x -a y -w` piped straight to whatever needs it. The value never enters a page, a URL, a log, or the agent's context.

## Requirements

- **macOS** — the operations shell out to `security`, `pbcopy` and `pbpaste`; on any other platform they answer "not a Mac".
- **A farm that mounts `fedwiki.api` declarations** — [wiki-plugin-farm](https://github.com/Hitchhikers-Guide-to-the-Galaxy/wiki-plugin-farm) on the node wiki server, or sweet-server natively. The plugin has no `server/` of its own.
- **Optional registry** — a `token.localhost` site in the same farm whose pages say *Stored as: Keychain service `name`, account `account`*. Entries it names are badged in the list, and a save of an unknown service writes such a page and lists it on `token-inventory` under *New Entries*. Without that site, nothing is written.
- The save form's default account is `anarchive`; change `DEFAULT_ACCOUNT` in `src/client/keychain.js`.

## Item

```
KEYCHAIN        save form + list (default)
SAVE            save form only
LIST            list only
```

## Security model

- No server of its own. Four operations are declared in `api/openapi.json` (`package.json` → `fedwiki.api`) and mounted by the farm's API door — wiki-plugin-farm on node, natively on sweet-server — under `/system/api/keychain/`.
- `list.json` (GET) returns names only (`security dump-keychain` without `-d`). It is the one operation offered to agents over the farm's MCP door.
- `save.json`, `copy.json`, `reveal.json`, `delete.json` are declared **writes**: the door refuses them unless the caller is signed in as the site owner, refuses them on any public site, and never offers them to agents.
- The handlers refuse to run unless `process.platform === 'darwin'`; `WIKI_KEYCHAIN=off` disables them. 40 actions a minute.
- Child processes are spawned with argument arrays, never a shell; errors never echo argv.
- `save` reads the clipboard **on the server** (`pbpaste`), checks it (one line, ≥ 8 chars, not a link), refuses to overwrite without a second click, and returns only a length. The value is in `security`'s argv for the moment it runs — the tool cannot read `-w` from stdin without a tty; this is the one exception the keychain-secret skill already accepts.
- `copy` returns only a length. `reveal` returns the value; the client removes it after 15 s, on hide, or when the tab is hidden.
- `delete` requires `confirm` = the service name; with no account it refuses when the service has several entries.
- Logs: `[keychain] save|copy|reveal|delete <service> / <account>: <result>` — never values.
- Entries made by other apps (Safari, Chrome, Wi-Fi) raise the macOS "security wants to access…" dialog; Deny is respected.
- Reachability is the farm's: Caddy answers `*.localhost` to loopback only, sweet-server binds 127.0.0.1, node ports are behind the LAN guard. A process already running as the user can call `security` directly — this tool is about keeping values out of pages, links, logs and agent context, not a sandbox.

## Build

```
npm install && npm run build && npm test
```

## Repositories

- GitHub — https://github.com/Hitchhikers-Guide-to-the-Galaxy/wiki-plugin-keychain
- npm — not published yet

## License

MIT
