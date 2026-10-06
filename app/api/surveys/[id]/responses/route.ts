import { api, submitResponse } from "../../../../lib/server";
type Context = { params: Promise<{ id: string }> };
export const POST = (request: Request, context: Context) => api(async () => submitResponse(request, (await context.params).id));
