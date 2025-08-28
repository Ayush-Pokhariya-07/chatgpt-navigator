// content.js
console.log(
    "ChatGPT Navigator — content script loaded (toggle + improved styling)"
);
const LOG_PREFIX = "🔎 ChatGPT Navigator:";

/*
 Strategy:
 - Identify conversation by URL pathname (if available): use as convKey.
 - Compute a signature for each user message:
    1) Prefer existing stable attribute (if present)
    2) Otherwise compute a lightweight hash of the trimmed text
 - Maintain a Map convSeen: convKey -> Set(signatures)
 - When opening sidebar: do a full rebuild for current conv (clear DOM, show unique messages in order)
 - When observer sees new nodes: append only messages whose signature is not in convSeen[convKey]
*/

// Per-conversation seen signatures
const convSeen = new Map();

// simple string hash -> hex (djb2 variant, stable and fast)
function strHashHex(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = (h * 33) ^ str.charCodeAt(i);
    }
    // convert to unsigned and hex
    return (h >>> 0).toString(16);
}

function getConversationKey() {
    // Try to extract a stable chat id from the URL path (/chat/<id>)
    try {
        const p = location.pathname || "";
        const parts = p.split("/").filter(Boolean);
        // if URL path contains an id-like segment after "chat", use that
        const chatIdx = parts.indexOf("chat");
        if (chatIdx >= 0 && parts.length > chatIdx + 1) {
            return parts[chatIdx + 1];
        }
        // otherwise fallback to the full pathname
        return p || location.href;
    } catch (e) {
        return location.href;
    }
}

function ensureConvSet(key) {
    if (!convSeen.has(key)) convSeen.set(key, new Set());
    return convSeen.get(key);
}

// Read candidate user messages from DOM and produce normalized items.
// Each item: { signature, id, text, element }
function getAllMessagesForCurrentConv() {
    // Select candidate nodes (user messages)
    let userMessages = Array.from(
        document.querySelectorAll('[data-testid="user-message"]')
    );
    if (userMessages.length === 0) {
        const fallbacks = Array.from(
            document.querySelectorAll(
                'article, [role="listitem"], [role="article"], div[class*="message"], .chat-message'
            )
        );
        userMessages = fallbacks.filter(
            (el) => (el.innerText || "").trim().length > 0
        );
    }

    // Normalize into ordered list
    const convKey = getConversationKey();
    return userMessages
        .map((msg, idx) => {
            // raw text trimmed
            const raw = (msg.innerText || "").trim();
            // try to find any existing attribute that could be stable; else compute signature from text
            let signature =
                msg.getAttribute("data-nav-signature") ||
                msg.getAttribute("data-id") ||
                msg.getAttribute("id");
            if (!signature) {
                // compute signature from text — prevents streaming duplicates (same text -> same signature)
                // we include a short prefix of the text to keep it deterministic
                const short = raw.slice(0, 250); // cap length to avoid huge hashes
                signature = "s_" + strHashHex(short);
                // store it on the element so re-renders that keep the same node will preserve it
                try {
                    msg.setAttribute("data-nav-signature", signature);
                } catch (e) {}
            }

            // Ensure element has an id we can scroll to
            if (!msg.id) {
                try {
                    msg.id = `cgpn-${convKey}-${signature}`;
                } catch (e) {}
            }

            return {
                signature,
                id: msg.id,
                text: raw.length > 80 ? raw.slice(0, 80) + "…" : raw,
                rawText: raw,
                element: msg,
            };
        })
        .filter((item) => item.rawText && item.signature);
}

// Append only new messages (by signature) for the current conversation
function appendNewMessagesForCurrentConv() {
    const convKey = getConversationKey();
    const seen = ensureConvSet(convKey);
    const all = getAllMessagesForCurrentConv();
    const newItems = [];
    for (const it of all) {
        if (!seen.has(it.signature)) {
            newItems.push(it);
            seen.add(it.signature);
        }
    }

    if (newItems.length === 0) return 0;

    // If sidebar visible, append to DOM; otherwise just mark seen.
    const sidebar = document.getElementById("chatgpt-navigator");
    if (sidebar && sidebar.style.display === "block") {
        updateSidebar(newItems, { append: true });
        console.log(
            `${LOG_PREFIX} appended ${newItems.length} new item(s) for conv ${convKey}`
        );
    } else {
        console.log(
            `${LOG_PREFIX} detected ${newItems.length} new message(s) for conv ${convKey} (sidebar hidden).`
        );
    }
    return newItems.length;
}

// Full ordered unique list for current conversation (used when opening)
function getUniqueOrderedForCurrentConv() {
    const convKey = getConversationKey();
    const seen = ensureConvSet(convKey);
    const all = getAllMessagesForCurrentConv();
    const uniq = [];
    for (const it of all) {
        if (!seen.has(it.signature)) {
            // not seen before, add and mark
            uniq.push(it);
            seen.add(it.signature);
        } else {
            // already seen — but might not be in order for first rebuild; ensure we still include
            // we also want to include earlier seen items in the full rebuild so the user sees all messages.
            // Therefore, we will collect all unique signatures in-order:
            // We'll handle by building an ordered map below.
        }
    }

    // To produce a full ordered unique list (including previously seen signatures) we do:
    const orderedMap = new Map();
    for (const it of getAllMessagesForCurrentConv()) {
        if (!orderedMap.has(it.signature)) orderedMap.set(it.signature, it);
    }
    // mark all as seen
    for (const key of orderedMap.keys()) ensureConvSet(convKey).add(key);

    return Array.from(orderedMap.values());
}

/* ---------- UI creation / update ---------- */

function ensureToggleButton() {
    let btn = document.getElementById("cgpn-toggle");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = "cgpn-toggle";
    btn.setAttribute("aria-label", "Open ChatGPT Navigator");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"></path>
    </svg>
  `;
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
    if (!sidebar) {
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

        // close button
        sidebar
            .querySelector("#chatgpt-navigator-close")
            .addEventListener("click", (ev) => {
                ev.stopPropagation();
                toggleSidebar(false);
            });

        // prevent clicks inside sidebar from bubbling to the document click handler
        sidebar.addEventListener("click", (ev) => ev.stopPropagation());
    }
    return sidebar;
}

/**
 * updateSidebar(items, { append: boolean })
 * - if append === true -> append items to existing list (used for incremental updates)
 * - if append === false -> clear and populate full list (used for full rebuild)
 */
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

    items.forEach((q) => {
        // Avoid duplicate sidebar items by checking an item id
        const itemDomId = "cgpn-item-" + q.signature;
        if (document.getElementById(itemDomId)) return;

        const item = document.createElement("div");
        item.className = "nav-item";
        item.id = itemDomId;
        item.setAttribute("role", "listitem");
        item.textContent = q.text || `Question`;
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
                        `${LOG_PREFIX} target element not found for signature ${q.signature}`
                    );
                }
            } catch (err) {
                console.error(`${LOG_PREFIX} scroll error`, err);
            }
        });
        item.addEventListener("mouseenter", () =>
            item.classList.add("nav-item-hover")
        );
        item.addEventListener("mouseleave", () =>
            item.classList.remove("nav-item-hover")
        );
        list.appendChild(item);
    });
}

function addStyles() {
    if (document.getElementById("chatgpt-navigator-style")) return;
    const s = document.createElement("style");
    s.id = "chatgpt-navigator-style";
    s.textContent = `
    /* Toggle button (small logo) */
    #cgpn-toggle {
      position: fixed;
      top: 14px;
      right: 14px;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #0f1724;
      color: #ffffff;
      border: none;
      box-shadow: 0 6px 18px rgba(2,6,23,0.35);
      z-index: 2147483646;
      cursor: pointer;
      transition: transform 0.12s ease, background 0.12s ease;
    }
    #cgpn-toggle:hover { transform: translateY(-2px); background: #0b1220; }
    #cgpn-toggle svg { display:block; }

    /* Sidebar (hidden by default) */
    #chatgpt-navigator {
      position: fixed;
      top: 64px;
      right: 14px;
      width: 340px;
      max-height: 78vh;
      overflow-y: auto;
      background: #ffffff;
      color: #111214;
      border: 1px solid rgba(15, 23, 36, 0.08);
      border-radius: 12px;
      padding: 6px;
      z-index: 2147483646;
      box-shadow: 0 10px 30px rgba(2,6,23,0.18);
      transform-origin: top right;
      transition: opacity 0.16s ease, transform 0.16s ease;
      opacity: 1;
      display: none; /* start hidden */
    }

    #chatgpt-navigator-header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(15,23,36,0.03);
    }
    #chatgpt-navigator-title{
      font-weight:600;
      font-size:14px;
      color:#0b1220;
    }
    #chatgpt-navigator-close{
      background:transparent;
      border:none;
      font-size:14px;
      cursor:pointer;
      color:#091021;
    }
    #chatgpt-navigator-list { padding:6px; }
    .nav-item{
      padding:10px;
      margin-bottom:6px;
      border-radius:8px;
      background: transparent;
      color: #0b1220; /* dark text for readability */
      cursor: pointer;
      font-size:13px;
      line-height:1.3;
      box-sizing: border-box;
      overflow-wrap: break-word;
    }
    .nav-item:hover, .nav-item-hover {
      background: rgba(2,6,23,0.06);
    }
    .nav-empty {
      color: #6b7280;
      padding: 8px;
      text-align: center;
      font-size: 13px;
    }
    #chatgpt-navigator-footer {
      text-align:center;
      font-size:11px;
      color:#6b7280;
      padding:6px;
      border-top: 1px solid rgba(15,23,36,0.03);
    }

    @media (max-width: 900px) {
      #chatgpt-navigator { width: 86vw; right: 7vw; }
      #cgpn-toggle { right: 6px; top: 8px; }
    }
  `;
    document.head.appendChild(s);
}

function toggleSidebar(show) {
    const btn = ensureToggleButton();
    const sidebar = ensureSidebar();
    addStyles();
    if (show) {
        sidebar.style.display = "block";
        btn.setAttribute("aria-expanded", "true");
        // Full rebuild (show everything) when opening
        const allOrdered = getUniqueOrderedForCurrentConv();
        updateSidebar(allOrdered, { append: false });
        console.log(
            `${LOG_PREFIX} opened sidebar with ${allOrdered.length} items (full rebuild).`
        );
    } else {
        sidebar.style.display = "none";
        btn.setAttribute("aria-expanded", "false");
    }
}

// initial silent scan for current conversation: mark as seen (so sidebar doesn't show older messages until open)
function initialSilentMark() {
    const convKey = getConversationKey();
    const seen = ensureConvSet(convKey);
    const all = getAllMessagesForCurrentConv();
    all.forEach((m) => seen.add(m.signature));
    console.log(
        `${LOG_PREFIX} initial silent scan for conv ${convKey}: ${all.length} messages marked.`
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

            // Click outside (close when clicking conversation)
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

            // Escape key closes
            document.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") toggleSidebar(false);
            });

            // initial silent mark for current conversation
            initialSilentMark();

            // Observe chat changes and append only new unique messages (debounced)
            const observer = new MutationObserver(() => {
                if (observer._timeout) clearTimeout(observer._timeout);
                observer._timeout = setTimeout(() => {
                    try {
                        appendNewMessagesForCurrentConv();
                    } catch (err) {
                        console.error(
                            `${LOG_PREFIX} observer handler error`,
                            err
                        );
                    }
                }, 250);
            });
            observer.observe(chatRoot, { childList: true, subtree: true });

            // Detect conversation (URL) changes: if user switches chat, reset any UI and ensure marking for new conv
            let lastConv = getConversationKey();
            setInterval(() => {
                const cur = getConversationKey();
                if (cur !== lastConv) {
                    console.log(
                        `${LOG_PREFIX} conversation changed from ${lastConv} -> ${cur}`
                    );
                    lastConv = cur;
                    // ensure set exists and mark existing messages as seen (silent)
                    initialSilentMark();
                    // clear sidebar DOM (so opening will rebuild for the new chat)
                    const sidebar =
                        document.getElementById("chatgpt-navigator");
                    if (sidebar) {
                        sidebar.querySelector(
                            "#chatgpt-navigator-list"
                        ).innerHTML = "";
                    }
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
