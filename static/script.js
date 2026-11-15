const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");
const statusBadge = document.getElementById("status-badge");

const apiModal = document.getElementById("api-modal");
const openSettingsBtn = document.getElementById("open-settings-btn");
const saveKeyBtn = document.getElementById("save-key-btn");
const clearKeyBtn = document.getElementById("clear-key-btn");
const providerSelect = document.getElementById("provider-select");
const apiKeyInput = document.getElementById("api-key-input");

let chatHistory = [];

function checkCredentials() {
    const savedKey = localStorage.getItem("sahih_api_key");
    const savedProvider = localStorage.getItem("sahih_provider") || "gemini";

    providerSelect.value = savedProvider;

    if (savedKey) {
        apiKeyInput.value = savedKey;
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.placeholder = "Paste a quote, Hadith, or question to verify...";
        const labels = { gemini: "Gemini Active", openai: "OpenAI Active", claude: "Claude Active" };
        statusBadge.textContent = labels[savedProvider] || "Active";
        statusBadge.className = "status-badge configured";
    } else {
        userInput.disabled = true;
        sendBtn.disabled = true;
        userInput.placeholder = "Click '🔑 API Key' above to activate SahihAgent...";
        statusBadge.textContent = "No Key Set";
        statusBadge.className = "status-badge unconfigured";
    }
}

openSettingsBtn.addEventListener("click", () => apiModal.classList.add("active"));
apiModal.addEventListener("click", (e) => {
    if (e.target === apiModal) apiModal.classList.remove("active");
});

saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect.value;
    if (!key) {
        alert("Please paste a valid API key.");
        return;
    }
    localStorage.setItem("sahih_api_key", key);
    localStorage.setItem("sahih_provider", provider);
    apiModal.classList.remove("active");
    checkCredentials();
});

clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem("sahih_api_key");
    apiKeyInput.value = "";
    apiModal.classList.remove("active");
    checkCredentials();
});

function appendMessage(text, isUser) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;

    msgDiv.appendChild(bubble);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;
}

function sendQuickPrompt(text) {
    if (!localStorage.getItem("sahih_api_key")) {
        apiModal.classList.add("active");
        return;
    }
    userInput.value = text;
    chatForm.dispatchEvent(new Event("submit"));
}

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    const apiKey = localStorage.getItem("sahih_api_key");
    const provider = localStorage.getItem("sahih_provider") || "gemini";

    if (!message || !apiKey) return;

    appendMessage(message, true);
    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;

    const loadingBubble = appendMessage("Verifying sources via Python engine...", false);

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey
            },
            body: JSON.stringify({
                provider: provider,
                message: message,
                history: chatHistory
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "Verification failed");
        }

        loadingBubble.textContent = data.reply;
        chatHistory.push({ role: "user", text: message });
        chatHistory.push({ role: "model", text: data.reply });
    } catch (error) {
        loadingBubble.textContent = `Error: ${error.message}`;
    } finally {
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
});

checkCredentials();
