import json
import traceback
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

def sanitize_key(raw_key: str) -> str:
    if not raw_key:
        return ""
    return "".join(ch for ch in raw_key.strip() if 33 <= ord(ch) <= 126)

async def verify_claim(provider: str, api_key: str, message: str, history_json: str) -> str:
    clean_key = sanitize_key(api_key)
    if not clean_key:
        raise Exception("API Key is empty.")

    history = json.loads(history_json) if history_json else []
    recent_history = history[-6:] if len(history) > 6 else history

    try:
        if provider == "gemini":
            url = f"https://googleapis.com{clean_key}"
            contents = [
                {"role": "user" if m.get("role") == "user" else "model", "parts": [{"text": m.get("text", "")}]}
                for m in recent_history
            ]
            contents.append({"role": "user", "parts": [{"text": message}]})

            response = await pyfetch(
                url,
                method="POST",
                headers={"Content-Type": "application/json"},
                body=json.dumps({
                    "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                    "contents": contents,
                    "generationConfig": {"temperature": 0.3}
                })
            )

            raw_text = await response.string()
            data = json.loads(raw_text)

            if not response.ok:
                err_msg = data.get("error", {}).get("message", raw_text[:250])
                raise Exception(f"Gemini HTTP {response.status}: {err_msg}")

            first_candidate = next(iter(data.get("candidates", [])), {})
            first_part = next(iter(first_candidate.get("content", {}).get("parts", [])), {})
            reply = first_part.get("text", "")
            if not reply:
                raise Exception(f"Empty Gemini reply: {raw_text[:250]}")
            return reply

        elif provider == "openai":
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            for m in recent_history:
                role = "user" if m.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": m.get("text", "")})
            messages.append({"role": "user", "content": message})

            response = await pyfetch(
                "https://openai.com",
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {clean_key}"
                },
                body=json.dumps({
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "temperature": 0.3
                })
            )

            raw_text = await response.string()
            data = json.loads(raw_text)

            if not response.ok:
                err_msg = data.get("error", {}).get("message", raw_text[:250])
                raise Exception(f"OpenAI HTTP {response.status}: {err_msg}")

            first_choice = next(iter(data.get("choices", [])), {})
            reply = first_choice.get("message", {}).get("content", "")
            if not reply:
                raise Exception(f"Empty OpenAI reply: {raw_text[:250]}")
            return reply

        else:
            raise Exception(f"Unknown provider: {provider}")

    except Exception as e:
        traceback.print_exc()
        raise Exception(str(e))
