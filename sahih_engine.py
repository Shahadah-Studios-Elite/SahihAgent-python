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
    """Remove accidental whitespace, newlines, or hidden characters."""
    if not raw_key:
        return ""
    return "".join(ch for ch in raw_key.strip() if 33 <= ord(ch) <= 126)

async def verify_claim(provider: str, api_key: str, message: str, history_json: str) -> str:
    clean_key = sanitize_key(api_key)
    if not clean_key:
        raise Exception("[DEBUG] API Key is empty after removing invalid spaces/characters.")

    try:
        history = json.loads(history_json) if history_json else []
    except Exception as e:
        raise Exception(f"[DEBUG] Failed to parse chat history JSON: {e}")

    try:
        # ==========================================
        # 1. GOOGLE GEMINI
        # ==========================================
        if provider == "gemini":
            url = f"https://googleapis.com{clean_key}"
            contents = [
                {"role": "user" if m.get("role") == "user" else "model", "parts": [{"text": m.get("text", "")}]}
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

            raw_text = await response.string()
            try:
                data = json.loads(raw_text)
            except Exception:
                raise Exception(f"[DEBUG Gemini HTTP {response.status}] Non-JSON response: {raw_text[:250]}")

            if not response.ok:
                err_msg = data.get("error", {}).get("message", raw_text[:250])
                raise Exception(f"[DEBUG Gemini HTTP {response.status}] {err_msg}")

            # Safely extract text from candidates[0]
            candidates = data.get("candidates", [])
            if not candidates:
                raise Exception(f"[DEBUG Gemini] Empty candidates returned: {raw_text[:250]}")

            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                raise Exception(f"[DEBUG Gemini] Empty content parts returned: {raw_text[:250]}")

            return parts[0].get("text", "[DEBUG Gemini] No text field in response.")

        # ==========================================
        # 2. OPENAI
        # ==========================================
        elif provider == "openai":
            url = "https://openai.com"
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            for m in history[-6:]:
                role = "user" if m.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": m.get("text", "")})
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
                    "Authorization": f"Bearer {clean_key}"
                },
                body=json.dumps(payload)
            )

            raw_text = await response.string()
            try:
                data = json.loads(raw_text)
            except Exception:
                raise Exception(f"[DEBUG OpenAI HTTP {response.status}] Non-JSON response: {raw_text[:250]}")

            if not response.ok:
                err_msg = data.get("error", {}).get("message", raw_text[:250])
                raise Exception(f"[DEBUG OpenAI HTTP {response.status}] {err_msg}")

            # Safely extract text from choices[0]
            choices = data.get("choices", [])
            if not choices:
                raise Exception(f"[DEBUG OpenAI] Empty choices returned: {raw_text[:250]}")

            return choices[0].get("message", {}).get("content", "[DEBUG OpenAI] No content field in response.")

        else:
            raise Exception(f"[DEBUG] Unknown provider '{provider}'. Expected 'gemini' or 'openai'.")

    except Exception as e:
        # Print full traceback to browser DevTools Console (F12) for easy inspection
        print("=== SahihAgent Python Traceback ===")
        traceback.print_exc()
        raise Exception(str(e))
