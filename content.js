// content.js
console.log("ChatGPT Navigator — content script loaded");

const LOG_PREFIX = "🔎 ChatGPT Navigator:";

function scanChat() {
    // Primary (recommended) selector
    let userMessages = Array.from(
        document.querySelectorAll('[data-testid="user-message"]')
    );
    if (userMessages.length === 0) {
        // Broad fallback selectors (for resilience) — we'll log counts so you can see what's found
        const fallbacks = Array.from(
            document.querySelectorAll(
                'article, [role="listitem"], .message, .chat-message'
            )
        );
        console.log(
            `${LOG_PREFIX} primary selector found 0. fallback candidate count: ${fallbacks.length}`
        );
        // Use fallback candidates that have non-empty text
        userMessages = fallbacks.filter(
            (el) => (el.innerText || "").trim().length > 0
        );
    } else {
        console.log(
            `${LOG_PREFIX} found ${userMessages.length} user-message nodes (primary).`
        );
    }

    const questions = userMessages.map((msg) => {
        const raw = (msg.innerText || "").trim();
        return {
            text: raw.length > 60 ? raw.slice(0, 60) + "…" : raw,
            element: msg,
        };
    });

    return questions;
}

function ensureSidebar() {
    let sidebar = document.getElementById("chatgpt-navigator");
    if (!sidebar) {
        sidebar = document.createElement("div");
        sidebar.id = "chatgpt-navigator";
        sidebar.innerHTML = `
      <h2>Questions</h2>
      <div id="chatgpt-navigator-list"></div>
      <div style="text-align:center; font-size:11px; color:#666; margin-top:6px;">ChatGPT Navigator</div>
    `;
        document.body.appendChild(sidebar);
    }
    return sidebar;
}

function updateSidebar(questions) {
    const sidebar = ensureSidebar();
    const list = sidebar.querySelector("#chatgpt-navigator-list");
    if (!list) return;
    // Clear old items
    list.innerHTML = "";
    questions.forEach((q, i) => {
        const item = document.createElement("div");
        item.className = "nav-item";
        item.textContent = q.text || `Question ${i + 1}`;
        item.style.cursor = "pointer";
        item.style.padding = "8px";
        item.style.borderBottom = "1px solid #eee";
        item.addEventListener("click", () => {
            try {
                q.element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
                // brief highlight
                const orig = q.element.style.boxShadow;
                q.element.style.transition = "box-shadow 0.3s";
                q.element.style.boxShadow = "0 0 0 3px rgba(255,200,0,0.6)";
                setTimeout(() => (q.element.style.boxShadow = orig || ""), 900);
            } catch (e) {
                console.error(`${LOG_PREFIX} scroll error`, e);
            }
        });
        item.addEventListener(
            "mouseenter",
            () => (item.style.background = "#f5f5f5")
        );
        item.addEventListener("mouseleave", () => (item.style.background = ""));
        list.appendChild(item);
    });
}

function addStyles() {
    if (document.getElementById("chatgpt-navigator-style")) return;
    const s = document.createElement("style");
    s.id = "chatgpt-navigator-style";
    s.textContent = `
    #chatgpt-navigator {
      position: fixed;
      top: 72px;
      right: 12px;
      width: 300px;
      max-height: 78vh;
      overflow-y: auto;
      background: #fff;
      border: 1px solid rgba(0,0,0,0.09);
      border-radius: 10px;
      padding: 8px;
      z-index: 2147483647;
      font-family: Inter, Arial, sans-serif;
      box-shadow: 0 6px 20px rgba(0,0,0,0.08);
    }
    #chatgpt-navigator h2{
      margin:0 0 8px 0;
      text-align:center;
      font-size:14px;
    }
  `;
    document.head.appendChild(s);
}

function rebuildSidebar() {
    try {
        addStyles();
        const questions = scanChat();
        if (questions.length > 0) {
            updateSidebar(questions);
            console.log(
                `${LOG_PREFIX} sidebar updated with ${questions.length} items.`
            );
        } else {
            console.log(`${LOG_PREFIX} no user messages found (yet).`);
            // still ensure sidebar exists (so user sees empty list)
            ensureSidebar();
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} rebuild error`, e);
    }
}

function setupObserver() {
    // wait for main chat area to exist
    let attempts = 0;
    const interval = setInterval(() => {
        const chatRoot =
            document.querySelector("main") ||
            document.querySelector('[role="main"]') ||
            document.querySelector('div[class*="chat"]');
        attempts++;
        if (chatRoot) {
            clearInterval(interval);
            console.log(`${LOG_PREFIX} found chat root — starting observer`);
            // initial build
            rebuildSidebar();
            const observer = new MutationObserver((mutations) => {
                // small debounce to avoid thrash
                if (observer._timeout) clearTimeout(observer._timeout);
                observer._timeout = setTimeout(() => {
                    rebuildSidebar();
                }, 250);
            });
            observer.observe(chatRoot, { childList: true, subtree: true });
        } else if (attempts > 40) {
            // ~10s
            clearInterval(interval);
            console.warn(
                `${LOG_PREFIX} couldn't find chat root after waiting — page structure might be different.`
            );
        }
    }, 250);
}

// Start
setupObserver();
