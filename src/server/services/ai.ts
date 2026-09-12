import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, type LanguageModel } from "ai";
import { env, features } from "@/env";
import {
  buildDayPrompt,
  DAY_SYSTEM_PROMPT,
  type DayContext,
  type DaySuggestion,
  daySuggestionSchema,
  dedupeStops,
  orderByTime,
} from "@/lib/ai-suggest";

/**
 * The planning assistant is optional: the app is fully usable without it, and the
 * provider is chosen by env so a deployment can run on either key it happens to have.
 */
const DEFAULT_MODEL = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash",
} as const;

export class AiUnavailableError extends Error {
  constructor() {
    super("Trip suggestions are not enabled on this deployment");
    this.name = "AiUnavailableError";
  }
}

function suggestionModel(): LanguageModel {
  if (!features.ai) throw new AiUnavailableError();
  if (env.AI_PROVIDER === "anthropic") {
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return anthropic(env.AI_MODEL ?? DEFAULT_MODEL.anthropic);
  }
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return google(env.AI_MODEL ?? DEFAULT_MODEL.google);
}

/**
 * Asks for a day plan and returns only stops the trip does not already have.
 * The model never writes to the trip: suggestions are resolved against Google Places
 * and added by the traveller, so nothing invented reaches the itinerary.
 */
export async function suggestDayPlan(ctx: DayContext): Promise<DaySuggestion> {
  const { object } = await generateObject({
    model: suggestionModel(),
    schema: daySuggestionSchema,
    system: DAY_SYSTEM_PROMPT,
    prompt: buildDayPrompt(ctx),
    temperature: 0.7,
    maxRetries: 1,
  });
  const known = [...ctx.existingStops.map((s) => s.name), ...ctx.savedPlaces];
  return { summary: object.summary, stops: orderByTime(dedupeStops(object.stops, known)) };
}
