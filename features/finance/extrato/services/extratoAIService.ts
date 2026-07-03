import { GoogleGenAI } from "@google/genai";
import { baseSystemPrompt, getExtratoPromptByAction, ActionType } from "../ai/promptResolver";
import { getGeminiApiKey } from "../../../../utils/geminiConfig";
import { buildInternalExtratoResponse } from "../../../../services/internalAI.service";

export const getExtratoAIResponse = async (action: ActionType, context: any, userQuestion?: string) => {
  const googleApiKey = getGeminiApiKey();

  if (!googleApiKey) {
    return buildInternalExtratoResponse(action, context, userQuestion);
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

  try {
    const response = await chat.sendMessage({ message: fullPrompt });
    return response.text;
  } catch (error: any) {
    const msg = String(error?.message || error || "");
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("xhr")) {
      return buildInternalExtratoResponse(action, context, userQuestion);
    }
    throw error;
  }
};
