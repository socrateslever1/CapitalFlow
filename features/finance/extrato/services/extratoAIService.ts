import { GoogleGenAI } from "@google/genai";
import { baseSystemPrompt, getExtratoPromptByAction, ActionType } from "../ai/promptResolver";
import { GEMINI_API_KEY_HELP, getGeminiApiKey } from "../../../../utils/geminiConfig";

export const getExtratoAIResponse = async (action: ActionType, context: any, userQuestion?: string) => {
  const googleApiKey = getGeminiApiKey();

  if (!googleApiKey) {
    throw new Error(GEMINI_API_KEY_HELP);
  }

  const ai = new GoogleGenAI({ apiKey: googleApiKey });
  const prompt = getExtratoPromptByAction(action, userQuestion);
  const fullPrompt = `${prompt}\n\n${JSON.stringify(context, null, 2)}`;
  
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: baseSystemPrompt,
    },
  });

  const response = await chat.sendMessage({ message: fullPrompt });
  return response.text;
};
