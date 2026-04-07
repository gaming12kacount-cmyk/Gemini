import os
import asyncio
import threading
import signal
import logging
import io
from datetime import datetime

import google.generativeai as genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes,
    CallbackQueryHandler,
)
from telegram.constants import ParseMode, ChatAction
from flask import Flask
from PIL import Image

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration  (set these in Render → Environment)
# ---------------------------------------------------------------------------
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY")
PORT = int(os.environ.get("PORT", 8080))

if not TELEGRAM_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN env var is missing!")
if not GEMINI_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY env var is missing!")

# ---------------------------------------------------------------------------
# Gemini setup
# ---------------------------------------------------------------------------
genai.configure(api_key=GEMINI_API_KEY)

_generation_config = {
    "temperature": 0.85,
    "top_p": 1,
    "top_k": 1,
    "max_output_tokens": 2048,
}

_safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH",        "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",  "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT",  "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]

chat_model   = genai.GenerativeModel("gemini-1.5-flash",
                                     generation_config=_generation_config,
                                     safety_settings=_safety_settings)
vision_model = genai.GenerativeModel("gemini-1.5-flash",
                                     safety_settings=_safety_settings)

# ---------------------------------------------------------------------------
# Language config
# ---------------------------------------------------------------------------
LANGUAGES = {
    "en":    "🇬🇧 English",
    "bn":    "🇧🇩 বাংলা",
    "ur":    "🇵🇰 اردو",
    "ar":    "🇸🇦 العربية",
    "hi":    "🇮🇳 हिंदी",
    "zh-cn": "🇨🇳 中文",
}
LANG_NAMES = {
    "en":    "English",
    "bn":    "Bengali",
    "ur":    "Urdu",
    "ar":    "Arabic",
    "hi":    "Hindi",
    "zh-cn": "Chinese (Simplified)",
}

# ---------------------------------------------------------------------------
# In-memory user store
# ---------------------------------------------------------------------------
user_store: dict[int, dict] = {}


def get_user(user_id: int) -> dict:
    if user_id not in user_store:
        user_store[user_id] = {
            "language": "en",
            "history": [],       # list of {"role": "user"|"assistant", "content": str}
            "msg_count": 0,
        }
    return user_store[user_id]


def add_history(user_id: int, role: str, content: str) -> None:
    user = get_user(user_id)
    user["history"].append({"role": role, "content": content})
    if len(user["history"]) > 20:
        user["history"] = user["history"][-20:]


def build_context(user_id: int, limit: int = 6) -> str:
    user = get_user(user_id)
    recent = user["history"][-limit:]
    lines = []
    for h in recent:
        prefix = "User" if h["role"] == "user" else "Assistant"
        lines.append(f"{prefix}: {h['content']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------
async def gemini_chat(prompt: str, user_id: int | None = None) -> str:
    ctx = build_context(user_id) if user_id else ""
    full_prompt = (
        f"Previous conversation:\n{ctx}\n\nUser: {prompt}\nAssistant:"
        if ctx else prompt
    )
    response = await asyncio.to_thread(chat_model.generate_content, full_prompt)
    return response.text


async def gemini_vision(image: Image.Image, prompt: str) -> str:
    response = await asyncio.to_thread(vision_model.generate_content, [prompt, image])
    return response.text


async def gemini_translate(text: str, target_lang: str) -> str:
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    prompt = (
        f"Translate the following text to {lang_name}. "
        "Return ONLY the translated text, with no preamble or explanation:\n\n"
        f"{text}"
    )
    return await gemini_chat(prompt)


# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------
async def send_long(update: Update, text: str, **kwargs) -> None:
    """Send text, splitting if > 4000 chars."""
    for i in range(0, len(text), 4000):
        await update.message.reply_text(text[i : i + 4000], **kwargs)


def lang_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🇬🇧 English", callback_data="lang_en"),
         InlineKeyboardButton("🇧🇩 বাংলা",   callback_data="lang_bn")],
        [InlineKeyboardButton("🇵🇰 اردو",    callback_data="lang_ur"),
         InlineKeyboardButton("🇸🇦 العربية",  callback_data="lang_ar")],
        [InlineKeyboardButton("🇮🇳 हिंदी",   callback_data="lang_hi"),
         InlineKeyboardButton("🇨🇳 中文",     callback_data="lang_zh-cn")],
    ])


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    name = update.effective_user.first_name
    get_user(update.effective_user.id)
    await update.message.reply_text(
        f"👋 *Welcome {name}!*\n\n"
        "I'm your *Gemini AI Assistant* powered by Google's free API.\n\n"
        "Choose your language to get started:",
        reply_markup=lang_keyboard(),
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "🤖 *Gemini AI Bot — Commands*\n\n"
        "/start — Welcome & language setup\n"
        "/help — Show this message\n"
        "/lang — Change language\n"
        "/clear — Clear chat history\n"
        "/history — Summarize your conversation\n"
        "/translate `<lang>` `<text>` — Translate text\n"
        "  _e.g._ `/translate bn Hello world`\n"
        "/imagine `<prompt>` — Creative description\n"
        "/code `<question>` — Help with code\n"
        "/about — About this bot\n\n"
        "*Send me any of these:*\n"
        "🖼 Photo → image analysis\n"
        "📄 File (txt/code/csv) → summarize & analyse\n"
        "🎤 Voice → (transcription coming soon)\n\n"
        "*Lang codes:* `en` `bn` `ur` `ar` `hi` `zh-cn`",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_about(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "🤖 *Gemini AI Telegram Bot*\n\n"
        "Version: 3.0 (Render-ready)\n"
        "Engine: *Google Gemini 1.5 Flash* — Free Tier\n"
        "Framework: python-telegram-bot 20.x\n\n"
        "*Features:*\n"
        "• Multilingual chat (6 languages)\n"
        "• Image & photo analysis\n"
        "• File reading & summarisation\n"
        "• Conversation memory (last 20 msgs)\n"
        "• Translation powered by Gemini\n"
        "• Creative text generation\n"
        "• Code assistance\n\n"
        "Built for Render free-tier deployment ✅",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_lang(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("🌐 Choose your language:", reply_markup=lang_keyboard())


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    get_user(update.effective_user.id)["history"] = []
    await update.message.reply_text("✅ Conversation history cleared!")


async def cmd_history(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    user = get_user(user_id)

    if not user["history"]:
        await update.message.reply_text("📭 No conversation history yet. Start chatting!")
        return

    await update.message.reply_chat_action(ChatAction.TYPING)
    ctx = build_context(user_id, limit=20)
    summary = await gemini_chat(
        f"Summarize this conversation in 4-6 bullet points. Be concise:\n\n{ctx}"
    )
    await send_long(update, f"📋 *Conversation Summary*\n\n{summary}", parse_mode=ParseMode.MARKDOWN)


async def cmd_translate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    args = context.args or []
    if len(args) < 2:
        await update.message.reply_text(
            "Usage: `/translate <lang> <text>`\n\n"
            "Codes: `en` `bn` `ur` `ar` `hi` `zh-cn`\n"
            "Example: `/translate bn Hello, how are you?`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    target = args[0].lower()
    text = " ".join(args[1:])

    if target not in LANG_NAMES:
        await update.message.reply_text(
            f"❌ Unknown code `{target}`\n"
            f"Available: {', '.join(f'`{k}`' for k in LANG_NAMES)}",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    await update.message.reply_chat_action(ChatAction.TYPING)
    try:
        translated = await gemini_translate(text, target)
        await update.message.reply_text(
            f"🌐 *→ {LANG_NAMES[target]}*\n\n"
            f"*Original:* {text}\n\n"
            f"*Translated:* {translated}",
            parse_mode=ParseMode.MARKDOWN,
        )
    except Exception as e:
        logger.error(f"Translate error: {e}")
        await update.message.reply_text("❌ Translation failed. Please try again.")


async def cmd_imagine(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text(
            "Usage: `/imagine <your idea>`\n"
            "Example: `/imagine a futuristic city underwater at night`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    prompt = " ".join(context.args)
    await update.message.reply_chat_action(ChatAction.TYPING)
    try:
        result = await gemini_chat(
            f"Write a vivid, imaginative, and poetic description of: {prompt}\n"
            "Make it creative, sensory, and engaging. Around 150-200 words."
        )
        await send_long(update, f"✨ *{prompt}*\n\n{result}", parse_mode=ParseMode.MARKDOWN)
    except Exception as e:
        logger.error(f"Imagine error: {e}")
        await update.message.reply_text("❌ Could not generate. Try again with a different prompt.")


async def cmd_code(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text(
            "Usage: `/code <your question>`\n"
            "Example: `/code how do I sort a list in Python?`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    question = " ".join(context.args)
    await update.message.reply_chat_action(ChatAction.TYPING)
    try:
        result = await gemini_chat(
            f"You are an expert programmer. Answer this coding question clearly with examples:\n\n{question}"
        )
        await send_long(update, result)
    except Exception as e:
        logger.error(f"Code error: {e}")
        await update.message.reply_text("❌ Could not answer. Try again.")


# ---------------------------------------------------------------------------
# Callback query handler
# ---------------------------------------------------------------------------
async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data
    user_id = query.from_user.id

    if data.startswith("lang_"):
        lang_code = data[5:]          # strip "lang_"
        user = get_user(user_id)
        user["language"] = lang_code
        lang_label = LANGUAGES.get(lang_code, lang_code)
        await query.edit_message_text(
            f"✅ Language set to *{lang_label}*!\n\n"
            "Send me any message to start chatting.\n"
            "Use /help to see all commands.",
            parse_mode=ParseMode.MARKDOWN,
        )

    elif data == "change_lang":
        await query.edit_message_text("🌐 Choose your language:", reply_markup=lang_keyboard())

    elif data == "clear":
        get_user(user_id)["history"] = []
        await query.edit_message_text("✅ History cleared!")

    elif data == "help":
        await query.edit_message_text("Use /help to see all commands.")


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------
async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    user = get_user(user_id)
    lang = user.get("language", "en")
    msg = update.message.text

    await update.message.reply_chat_action(ChatAction.TYPING)

    try:
        reply = await gemini_chat(msg, user_id)

        if lang != "en":
            reply = await gemini_translate(reply, lang)

        add_history(user_id, "user",      msg[:300])
        add_history(user_id, "assistant", reply[:300])

        await send_long(update, reply)

    except Exception as e:
        logger.error(f"Text handler error: {e}")
        err = {
            "en": "⚠️ Something went wrong. Please try again.",
            "bn": "⚠️ কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।",
            "ur": "⚠️ کچھ غلط ہوا۔ دوبارہ کوشش کریں۔",
            "ar": "⚠️ حدث خطأ. حاول مرة أخرى.",
            "hi": "⚠️ कुछ गलत हुआ। कृपया पुनः प्रयास करें।",
            "zh-cn": "⚠️ 出了点问题，请再试一次。",
        }
        await update.message.reply_text(err.get(lang, err["en"]))


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    lang = get_user(user_id).get("language", "en")
    caption = update.message.caption or "Describe this image in detail. What do you see?"

    await update.message.reply_chat_action(ChatAction.UPLOAD_PHOTO)

    try:
        photo_file = await update.message.photo[-1].get_file()
        raw = await photo_file.download_as_bytearray()
        image = Image.open(io.BytesIO(raw))

        reply = await gemini_vision(image, caption)

        if lang != "en":
            reply = await gemini_translate(reply, lang)

        add_history(user_id, "user",      f"[Photo] {caption}")
        add_history(user_id, "assistant", reply[:300])

        await send_long(update, reply)

    except Exception as e:
        logger.error(f"Photo handler error: {e}")
        await update.message.reply_text("❌ Could not analyse the image. Please try again.")


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    lang = get_user(user_id).get("language", "en")
    doc = update.message.document

    if doc.file_size and doc.file_size > 5 * 1024 * 1024:
        await update.message.reply_text("❌ File too large (max 5 MB). Please compress and resend.")
        return

    await update.message.reply_chat_action(ChatAction.TYPING)

    try:
        file = await doc.get_file()
        raw = await file.download_as_bytearray()
        fname = doc.file_name or "file"

        # Attempt UTF-8, fall back to latin-1
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            try:
                content = raw.decode("latin-1")
            except Exception:
                await update.message.reply_text(
                    "❌ Cannot read this file format.\n"
                    "Supported: plain text, code files, CSV, JSON, etc."
                )
                return

        if len(content) > 8000:
            content = content[:8000] + "\n...[truncated at 8000 chars]"

        question = update.message.caption or "Summarise and analyse this file. What is it about?"
        prompt = f"File name: {fname}\n\nContent:\n{content}\n\nTask: {question}"

        reply = await gemini_chat(prompt)

        if lang != "en":
            reply = await gemini_translate(reply, lang)

        add_history(user_id, "user",      f"[File: {fname}] {question}")
        add_history(user_id, "assistant", reply[:300])

        header = f"📄 *Analysis: {fname}*\n\n"
        await send_long(update, header + reply, parse_mode=ParseMode.MARKDOWN)

    except Exception as e:
        logger.error(f"Document handler error: {e}")
        await update.message.reply_text("❌ Could not process the file. Please try again.")


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "🎤 Voice message received!\n\n"
        "Voice transcription is not supported yet.\n"
        "Please type your message as text. 📝"
    )


async def handle_sticker(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    responses = [
        "😄 Nice sticker! Got something to ask?",
        "👍 Cool! What can I help you with?",
        "🤖 Sticker noted! Type a message to chat.",
    ]
    import random
    await update.message.reply_text(random.choice(responses))


# ---------------------------------------------------------------------------
# Flask health-check server  (keeps Render web service alive)
# ---------------------------------------------------------------------------
flask_app = Flask(__name__)


@flask_app.route("/")
def health_root():
    return (
        '{"status":"ok","service":"Gemini Telegram Bot","version":"3.0"}',
        200,
        {"Content-Type": "application/json"},
    )


@flask_app.route("/health")
def health():
    return "OK", 200


def run_flask() -> None:
    import logging as _log
    _log.getLogger("werkzeug").setLevel(_log.ERROR)
    flask_app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)


# ---------------------------------------------------------------------------
# Bot runner
# ---------------------------------------------------------------------------
async def run_bot() -> None:
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start",     cmd_start))
    app.add_handler(CommandHandler("help",      cmd_help))
    app.add_handler(CommandHandler("about",     cmd_about))
    app.add_handler(CommandHandler("lang",      cmd_lang))
    app.add_handler(CommandHandler("clear",     cmd_clear))
    app.add_handler(CommandHandler("history",   cmd_history))
    app.add_handler(CommandHandler("translate", cmd_translate))
    app.add_handler(CommandHandler("imagine",   cmd_imagine))
    app.add_handler(CommandHandler("code",      cmd_code))

    # Inline buttons
    app.add_handler(CallbackQueryHandler(callback_handler))

    # Messages
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND,  handle_text))
    app.add_handler(MessageHandler(filters.PHOTO,                    handle_photo))
    app.add_handler(MessageHandler(filters.Document.ALL,             handle_document))
    app.add_handler(MessageHandler(filters.VOICE,                    handle_voice))
    app.add_handler(MessageHandler(filters.Sticker.ALL,              handle_sticker))

    # Graceful shutdown on SIGTERM / SIGINT
    stop_event = asyncio.Event()
    loop = asyncio.get_event_loop()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except (NotImplementedError, RuntimeError):
            pass  # Windows doesn't support add_signal_handler

    logger.info("Starting Telegram polling ...")

    async with app:
        await app.start()
        await app.updater.start_polling(
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=True,
        )
        logger.info("✅ Bot is live and polling!")
        await stop_event.wait()          # block until shutdown signal
        logger.info("Shutting down ...")
        await app.updater.stop()
        await app.stop()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    logger.info("=== Gemini Telegram Bot v3.0 starting ===")

    # Flask runs in a background daemon thread so Render health checks pass
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    logger.info(f"Health server listening on port {PORT}")

    # Bot runs in the main thread
    asyncio.run(run_bot())


if __name__ == "__main__":
    main()
