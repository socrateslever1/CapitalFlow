import { baseSystemPrompt, getExtratoPromptByAction, type ActionType } from '../ai/promptResolver';
import { buildInternalExtratoResponse } from '../../../../services/internalAI.service';
import { requestGemini } from '../../../../services/secureGemini.service';

export const getExtratoAIResponse = async (action: ActionType, context: unknown, userQuestion?: string) => {
  const prompt = getExtratoPromptByAction(action, userQuestion);
  try {
    const response = await requestGemini({
      model: 'gemini-2.5-flash',
      contents: `${prompt}\n\n${JSON.stringify(context)}`,
      config: { systemInstruction: baseSystemPrompt },
    });
    return response.text;
  } catch {
    return buildInternalExtratoResponse(action, context, userQuestion);
  }
};
