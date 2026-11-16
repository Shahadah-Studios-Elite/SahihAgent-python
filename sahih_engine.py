import json
from pyodide.http import pyfetch

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

async def verify_claim(provider: str, api_key: str, message: str, history_json: str) -> str:
    history = json.loads(history_json)

    if provider == "gemini":
        url = f"https://googleapis.com{api_key}"
        contents = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["text"]}]}
            for m in history[-6:]
        ]
        contents.append({"role": "user", "parts": [{"text": message}]})

        payload = {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": contents,
            "generationConfig": {"temperature": 0.3}
        }

        response = await pyfetch(
            url,
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps(payload)
        )
        data = await response.json()
        if not response.ok:
            err = data.get("error", {}).get("message", "Gemini API Error")
            raise Exception(err)
        return data["candidates"]["content"]["parts"]["text"]

    elif provider == "openai":
        url = "https://openai.com"
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for m in history[-6:]:
            messages.append({"role": "user" if m["role"] == "user" else "assistant", "content": m["text"]})
        messages.append({"role": "user", "content": message})

        payload = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.3
        }

        response = await pyfetch(
            url,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            body=json.dumps(payload)
        )
        data = await response.json()
        if not response.ok:
            err = data.get("error", {}).get("message", "OpenAI API Error")
            raise Exception(err)
        return data["choices"]["message"]["content"]

    else:
        raise Exception("Unsupported AI provider selected.")
