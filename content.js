// content.js
console.log(
    "ChatGPT Navigator — content script loaded (toggle + improved styling)"
);
const LOG_PREFIX = "🔎 ChatGPT Navigator:";

/*
  Improvements:
  - Only collect elements matching [data-testid="user-message"] (no broad fallbacks)
  - Normalize text before hashing to avoid duplicates from streaming/truncated variants
  - Clear sidebar DOM on close so reopen is always a clean rebuild
  - Keep per-conversation seen sets to avoid cross-chat leakage
*/

const convSeen = new Map();

// lightweight djb2-like hash -> hex
function strHashHex(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
}

function getConversationKey() {
    try {
        const p = location.pathname || "";
        const parts = p.split("/").filter(Boolean);
        const chatIdx = parts.indexOf("chat");
        if (chatIdx >= 0 && parts.length > chatIdx + 1)
            return parts[chatIdx + 1];
        // fallback to origin+pathname (still OK)
        return location.origin + p;
    } catch {
        return location.href;
    }
}
function ensureConvSet(key) {
    if (!convSeen.has(key)) convSeen.set(key, new Set());
    return convSeen.get(key);
}

// Normalize text: trim, collapse whitespace, remove repeated whitespace, lower-case
function normalizeText(s) {
    if (!s) return "";
    // collapse whitespace and trim
    const collapsed = s.replace(/\s+/g, " ").trim();
    // optionally lowercase
    return collapsed.toLowerCase();
}

// Use only the user-message nodes (stable selector)
function getAllUserMessageNodes() {
    return Array.from(
        document.querySelectorAll('[data-testid="user-message"]')
    );
}

// Build normalized message items for current conversation
function getAllMessagesForCurrentConv() {
    const convKey = getConversationKey();
    const nodes = getAllUserMessageNodes();
    const items = [];

    nodes.forEach((node, idx) => {
        const raw = (node.innerText || "").trim();
        if (!raw) return;

        const norm = normalizeText(raw).slice(0, 400); // cap length
        // signature based on normalized text (stable across re-renders)
        let signature = node.getAttribute("data-nav-signature");
        if (!signature) {
            signature = "s_" + strHashHex(norm);
            try {
                node.setAttribute("data-nav-signature", signature);
            } catch (e) {}
        }

        // ensure an id for scroll target
        if (!node.id) {
            try {
                node.id = `cgpn-${convKey}-${signature}`;
            } catch (e) {}
        }

        items.push({
            signature,
            id: node.id,
            text: raw.length > 80 ? raw.slice(0, 80) + "…" : raw,
            norm,
            rawText: raw,
            element: node,
        });
    });

    return items;
}

// Merge near-duplicates: if two normalized texts are prefix-equal, keep first
function uniqueOrdered(items) {
    const ordered = [];
    const seenNorms = new Set();
    for (const it of items) {
        // reduce norm to shorter key (first 200 chars) for matching
        const key = it.norm.slice(0, 200);
        // check whether any existing seenNorms is a prefix of key or vice versa
        let duplicate = false;
        for (const s of seenNorms) {
            if (s === key || s.startsWith(key) || key.startsWith(s)) {
                duplicate = true;
                break;
            }
        }
        if (!duplicate) {
            ordered.push(it);
            seenNorms.add(key);
        }
    }
    return ordered;
}

/* ---------- UI helpers ---------- */

function ensureToggleButton() {
    let btn = document.getElementById("cgpn-toggle");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = "cgpn-toggle";
    btn.setAttribute("aria-label", "Open ChatGPT Navigator");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"></path></svg>`;
    document.body.appendChild(btn);
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = btn.getAttribute("aria-expanded") === "true";
        toggleSidebar(!expanded);
    });
    return btn;
}

function ensureSidebar() {
    let sidebar = document.getElementById("chatgpt-navigator");
    if (sidebar) return sidebar;
    sidebar = document.createElement("aside");
    sidebar.id = "chatgpt-navigator";
    sidebar.innerHTML = `
    <div id="chatgpt-navigator-header">
      <div id="chatgpt-navigator-title">Questions</div>
      <button id="chatgpt-navigator-close" aria-label="Close navigator">✕</button>
    </div>
    <div id="chatgpt-navigator-list" role="list"></div>
    <div id="chatgpt-navigator-footer">ChatGPT Navigator</div>
  `;
    document.body.appendChild(sidebar);
    sidebar
        .querySelector("#chatgpt-navigator-close")
        .addEventListener("click", (ev) => {
            ev.stopPropagation();
            toggleSidebar(false);
        });
    sidebar.addEventListener("click", (ev) => ev.stopPropagation());
    return sidebar;
}

function addStyles() {
    if (document.getElementById("chatgpt-navigator-style")) return;
    const s = document.createElement("style");
    s.id = "chatgpt-navigator-style";
    s.textContent = `
    #cgpn-toggle { position: fixed; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 8px; display: inline-flex; align-items:center; justify-content:center; background:#0f1724; color:#fff; border:none; z-index:2147483646; cursor:pointer; box-shadow: 0 6px 18px rgba(2,6,23,0.35); }
    #cgpn-toggle:hover { transform: translateY(-2px); background:#0b1220; }
    #chatgpt-navigator { position: fixed; top:64px; right:14px; width:340px; max-height:78vh; overflow-y:auto; background:#fff; color:#111214; border:1px solid rgba(15,23,36,0.08); border-radius:12px; padding:6px; z-index:2147483646; box-shadow:0 10px 30px rgba(2,6,23,0.18); display:none; }
    #chatgpt-navigator-header{ display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-bottom:1px solid rgba(15,23,36,0.03); }
    #chatgpt-navigator-title{ font-weight:600; font-size:14px; color:#0b1220; }
    #chatgpt-navigator-close{ background:transparent; border:none; font-size:14px; cursor:pointer; color:#091021; }
    #chatgpt-navigator-list{ padding:6px; }
    .nav-item{ padding:10px; margin-bottom:6px; border-radius:8px; background:transparent; color:#0b1220; cursor:pointer; font-size:13px; line-height:1.3; overflow-wrap:break-word; }
    .nav-item:hover, .nav-item-hover { background: rgba(2,6,23,0.06); }
    .nav-empty { color:#6b7280; padding:8px; text-align:center; font-size:13px; }
    #chatgpt-navigator-footer{ text-align:center; font-size:11px; color:#6b7280; padding:6px; border-top:1px solid rgba(15,23,36,0.03); }
    @media (max-width:900px) { #chatgpt-navigator { width:86vw; right:7vw; } #cgpn-toggle { right:6px; top:8px; } }
  `;
    document.head.appendChild(s);
}

function updateSidebar(items, options = { append: false }) {
    const sidebar = ensureSidebar();
    const list = sidebar.querySelector("#chatgpt-navigator-list");
    if (!options.append) list.innerHTML = "";

    if ((!items || items.length === 0) && !options.append) {
        const empty = document.createElement("div");
        empty.className = "nav-empty";
        empty.textContent = "No user messages found yet.";
        list.appendChild(empty);
        return;
    }

    for (const q of items) {
        const itemDomId = "cgpn-item-" + q.signature;
        if (document.getElementById(itemDomId)) continue;
        const item = document.createElement("div");
        item.className = "nav-item";
        item.id = itemDomId;
        item.setAttribute("role", "listitem");
        item.textContent = q.text || "Question";
        item.addEventListener("click", (ev) => {
            ev.stopPropagation();
            try {
                const target = document.getElementById(q.id) || q.element;
                if (target) {
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                    const prev = target.style.boxShadow;
                    target.style.transition = "box-shadow 0.3s";
                    target.style.boxShadow = "0 0 0 4px rgba(255,200,0,0.6)";
                    setTimeout(
                        () => (target.style.boxShadow = prev || ""),
                        900
                    );
                } else {
                    console.warn(
                        `${LOG_PREFIX} target not found for ${q.signature}`
                    );
                }
            } catch (err) {
                console.error(`${LOG_PREFIX} click->scroll error`, err);
            }
        });
        item.addEventListener("mouseenter", () =>
            item.classList.add("nav-item-hover")
        );
        item.addEventListener("mouseleave", () =>
            item.classList.remove("nav-item-hover")
        );
        list.appendChild(item);
    }
}

function toggleSidebar(show) {
    const btn = ensureToggleButton();
    const sidebar = ensureSidebar();
    addStyles();
    if (show) {
        sidebar.style.display = "block";
        btn.setAttribute("aria-expanded", "true");
        // Full rebuild on open
        const all = getAllMessagesForCurrentConv();
        const unique = uniqueOrdered(all);
        // mark seen for current conv
        const convKey = getConversationKey();
        const seen = ensureConvSet(convKey);
        unique.forEach((it) => seen.add(it.signature));
        updateSidebar(unique, { append: false });
        console.log(
            `${LOG_PREFIX} opened sidebar with ${unique.length} items.`
        );
    } else {
        // hide and clear DOM so reopen is clean (prevents duplicate stacking)
        sidebar.style.display = "none";
        btn.setAttribute("aria-expanded", "false");
        const list = sidebar.querySelector("#chatgpt-navigator-list");
        if (list) list.innerHTML = "";
    }
}

// Append only new unique messages (called by observer)
function appendNewMessagesForCurrentConv() {
    const convKey = getConversationKey();
    const seen = ensureConvSet(convKey);
    const all = getAllMessagesForCurrentConv();
    // filter unseen by signature
    const newItems = all.filter((it) => !seen.has(it.signature));
    if (newItems.length === 0) return 0;
    // merge near-duplicates among newItems also
    const merged = uniqueOrdered(newItems);
    // mark as seen
    merged.forEach((it) => seen.add(it.signature));
    // append to DOM if visible
    const sidebar = document.getElementById("chatgpt-navigator");
    if (sidebar && sidebar.style.display === "block") {
        updateSidebar(merged, { append: true });
        console.log(`${LOG_PREFIX} appended ${merged.length} new item(s).`);
    } else {
        console.log(
            `${LOG_PREFIX} detected ${merged.length} new message(s) (sidebar hidden).`
        );
    }
    return merged.length;
}

function initialSilentMark() {
    const convKey = getConversationKey();
    const seen = ensureConvSet(convKey);
    const all = getAllMessagesForCurrentConv();
    all.forEach((m) => seen.add(m.signature));
    console.log(
        `${LOG_PREFIX} initial silent mark: ${all.length} messages marked for ${convKey}.`
    );
}

function setupObserverAndHandlers() {
    let attempts = 0;
    const interval = setInterval(() => {
        const chatRoot =
            document.querySelector("main") ||
            document.querySelector('[role="main"]') ||
            document.querySelector('div[class*="chat"]');
        attempts++;
        if (chatRoot) {
            clearInterval(interval);
            console.log(`${LOG_PREFIX} chat root found — starting observer`);
            ensureToggleButton();

            document.addEventListener("click", (ev) => {
                const sidebar = document.getElementById("chatgpt-navigator");
                const btn = document.getElementById("cgpn-toggle");
                const target = ev.target;
                if (!sidebar || !btn) return;
                if (
                    target.closest("#chatgpt-navigator") ||
                    target.closest("#cgpn-toggle")
                )
                    return;
                toggleSidebar(false);
            });

            document.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") toggleSidebar(false);
            });

            // mark existing user messages as seen so sidebar doesn't show old ones until opened
            initialSilentMark();

            // observe chat and append only new unique user messages
            const observer = new MutationObserver(() => {
                if (observer._timeout) clearTimeout(observer._timeout);
                observer._timeout = setTimeout(() => {
                    try {
                        appendNewMessagesForCurrentConv();
                    } catch (err) {
                        console.error(`${LOG_PREFIX} observer error`, err);
                    }
                }, 250);
            });
            observer.observe(chatRoot, { childList: true, subtree: true });

            // watch for conversation (URL) changes and reset seen for the new conv
            let lastConv = getConversationKey();
            setInterval(() => {
                const cur = getConversationKey();
                if (cur !== lastConv) {
                    console.log(
                        `${LOG_PREFIX} conversation changed ${lastConv} -> ${cur}`
                    );
                    lastConv = cur;
                    // ensure set exists and mark existing user messages as seen silently
                    initialSilentMark();
                    // clear any old DOM list so open will rebuild
                    const sidebar =
                        document.getElementById("chatgpt-navigator");
                    if (sidebar)
                        sidebar.querySelector(
                            "#chatgpt-navigator-list"
                        ).innerHTML = "";
                }
            }, 800);
        } else if (attempts > 40) {
            clearInterval(interval);
            console.warn(`${LOG_PREFIX} couldn't find chat root after ~10s.`);
        }
    }, 250);
}

// Start
setupObserverAndHandlers();
