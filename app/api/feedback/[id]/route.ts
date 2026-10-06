import { api } from "../../../lib/server";
import { archiveFeedback, moderateFeedback } from "../../../lib/feedback-server";
type Context = { params: Promise<{ id: string }> };
export const PATCH = (request: Request, context: Context) => api(async () => moderateFeedback(request, (await context.params).id));
export const DELETE = (request: Request, context: Context) => api(async () => archiveFeedback(request, (await context.params).id));
