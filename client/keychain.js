(()=>{var s=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");var N="anarchive",O=`
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
`,K=()=>{if(typeof document>"u"||document.getElementById("wiki-plugin-keychain-style"))return;let e=document.createElement("style");e.id="wiki-plugin-keychain-style",e.textContent=O,document.head.appendChild(e)},R=e=>{let d=(e||"").split(/\r?\n/),n=(d[0]||"").trim().match(/^(KEYCHAIN|SAVE|LIST):?\s*(.*)$/),r=n?n[1]:"KEYCHAIN",v=n?[n[2],...d.slice(1)]:d;return{command:r,note:v.join(`
`).trim()}},A=e=>{let d=new URLSearchParams(String(e||"").replace(/^#/,"")),c={};for(let n of["service","account","label"])d.get(n)&&(c[n]=d.get(n).slice(0,120));return c},D=()=>`
  <form class="kc-save">
    <h4>Save the clipboard to the Keychain</h4>
    <label>Service</label><input type="text" name="service" placeholder="provider-purpose-token" autocomplete="off" spellcheck="false">
    <label>Account</label><input type="text" name="account" value="${N}" autocomplete="off" spellcheck="false">
    <label>Label (optional, what Keychain Access shows)</label><input type="text" name="label" autocomplete="off">
    <label class="kc-check"><input type="checkbox" name="clear" checked> Clear the clipboard after saving</label>
    <button type="submit">Save clipboard to Keychain</button>
    <div class="kc-result" hidden></div>
  </form>`,j=()=>`
  <div class="kc-list">
    <h4>In the login Keychain</h4>
    <div class="kc-bar"><input type="search" placeholder="Search names\u2026" spellcheck="false"><button class="kc-refresh" type="button">Refresh</button></div>
    <div class="kc-count"></div>
    <div class="kc-rows"></div>
    <div class="kc-result" hidden></div>
  </div>`,H=(e,d)=>{K();let{command:c,note:n}=R(d.text);e.html(`
    <div class="kc-item" data-mode="${c}">
      ${n?`<p class="kc-note">${s(n)}</p>`:""}
      <p class="kc-who">Checking\u2026</p>
      ${c!=="LIST"?D():""}
      ${c!=="SAVE"?j():""}
    </div>`)},m=(e,d,c)=>{e.className=`kc-result ${d}`,e.innerHTML=c,e.hidden=!1},F="/system/api/keychain",T=()=>typeof window<"u"&&window.isOwner===!0,E=async(e,d)=>{let c=await fetch(`${F}/${e}.json`,d?{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}:{credentials:"same-origin",cache:"no-store"}),n={};try{n=await c.json()}catch{n={}}if(c.ok)return{ok:!0,...n};if(c.status===403&&/rights|owner/i.test(n.error||""))return{ok:!1,status:403,message:"Log in as the owner of this wiki (the key at the bottom of the page) to do that."};let r=n.error||n.message||(c.status===404?"This wiki has no Password Tool behind it (the Keychain plugin is not installed on its farm).":`The server answered ${c.status}.`);return{ok:!1,status:c.status,message:r}},_=(e,d)=>{let c=e.known?(e.known.page?`<a class="kc-badge" href="${s(e.known.page)}" target="_blank" title="${s(e.known.title||"")}">registry</a>`:"")+(e.known.vault?`<span class="kc-badge" title="Terminal vault entry">vault: ${s(e.known.vault)}</span>`:""):"",n=[e.account&&`account ${e.account}`,e.label&&e.label!==e.service&&`label ${e.label}`,e.modified&&e.modified.slice(0,10)].filter(Boolean);return`<div class="kc-row" data-n="${d}">
    <div class="kc-name"><span class="kc-svc" title="Fill the save form with this name (to replace the value)">${s(e.service)}</span>${c}
      <div class="kc-meta">${s(n.join(" \xB7 "))}</div></div>
    <div class="kc-actions"><button type="button" data-act="delete" class="kc-del">Delete</button><button type="button" data-act="reveal">Reveal</button><button type="button" data-act="copy">Copy</button></div>
  </div>`},M=async(e,d)=>{let c=e.find(".kc-item")[0];if(!c)return;let n=e.find(".kc-who")[0],r=e.find("form.kc-save")[0],v=e.find(".kc-list")[0],z=l=>{n.textContent=l,c.querySelectorAll("input, button").forEach(y=>{y.disabled=!0})},L=await E("list").catch(()=>({ok:!1,message:"The wiki server did not answer."}));if(!L.ok)return z(L.message);let q=T();n.textContent=q?`Ready \u2014 this Mac's login Keychain, through ${location.hostname}.`:"Names only: log in as the owner of this wiki (the key at the bottom of the page) to save, copy or reveal.",!q&&r&&r.querySelectorAll("input, button").forEach(l=>{l.disabled=!0});let w=[],C=async()=>{};if(r){let l=r.querySelector(".kc-result"),y=r.querySelector("button[type=submit]"),$=x=>{for(let[b,S]of Object.entries(x))r.elements[b]&&(r.elements[b].value=S)};$(A(location.hash)),window.addEventListener("hashchange",()=>$(A(location.hash)));let k=async x=>{let b=new FormData(r),S={service:String(b.get("service")||"").trim(),account:String(b.get("account")||"").trim(),label:String(b.get("label")||"").trim(),clear:!!b.get("clear"),overwrite:x};if(!S.service)return m(l,"bad","Give the entry a service name.");y.disabled=!0,m(l,"off","Reading the clipboard on this Mac\u2026");try{let a=await E("save",S);if(a.status===409){m(l,"bad",`${s(a.message)} <button type="button" class="kc-replace">Replace it</button>`),l.querySelector(".kc-replace").addEventListener("click",()=>k(!0));return}let t=s(a.message);a.ok&&a.card&&(t+=` ${a.card.existed?"Its page":"New registry card"}: <a href="${s(a.card.url)}" target="_blank">${s(a.card.title)}</a>${a.card.existed?"":" \u2014 fill in what it is for"}.`),m(l,a.ok?"ok":"bad",t),a.ok&&(r.elements.label.value="",C())}catch{m(l,"bad","The wiki server did not answer. Nothing was saved.")}finally{y.disabled=!1}};r.addEventListener("submit",x=>{x.preventDefault(),k(!1)})}if(v){let l=v.querySelector(".kc-rows"),y=v.querySelector(".kc-count"),$=v.querySelector("input[type=search]"),k=v.querySelector(".kc-result"),x=null,b=()=>{let t=$.value.trim().toLowerCase(),f=i=>!t||[i.service,i.account,i.label,i.known&&i.known.vault].some(g=>(g||"").toLowerCase().includes(t)),o=w.map((i,g)=>[i,g]).filter(([i])=>f(i)),h=o.filter(([i])=>i.known),u=o.filter(([i])=>!i.known);y.textContent=t?`${o.length} of ${w.length} match`:`${w.length} entries \u2014 ${h.length} documented`;let p=i=>i.map(([g,I])=>_(g,I)).join("");l.innerHTML=t?p(h)+p(u):p(h)+(u.length?`<details><summary>Other entries (${u.length}) \u2014 apps, Wi-Fi, browsers, undocumented</summary>${p(u)}</details>`:"")};C=async()=>{y.textContent="Listing\u2026";try{let t=await E("list");if(!t.ok)return y.textContent="",m(k,"bad",s(t.message));w=t.items,b(),T()||l.querySelectorAll("button").forEach(f=>{f.disabled=!0})}catch{y.textContent="",m(k,"bad","The list did not load.")}};let S=t=>{let f=t&&t.querySelector(".kc-secret");f&&(f.textContent="",f.remove());let o=t&&t.querySelector("[data-act=reveal]");o&&(o.textContent="Reveal")},a=()=>{clearInterval(x),x=null,l.querySelectorAll(".kc-row").forEach(S)};$.addEventListener("input",()=>{a(),b(),T()||l.querySelectorAll("button").forEach(t=>{t.disabled=!0})}),v.querySelector(".kc-refresh").addEventListener("click",()=>{a(),C()}),l.addEventListener("click",async t=>{let f=t.target.closest(".kc-row");if(!f)return;let o=w[Number(f.dataset.n)];if(t.target.classList.contains("kc-svc")&&r){r.elements.service.value=o.service,r.elements.account.value=o.account,r.elements.label.value=o.label&&o.label!==o.service?o.label:"",r.scrollIntoView({block:"nearest"});return}let h=t.target.dataset&&t.target.dataset.act;if(!h)return;let u=t.target;if(h==="reveal"&&f.querySelector(".kc-secret"))return a();if(h==="delete"&&!u.classList.contains("kc-armed")){u.classList.add("kc-armed"),u.textContent="Confirm",m(k,"bad",`Delete ${s(o.service)}${o.account?` / ${s(o.account)}`:""} from the Keychain? This cannot be undone \u2014 press Confirm.`),setTimeout(()=>{u.isConnected&&(u.classList.remove("kc-armed"),u.textContent="Delete")},5e3);return}u.disabled=!0,m(k,"off",h==="copy"?`Copying ${s(o.service)}\u2026 (macOS may ask you to allow access)`:`Fetching ${s(o.service)}\u2026 (macOS may ask you to allow access)`);try{let p=await E(h,h==="delete"?{service:o.service,account:o.account,confirm:o.service}:{service:o.service,account:o.account});if(!p.ok)return m(k,"bad",s(p.message));if(h==="copy")return m(k,"ok",s(p.message));if(h==="delete")return m(k,"ok",s(p.message)+(p.card?` Its card <a href="${s(p.card.url)}" target="_blank">${s(p.card.title)}</a> now says so.`:"")),C();a(),k.hidden=!0;let i=document.createElement("code");i.className="kc-secret",i.textContent=p.value,f.querySelector(".kc-name").appendChild(i);let g=15;u.textContent=`Hide ${g}`,x=setInterval(()=>{if(g-=1,g<=0)return a();u.textContent=`Hide ${g}`},1e3)}catch{m(k,"bad","The wiki server did not answer.")}finally{u.disabled=!1}}),document.addEventListener("visibilitychange",()=>{document.hidden&&a()}),window.addEventListener("pagehide",a),w=L.items,b(),q||l.querySelectorAll("button").forEach(t=>{t.disabled=!0})}};typeof window<"u"&&(window.plugins=window.plugins||{},window.plugins.keychain={emit:H,bind:M});})();
//# sourceMappingURL=keychain.js.map
