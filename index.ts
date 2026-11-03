import { createGateway, generateText } from "ai";

const gateway = createGateway({
  fetch: async (url, options) => {
    const endpoint = new URL(String(url));
    console.error(JSON.stringify({ event: "gateway_request", endpoint: endpoint.origin + endpoint.pathname }));
    const response = await fetch(url, options);
    console.error(JSON.stringify({ event: "gateway_response", httpStatus: response.status }));
    return response;
  },
});

try {
  const result = await generateText({
    model: gateway("meta/muse-spark-open"),
    prompt: "Invent a new holiday and describe its traditions in two sentences.",
    maxOutputTokens: 512,
    reasoning: "low",
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(45_000),
  });

  if (!result.text.trim()) throw new Error("No text returned");
  console.log(result.text);
  console.log(JSON.stringify({ model: result.response.modelId, usage: result.usage }));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    errorType: error instanceof Error ? error.name : "UnknownError",
    httpStatus: error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode : null,
    cardVerificationRequired: error instanceof Error
      && /credit card|customer_verification_required/i.test(error.message),
  }));
  process.exitCode = 1;
}
