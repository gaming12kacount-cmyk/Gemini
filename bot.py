import os
import asyncio
import google.generativeai as genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
from flask import Flask, request
import threading
from googletrans import Translator
from PIL import Image
import io
from datetime import datetime
import json

# --- Configuration ---
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY")
PORT = int(os.environ.get("PORT", 8080))

# --- Initialize ---
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')
translator = Translator()

# --- User Data Storage (In-memory, for demo) ---
user_data = {}  # {user_id: {'language': 'en', 'history': [], 'preferences': {}}}

# --- Language Settings ---
LANGUAGES = {
    'en': '🇬🇧 English',
    'bn': '🇧🇩 বাংলা',
    'ur': '🇵🇰 اردو',
    'ar': '🇸🇦 العربية',
    'zh-cn': '🇨🇳 中文'
}

# Welcome messages in different languages
WELCOME_MSGS = {
    'en': "Hello! I'm your multilingual AI assistant. I can:\n✅ Answer questions\n✅ Analyze images\n✅ Translate between 5 languages\n✅ Remember conversations\n✅ Read files\n\nSend me text, image, or file!",
    'bn': "হ্যালো! আমি আপনার বহুভাষিক AI সহকারী। আমি পারি:\n✅ প্রশ্নের উত্তর দিতে\n✅ ছবি বিশ্লেষণ করতে\n✅ ৫টি ভাষায় অনুবাদ করতে\n✅ কথোপকথন মনে রাখতে\n✅ ফাইল পড়তে\n\nআমাকে টেক্সট, ছবি বা ফাইল পাঠান!",
    'ur': "ہیلو! میں آپ کا کثیر لسانی AI معاون ہوں۔ میں کر سکتا ہوں:\n✅ سوالات کے جوابات\n✅ تصاویر کا تجزیہ\n✅ 5 زبانوں میں ترجمہ\n✅ بات چیت یاد رکھنا\n✅ فائلیں پڑھنا\n\nمجھے متن، تصویر یا فائل بھیجیں!",
    'ar': "مرحباً! أنا مساعدك الذكي متعدد اللغات. يمكنني:\n✅ الإجابة على الأسئلة\n✅ تحليل الصور\n✅ الترجمة بين 5 لغات\n✅ تذكر المحادثات\n✅ قراءة الملفات\n\nأرسل لي نصاً أو صورة أو ملفاً!",
    'zh-cn': "你好！我是你的多语言AI助手。我可以：\n✅ 回答问题\n✅ 分析图片\n✅ 在5种语言之间翻译\n✅ 记住对话\n✅ 阅读文件\n\n发送文本、图片或文件给我！"
}

# --- Helper Functions ---
def get_user_language(user_id):
    return user_data.get(user_id, {}).get('language', 'en')

def set_user_language(user_id, lang_code):
    if user_id not in user_data:
        user_data[user_id] = {'history': [], 'preferences': {}}
    user_data[user_id]['language'] = lang_code

def add_to_history(user_id, question, answer):
    if user_id not in user_data:
        user_data[user_id] = {'language': 'en', 'history': [], 'preferences': {}}
    user_data[user_id]['history'].append({
        'question': question,
        'answer': answer,
        'timestamp': datetime.now().isoformat()
    })
    # Keep only last 10 conversations
    if len(user_data[user_id]['history']) > 10:
        user_data[user_id]['history'].pop(0)

def get_history_context(user_id):
    if user_id not in user_data:
        return ""
    history = user_data[user_id]['history'][-5:]  # Last 5 conversations
    context = "Previous conversation:\n"
    for item in history:
        context += f"User: {item['question']}\nAI: {item['answer']}\n"
    return context

async def translate_text(text, target_lang):
    """Translate text to target language"""
    try:
        translated = await translator.translate(text, dest=target_lang)
        return translated.text
    except:
        return text

# --- Flask app for health checks ---
flask_app = Flask(__name__)

@flask_app.route('/')
def health_check():
    return "Bot is running!", 200

@flask_app.route('/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(force=True), bot_app.bot)
    asyncio.create_task(bot_app.process_update(update))
    return 'ok', 200

# --- Bot Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    keyboard = [
        [InlineKeyboardButton("🇬🇧 English", callback_data='lang_en'),
         InlineKeyboardButton("🇧🇩 বাংলা", callback_data='lang_bn')],
        [InlineKeyboardButton("🇵🇰 اردو", callback_data='lang_ur'),
         InlineKeyboardButton("🇸🇦 العربية", callback_data='lang_ar')],
        [InlineKeyboardButton("🇨🇳 中文", callback_data='lang_zh-cn')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "Welcome! 🌟\nPlease choose your language / আপনার ভাষা নির্বাচন করুন:",
        reply_markup=reply_markup
    )

async def language_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    lang_code = query.data.split('_')[1]
    set_user_language(user_id, lang_code)
    
    welcome_msg = WELCOME_MSGS.get(lang_code, WELCOME_MSGS['en'])
    await query.edit_message_text(welcome_msg)
    
    # Show additional options
    keyboard = [
        [InlineKeyboardButton("📝 Help", callback_data='help'),
         InlineKeyboardButton("🗑 Clear History", callback_data='clear')],
        [InlineKeyboardButton("🌐 Change Language", callback_data='change_lang')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.message.reply_text("What would you like to do?", reply_markup=reply_markup)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    lang = get_user_language(user_id)
    
    help_texts = {
        'en': "📚 *Available Commands:*\n"
              "/start - Restart bot\n"
              "/help - Show this help\n"
              "/clear - Clear conversation history\n"
              "/lang - Change language\n"
              "/about - About this bot\n\n"
              "*Features:*\n"
              "✅ Text questions\n"
              "✅ Image analysis\n"
              "✅ File reading (PDF, TXT)\n"
              "✅ Auto-translation\n"
              "✅ Conversation memory",
        
        'bn': "📚 *উপলব্ধ কমান্ড:*\n"
              "/start - বোট রিস্টার্ট\n"
              "/help - সাহায্য দেখুন\n"
              "/clear - ইতিহাস মুছুন\n"
              "/lang - ভাষা পরিবর্তন\n"
              "/about - বোট সম্পর্কে\n\n"
              "*ফিচার:*\n"
              "✅ টেক্সট প্রশ্ন\n"
              "✅ ছবি বিশ্লেষণ\n"
              "✅ ফাইল পড়া\n"
              "✅ স্বয়ংক্রিয় অনুবাদ\n"
              "✅ কথোপকথন মেমরি",
        
        'ur': "📚 *دستیاب کمانڈز:*\n"
              "/start - بوٹ دوبارہ شروع کریں\n"
              "/help - یہ مدد دکھائیں\n"
              "/clear - تاریخچہ صاف کریں\n"
              "/lang - زبان تبدیل کریں\n"
              "/about - بوٹ کے بارے میں\n\n"
              "*خصوصیات:*\n"
              "✅ متنی سوالات\n"
              "✅ تصویری تجزیہ\n"
              "✅ فائل پڑھنا\n"
              "✅ خودکار ترجمہ\n"
              "✅ گفتگو کی میموری"
    }
    
    help_text = help_texts.get(lang, help_texts['en'])
    await update.message.reply_text(help_text, parse_mode='Markdown')

async def clear_history(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id in user_data:
        user_data[user_id]['history'] = []
    
    lang = get_user_language(user_id)
    msgs = {
        'en': "✅ Conversation history cleared!",
        'bn': "✅ কথোপকথনের ইতিহাস মুছে ফেলা হয়েছে!",
        'ur': "✅ گفتگو کی تاریخ صاف کر دی گئی!",
        'ar': "✅ تم مسح تاريخ المحادثة!",
        'zh-cn': "✅ 对话历史已清除！"
    }
    await update.message.reply_text(msgs.get(lang, msgs['en']))

async def about_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    lang = get_user_language(user_id)
    
    about_texts = {
        'en': "🤖 *Gemini AI Telegram Bot*\n\n"
              "Version: 2.0\n"
              "Powered by: Google Gemini AI\n"
              "Features: Multi-language, Image Analysis, File Reading\n"
              "Languages: English, বাংলা, اردو, العربية, 中文\n\n"
              "Created with ❤️ for the community",
        
        'bn': "🤖 *জেমিনাই এআই টেলিগ্রাম বোট*\n\n"
              "ভার্সন: ২.০\n"
              "চালিত: গুগল জেমিনাই এআই\n"
              "ফিচার: বহুভাষিক, ছবি বিশ্লেষণ, ফাইল পড়া\n"
              "ভাষা: ইংরেজি, বাংলা, উর্দু, আরবি, চাইনিজ\n\n"
              "কমিউনিটির জন্য ❤️ দিয়ে তৈরি"
    }
    
    about_text = about_texts.get(lang, about_texts['en'])
    await update.message.reply_text(about_text, parse_mode='Markdown')

async def change_language(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query:
        await query.answer()
        message = query.message
    else:
        message = update.message
    
    keyboard = [
        [InlineKeyboardButton("🇬🇧 English", callback_data='lang_en'),
         InlineKeyboardButton("🇧🇩 বাংলা", callback_data='lang_bn')],
        [InlineKeyboardButton("🇵🇰 اردو", callback_data='lang_ur'),
         InlineKeyboardButton("🇸🇦 العربية", callback_data='lang_ar')],
        [InlineKeyboardButton("🇨🇳 中文", callback_data='lang_zh-cn')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    if query:
        await query.edit_message_text("Select your language:", reply_markup=reply_markup)
    else:
        await message.reply_text("Select your language:", reply_markup=reply_markup)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    user_message = update.message.text
    lang = get_user_language(user_id)
    
    await update.message.reply_chat_action(action="typing")
    
    try:
        # Get conversation history for context
        context_history = get_history_context(user_id)
        
        # Prepare prompt with context
        prompt = f"{context_history}\nUser: {user_message}\nAI: "
        
        # Get response from Gemini
        response = await asyncio.to_thread(model.generate_content, prompt)
        reply = response.text
        
        # Translate response to user's language if needed
        if lang != 'en':
            reply = await translate_text(reply, lang)
        
        # Save to history
        add_to_history(user_id, user_message, reply)
        
        await update.message.reply_text(reply)
        
    except Exception as e:
        print(f"Error: {e}")
        error_msg = {
            'en': "Sorry, I encountered an error. Please try again.",
            'bn': "দুঃখিত, একটি ত্রুটি হয়েছে। আবার চেষ্টা করুন।",
            'ur': "معذرت، ایک خرابی پیش آگئی۔ براہ کرم دوبارہ کوشش کریں۔",
            'ar': "عذرًا، لقد حدث خطأ. يرجى المحاولة مرة أخرى.",
            'zh-cn': "抱歉，我遇到了错误。请再试一次。"
        }
        await update.message.reply_text(error_msg.get(lang, error_msg['en']))

async def handle_image(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    lang = get_user_language(user_id)
    
    await update.message.reply_chat_action(action="upload_photo")
    
    try:
        # Get the photo
        photo_file = await update.message.photo[-1].get_file()
        image_bytes = await photo_file.download_as_bytearray()
        
        # Open image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Generate description using Gemini
        prompt = "Describe this image in detail. What do you see?"
        response = await asyncio.to_thread(model.generate_content, [prompt, image])
        reply = response.text
        
        # Translate if needed
        if lang != 'en':
            reply = await translate_text(reply, lang)
        
        await update.message.reply_text(reply)
        
    except Exception as e:
        print(f"Image error: {e}")
        await update.message.reply_text("Sorry, couldn't process the image.")

async def handle_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    lang = get_user_language(user_id)
    
    await update.message.reply_chat_action(action="typing")
    
    try:
        # Get file
        document = update.message.document
        file = await document.get_file()
        file_bytes = await file.download_as_bytearray()
        
        # Try to read as text
        try:
            file_content = file_bytes.decode('utf-8')
        except:
            file_content = str(file_bytes[:500])  # First 500 bytes if binary
        
        # Ask Gemini to summarize
        prompt = f"Please summarize or analyze this file content:\n\n{file_content[:3000]}"
        response = await asyncio.to_thread(model.generate_content, prompt)
        reply = response.text
        
        # Translate if needed
        if lang != 'en':
            reply = await translate_text(reply, lang)
        
        await update.message.reply_text(reply[:4000])  # Telegram limit
        
    except Exception as e:
        print(f"File error: {e}")
        await update.message.reply_text("Sorry, couldn't process the file.")

# --- Main Function ---
async def post_init(application: Application):
    await application.bot.set_webhook(f"https://{os.environ.get('RENDER_EXTERNAL_HOSTNAME')}/webhook")

def run_flask():
    flask_app.run(host='0.0.0.0', port=PORT)

def main():
    global bot_app
    bot_app = Application.builder().token(TELEGRAM_TOKEN).post_init(post_init).build()
    
    # Command handlers
    bot_app.add_handler(CommandHandler("start", start))
    bot_app.add_handler(CommandHandler("help", help_command))
    bot_app.add_handler(CommandHandler("clear", clear_history))
    bot_app.add_handler(CommandHandler("about", about_command))
    bot_app.add_handler(CommandHandler("lang", change_language))
    
    # Callback handlers
    bot_app.add_handler(CallbackQueryHandler(language_callback, pattern='^lang_'))
    bot_app.add_handler(CallbackQueryHandler(change_language, pattern='^change_lang'))
    bot_app.add_handler(CallbackQueryHandler(help_command, pattern='^help'))
    bot_app.add_handler(CallbackQueryHandler(clear_history, pattern='^clear'))
    
    # Message handlers
    bot_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    bot_app.add_handler(MessageHandler(filters.PHOTO, handle_image))
    bot_app.add_handler(MessageHandler(filters.Document.ALL, handle_file))
    
    # Start Flask in a separate thread
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.start()
    
    print("Bot is running with all features...")
    
    # Run the bot
    bot_app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
