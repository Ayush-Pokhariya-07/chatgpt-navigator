function createSidebar(questions) {
    let sidebar = document.createElement("div");
    sidebar.id = "chatgpt-navigator";
    sidebar.innerHTML = `<h2>Questions</h2>`;

    questions.forEach((q, i) => {
        let item = document.createElement("div");
        item.className = "nav-item";
        item.textContent = q.text;
        item.addEventListener("click", () => {
            q.element.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        sidebar.appendChild(item);
    });

    document.body.appendChild(sidebar);
}

function scanChat() {
    let userMessages = document.querySelectorAll('div[class*="user"]');
    let questions = [];

    userMessages.forEach((msg) => {
        let text = msg.innerText.trim();
        if (text) {
            questions.push({
                text: text.length > 50 ? text.slice(0, 50) + "..." : text,
                element: msg,
            });
        }
    });

    return questions;
}

setTimeout(() => {
    let questions = scanChat();
    if (questions.length) createSidebar(questions);
}, 2000);
