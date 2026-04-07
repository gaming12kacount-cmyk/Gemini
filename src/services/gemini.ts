import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type Content,
} from '@google/generative-ai';
import { config } from '../config';
import { logger } from '../utils/logger';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// ─── Mode System Prompts ──────────────────────────────────────────────────────
export const MODES: Record<string, { label: string; emoji: string; prompt: string }> = {
  chat: {
    label: 'General Chat',
    emoji: '💬',
    prompt:
      'You are a helpful, friendly, and intelligent AI assistant. Respond clearly and concisely. Use markdown formatting when helpful.',
  },
  code: {
    label: 'Code Expert',
    emoji: '👨‍💻',
    prompt:
      'You are an expert software engineer. Help with code problems, debugging, architecture, and best practices. Always use proper code blocks with language tags. Explain your reasoning.',
  },
  tutor: {
    label: 'Tutor',
    emoji: '📚',
    prompt:
      'You are a patient and encouraging tutor. Break down complex topics into simple, easy-to-understand explanations. Use examples, analogies, and step-by-step walkthroughs.',
  },
  creative: {
    label: 'Creative Writer',
    emoji: '✍️',
    prompt:
      'You are a talented creative writer. Help with stories, poems, scripts, brainstorming, and all forms of creative writing. Be imaginative, vivid, and engaging.',
  },
  translator: {
    label: 'Translator',
    emoji: '🌍',
    prompt:
      'You are a professional translator fluent in all major languages including Bengali/Bangla. Translate accurately while preserving tone, context, and cultural nuances. Identify the source language automatically.',
  },
  analyst: {
    label: 'Analyst',
    emoji: '📊',
    prompt:
      'You are a sharp analytical thinker. Break down problems, analyze data, compare options, identify pros and cons, and provide structured, evidence-based insights.',
  },
};

// ─── Safety Settings ──────────────────────────────────────────────────────────
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// ─── Chat with history ────────────────────────────────────────────────────────
export async function askGemini(
  userMessage: string,
  history: Content[],
  mode: string = 'chat',
  retries = 2,
): Promise<string> {
  const modeConfig = MODES[mode] ?? MODES.chat;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: modeConfig.prompt,
    safetySettings,
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: mode === 'creative' ? 0.9 : mode === 'code' ? 0.2 : 0.7,
      topP: 0.95,
    },
  });

  const chat = model.startChat({ history });

  try {
    const result = await chat.sendMessage(userMessage);
    const text = result.response.text();
    if (!text) return '⚠️ Empty response from Gemini. Please try again.';
    return text;
  } catch (err: any) {
    if (retries > 0 && (err?.status === 429 || err?.status === 503)) {
      logger.warn(`Gemini rate limit/timeout, retrying... (${retries} left)`);
      await sleep(2000);
      return askGemini(userMessage, history, mode, retries - 1);
    }
    logger.error('Gemini error:', err);
    if (err?.message?.includes('SAFETY')) {
      return '🚫 My safety filters blocked that response. Please rephrase your question.';
    }
    if (err?.status === 429) {
      return '⏳ I\'m getting too many requests right now. Please wait a moment and try again.';
    }
    return '❌ Something went wrong while contacting Gemini. Please try again later.';
  }
}

// ─── Image analysis ───────────────────────────────────────────────────────────
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt: string = 'Describe this image in detail.',
  mode: string = 'chat',
  retries = 2,
): Promise<string> {
  const modeConfig = MODES[mode] ?? MODES.chat;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: modeConfig.prompt,
    safetySettings,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  });

  try {
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      prompt,
    ]);
    return result.response.text() || '⚠️ Could not analyze the image.';
  } catch (err: any) {
    if (retries > 0 && (err?.status === 429 || err?.status === 503)) {
      await sleep(2000);
      return analyzeImage(imageBase64, mimeType, prompt, mode, retries - 1);
    }
    logger.error('Gemini vision error:', err);
    return '❌ Failed to analyze the image. Please try again.';
  }
}

// ─── Build Gemini-format history from DB rows ─────────────────────────────────
export function buildHistory(
  rows: { role: string; content: string }[],
): Content[] {
  // Gemini needs alternating user/model; ensure it starts with user
  const history: Content[] = [];
  for (const row of rows) {
    history.push({
      role: row.role === 'user' ? 'user' : 'model',
      parts: [{ text: row.content }],
    });
  }
  return history;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
