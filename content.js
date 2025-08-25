// content.js
console.log(
    "ChatGPT Navigator — content script loaded (toggle + improved styling)"
);

const LOG_PREFIX = "🔎 ChatGPT Navigator:";

function scanChat() {
    let userMessages = Array.from(
        document.querySelectorAll('[data-testid="user-message"]')
    );
    if (userMessages.length === 0) {
        const fallbacks = Array.from(
            document.querySelectorAll(
                'article, [role="listitem"], [role="article"], div[class*="message"], .chat-message'
            )
        );
        console.log(
            `${LOG_PREFIX} primary selector found 0. fallback candidate count: ${fallbacks.length}`
        );
        userMessages = fallbacks.filter(
            (el) => (el.innerText || "").trim().length > 0
        );
    } else {
        console.log(
            `${LOG_PREFIX} found ${userMessages.length} user-message nodes (primary).`
        );
    }

    return userMessages.map((msg) => {
        const raw = (msg.innerText || "").trim();
        return {
            text: raw.length > 60 ? raw.slice(0, 60) + "…" : raw,
            element: msg,
        };
    });
}

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

function updateSidebar(questions) {
    const sidebar = ensureSidebar();
    const list = sidebar.querySelector("#chatgpt-navigator-list");
    list.innerHTML = "";

    if (questions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "nav-empty";
        empty.textContent = "No user messages found yet.";
        list.appendChild(empty);
        return;
    }

    questions.forEach((q, i) => {
        const item = document.createElement("div");
        item.className = "nav-item";
        item.setAttribute("role", "listitem");
        item.textContent = q.text || `Question ${i + 1}`;
        item.addEventListener("click", (ev) => {
            ev.stopPropagation();
            try {
                q.element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
                // highlight target briefly
                const prev = q.element.style.boxShadow;
                q.element.style.transition = "box-shadow 0.3s";
                q.element.style.boxShadow = "0 0 0 4px rgba(255,200,0,0.6)";
                setTimeout(() => (q.element.style.boxShadow = prev || ""), 900);
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

    /* small adjustments for narrow screens */
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
        rebuildSidebar(); // refresh content when opening
    } else {
        sidebar.style.display = "none";
        btn.setAttribute("aria-expanded", "false");
    }
}

function rebuildSidebar() {
    try {
        addStyles();
        const qs = scanChat();
        updateSidebar(qs);
        console.log(`${LOG_PREFIX} rebuilt sidebar with ${qs.length} items.`);
    } catch (e) {
        console.error(`${LOG_PREFIX} rebuild error`, e);
    }
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
                // If click is inside sidebar or on the toggle button, ignore
                if (
                    target.closest("#chatgpt-navigator") ||
                    target.closest("#cgpn-toggle")
                )
                    return;
                // otherwise, close
                toggleSidebar(false);
            });

            // Escape key closes
            document.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") toggleSidebar(false);
            });

            // initial build but keep collapsed
            rebuildSidebar();

            // observe changes to the chat and refresh silently (no auto-open)
            const observer = new MutationObserver(() => {
                // debounce
                if (observer._timeout) clearTimeout(observer._timeout);
                observer._timeout = setTimeout(() => {
                    rebuildSidebar();
                }, 300);
            });
            observer.observe(chatRoot, { childList: true, subtree: true });
        } else if (attempts > 40) {
            clearInterval(interval);
            console.warn(`${LOG_PREFIX} couldn't find chat root after ~10s.`);
        }
    }, 250);
}

// Start
setupObserverAndHandlers();
