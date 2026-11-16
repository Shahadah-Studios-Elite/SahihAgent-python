const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");
const statusBadge = document.getElementById("status-badge");
const pyStatus = document.getElementById("py-status");

const apiModal = document.getElementById("api-modal");
const openSettingsBtn = document.getElementById("open-settings-btn");
const saveKeyBtn = document.getElementById("save-key-btn");
const clearKeyBtn = document.getElementById("clear-key-btn");
const providerSelect = document.getElementById("provider-select");
const apiKeyInput = document.getElementById("api-key-input");

let pyodide = null;
let pyVerifyClaim = null;
let chatHistory = [];

// Boot Pyodide and load sahih_engine.py
async function initPythonEngine() {
    try {
        pyodide = await loadPyodide();
        const response = await fetch("sahih_engine.py");
        const pythonCode = await response.text();
        await pyodide.runPythonAsync(pythonCode);
        pyVerifyClaim = pyodide.globals.get("verify_claim");

        pyStatus.textContent = "Python WebAssembly Engine Ready";
        updateUIState();
    } catch (err) {
        pyStatus.textContent = "Failed to load Python engine.";
        console.error(err);
    }
}

function updateUIState() {
    const savedKey = localStorage.getItem("sahih_api_key");
    const savedProvider = localStorage.getItem("sahih_provider") || "gemini";
    providerSelect.value = savedProvider;

    if (!pyVerifyClaim) {
        userInput.disabled = true;
        sendBtn.disabled = true;
        userInput.placeholder = "Loading Python engine...";
        return;
    }

    if (savedKey) {
        apiKeyInput.value = savedKey;
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.placeholder = "Paste a quote, Hadith, or question to verify...";
        statusBadge.textContent = savedProvider === "gemini" ? "Gemini Active" : "OpenAI Active";
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
    updateUIState();
});

clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem("sahih_api_key");
    apiKeyInput.value = "";
    apiModal.classList.remove("active");
    updateUIState();
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

    if (!message || !apiKey || !pyVerifyClaim) return;

    appendMessage(message, true);
    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;

    const loadingBubble = appendMessage("Running Python verification...", false);

    try {
        // Call the Python function directly in the browser
        const reply = await pyVerifyClaim(provider, apiKey, message, JSON.stringify(chatHistory));
        loadingBubble.textContent = reply;

        chatHistory.push({ role: "user", text: message });
        chatHistory.push({ role: "model", text: reply });
    } catch (error) {
        loadingBubble.textContent = `Error: ${error.message}`;
    } finally {
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
});

initPythonEngine();
