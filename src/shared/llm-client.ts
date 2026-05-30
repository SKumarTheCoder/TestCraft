import { config } from "dotenv";

config();

export type LlmProvider = "openai" | "anthropic";

interface LlmResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

function getProvider(): LlmProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error(
    "No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env"
  );
}

function getModel(purpose: "generation" | "fix"): string {
  const key =
    purpose === "generation"
      ? "TEST_GENERATION_MODEL"
      : "AUTO_FIX_MODEL";
  const override = process.env[key];
  if (override) return override;
  return getProvider() === "openai" ? "gpt-4o" : "claude-sonnet-4-20250514";
}

export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  purpose: "generation" | "fix" = "generation"
): Promise<LlmResponse> {
  const provider = getProvider();
  const model = getModel(purpose);

  if (provider === "openai") {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.3,
  });

  const content = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");

  return {
    content,
    model: response.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
