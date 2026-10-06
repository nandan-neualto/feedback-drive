import { api } from "../../lib/server";
import { listFeedback, submitFeedback } from "../../lib/feedback-server";
export const GET = (request: Request) => api(() => listFeedback(request));
export const POST = (request: Request) => api(() => submitFeedback(request));
