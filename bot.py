import os
import asyncio
import google.generativeai as genai
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- Configuration ---
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY")

# --- Initialize Gemini ---
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# --- Bot Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a welcome message when the /start command is issued."""
    await update.message.reply_text(
        "Hello! I'm your Gemini AI assistant. Send me any text, and I'll reply!"
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle incoming text messages and get a reply from Gemini."""
    user_message = update.message.text
    await update.message.reply_chat_action(action="typing")
    
    try:
        response = await asyncio.to_thread(model.generate_content, user_message)
        reply = response.text
        await update.message.reply_text(reply)
    except Exception as e:
        print(f"Error: {e}")
        await update.message.reply_text("Sorry, I encountered an error. Please try again.")

def main():
    """Start the bot."""
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    print("Bot is polling...")
    app.run_polling()

if __name__ == "__main__":
    main()
