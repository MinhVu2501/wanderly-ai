import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Generate JSON from Groq API
 */
export async function generateJsonFromGroq(prompt, { model = "llama-3.3-70b-versatile" } = {}) {
  try {
    const isOss = model.startsWith("openai/");
    const completion = await groq.chat.completions.create({
      model,
      ...(isOss ? {} : { response_format: { type: "json_object" } }),
      messages: [
        {
          role: "system",
          content:
            "Respond ONLY with a single valid JSON object. No markdown, no comments.",
        },
        { role: "user", content: prompt },
      ],
      temperature: isOss ? 0.3 : 0.4,
      max_tokens: isOss ? 8000 : 18000,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    return text;
  } catch (err) {
    console.error("Groq ERROR:", err);
    return "";
  }
}

/**
 * Repair broken JSON using Groq
 */
export async function repairJsonWithGroq(badText) {
  const prompt = `
You are a JSON repair tool.

TASK:
- Input is broken or partial JSON.
- Your job is to output ONE (1) valid JSON object.
- Do not add explanations or markdown.

BROKEN INPUT:
${String(badText || "")}
`.trim();

  const fixed = await generateJsonFromGroq(prompt, {
    model: "openai/gpt-oss-20b",
  });

  return fixed?.trim() || "";
}

