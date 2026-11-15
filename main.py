from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI(title="SahihAgent BYOK API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to ["https://sahihfinder.com"] in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """
You are SahihAgent, the official AI verification assistant for SahihFinder (sahihfinder.com) by Shahadah Studios Elite.
Your purpose is to help Muslims verify claims, quotes, hadiths, and online information in accordance with Islamic values and rigorous scholarly standards.

Guidelines:
1. Always prioritize authenticity and primary sources (e.g., Sahih al-Bukhari, Sahih Muslim, Sunan Abu Dawud, Jami' at-Tirmidhi, Quranic verses).
2. Clearly state the grading of any Hadith you cite (e.g., Sahih, Hasan, Da'if, or Mawdu'/Fabricated).
3. If a claim circulating online is unverified or fabricated, politely refute it with clear evidence.
4. Maintain a respectful, objective, and helpful tone.
5. Do not issue personal fatwas; for complex jurisprudential (fiqh) rulings, advise consulting a qualified local scholar.
"""

class ChatRequest(BaseModel):
    provider: str  # "gemini", "openai", or "claude"
    message: str
    history: list[dict] = []

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest, x_api_key: str = Header(None)):
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header. Please configure your API key.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # 1. Google Gemini
            if req.provider == "gemini":
                url = f"https://googleapis.com{x_api_key}"
                contents = [
                    {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["text"]}]}
                    for m in req.history[-6:]
                ]
                contents.append({"role": "user", "parts": [{"text": req.message}]})

                res = await client.post(url, json={
                    "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                    "contents": contents,
                    "generationConfig": {"temperature": 0.3}
                })
                data = res.json()
                if res.status_code != 200:
                    raise HTTPException(status_code=res.status_code, detail=data.get("error", {}).get("message", "Gemini API Error"))
                return {"reply": data["candidates"][0]["content"]["parts"][0]["text"]}

            # 2. OpenAI
            elif req.provider == "openai":
                messages = [{"role": "system", "content": SYSTEM_PROMPT}]
                for m in req.history[-6:]:
                    messages.append({"role": "user" if m["role"] == "user" else "assistant", "content": m["text"]})
                messages.append({"role": "user", "content": req.message})

                res = await client.post(
                    "https://openai.com",
                    headers={"Authorization": f"Bearer {x_api_key}"},
                    json={"model": "gpt-4o-mini", "messages": messages, "temperature": 0.3}
                )
                data = res.json()
                if res.status_code != 200:
                    raise HTTPException(status_code=res.status_code, detail=data.get("error", {}).get("message", "OpenAI API Error"))
                return {"reply": data["choices"][0]["message"]["content"]}

            # 3. Anthropic Claude (Requires Python backend due to browser CORS)
            elif req.provider == "claude":
                messages = [
                    {"role": "user" if m["role"] == "user" else "assistant", "content": m["text"]}
                    for m in req.history[-6:]
                ]
                messages.append({"role": "user", "content": req.message})

                res = await client.post(
                    "https://anthropic.com",
                    headers={
                        "x-api-key": x_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": "claude-3-5-haiku-latest",
                        "max_tokens": 1024,
                        "system": SYSTEM_PROMPT,
                        "messages": messages,
                        "temperature": 0.3
                    }
                )
                data = res.json()
                if res.status_code != 200:
                    raise HTTPException(status_code=res.status_code, detail=data.get("error", {}).get("message", "Claude API Error"))
                return {"reply": data["content"][0]["text"]}

            else:
                raise HTTPException(status_code=400, detail="Unsupported provider selected.")

        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Network error contacting AI provider: {exc}")

# Serve the HTML/CSS/JS frontend
app.mount("/", StaticFiles(directory="static", html=True), name="static")
