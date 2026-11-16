const SYSTEM_PROMPT = `You are SahihAgent, the official AI verification assistant for SahihFinder (sahihfinder.com) by Shahadah Studios Elite.
Your purpose is to help Muslims verify claims, quotes, hadiths, and online information in accordance with Islamic values and rigorous scholarly standards.

Guidelines:
1. Always prioritize authenticity and primary sources (e.g., Sahih al-Bukhari, Sahih Muslim, Sunan Abu Dawud, Jami' at-Tirmidhi, Quranic verses).
2. Clearly state the grading of any Hadith you cite (e.g., Sahih, Hasan, Da'if, or Mawdu'/Fabricated).
3. If a claim circulating online is unverified or fabricated, politely refute it with clear evidence.
4. Maintain a respectful, objective, and helpful tone.
5. Do not issue personal fatwas; for complex jurisprudential (fiqh) rulings, advise consulting a qualified local scholar.`;

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

let pyVerifyClaim = null;
let pyLoadingStarted = false;
let chatHistory = [];

// Strip accidental newlines or non-ASCII characters when pasting keys
function cleanKey(raw) {
    return (raw || "").replace(/[^\x21-\x7E]/g, "").trim();
}

function updateUIState() {
    const savedKey = cleanKey(localStorage.getItem("sahih_api_key"));
    const savedProvider = localStorage.getItem("sahih_provider") || "gemini";
    providerSelect.value = savedProvider;

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

async function loadPythonInBackground() {
    if (pyLoadingStarted) return;
    pyLoadingStarted = true;
    if (pyStatus) pyStatus.textContent = "Syncing Python engine in background...";

    try {
        if (!window.loadPyodide) {
            await new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = "https://jsdelivr.net";
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        const pyodide = await loadPyodide();
        const code = await (await fetch("sahih_engine.py")).text();
        await pyodide.runPythonAsync(code);
        pyVerifyClaim = pyodide.globals.get("verify_claim");
        if (pyStatus) pyStatus.textContent = "Python WebAssembly Engine Ready";
    } catch (err) {
        console.warn("Pyodide background load skipped:", err);
        if (pyStatus) pyStatus.textContent = "Instant Verification Engine Ready";
    }
}

async function directVerify(provider, apiKey, message) {
    if (provider === "gemini") {
        const contents = chatHistory.slice(-6).map(m => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.text }]
        }));
        contents.push({ role: "user", parts: [{ text: message }] });

        const res = await fetch(
            `https://googleapis.com{encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents,
                    generationConfig: { temperature: 0.3 }
                })
            }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
        return data.candidates[0].content.parts[0].text;
    } else {
        const messages = [{ role: "system", content: SYSTEM_PROMPT }];
        chatHistory.slice(-6).forEach(m => messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
        messages.push({ role: "user", content: message });

        const res = await fetch("https://openai.com", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages,
                temperature: 0.3
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
        return data.choices[0].message.content;
    }
}

// Modal Controls
openSettingsBtn.addEventListener("click", () => apiModal.classList.add("active"));
apiModal.addEventListener("click", (e) => {
    if (e.target === apiModal) apiModal.classList.remove("active");
});

saveKeyBtn.addEventListener("click", () => {
    const key = cleanKey(apiKeyInput.value);
    const provider = providerSelect.value;
    if (!key) return alert("Please paste a valid API key.");
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
    if (!cleanKey(localStorage.getItem("sahih_api_key"))) {
        apiModal.classList.add("active");
        return;
    }
    userInput.value = text;
    chatForm.dispatchEvent(new Event("submit"));
}

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    const apiKey = cleanKey(localStorage.getItem("sahih_api_key"));
    const provider = localStorage.getItem("sahih_provider") || "gemini";
    if (!message || !apiKey) return;

    appendMessage(message, true);
    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;

    const loadingBubble = appendMessage("Verifying sources...", false);

    try {
        let reply;
        if (pyVerifyClaim) {
            try {
                reply = await pyVerifyClaim(provider, apiKey, message, JSON.stringify(chatHistory));
            } catch (pyErr) {
                // Automatic fallback to native JS fetch if Pyodide pyfetch is blocked
                reply = await directVerify(provider, apiKey, message);
            }
        } else {
            reply = await directVerify(provider, apiKey, message);
        }

        loadingBubble.textContent = reply;
        chatHistory.push({ role: "user", text: message });
        chatHistory.push({ role: "model", text: reply });
    } catch (error) {
        if (error.message.includes("Failed to fetch")) {
            loadingBubble.textContent = "Network Blocked ('Failed to fetch'): Please disable any ad-blocker/Brave Shields on this site, check your internet connection, and re-paste your API key.";
        } else {
            loadingBubble.textContent = `Error: ${error.message}`;
        }
    } finally {
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
});

updateUIState();
setTimeout(loadPythonInBackground, 1000);
