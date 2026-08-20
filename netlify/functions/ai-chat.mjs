import { handleAiRequest } from "../../server/ai-core.js";

export default async function medibridgeAiGateway(request) {
  return handleAiRequest(request, process.env);
}

export const config = {
  path: ["/api/ai-chat"]
};
