import { api, moderateResponse } from "../../../lib/server";
type Context = { params: Promise<{ id: string }> };
export const PATCH = (request: Request, context: Context) => api(async () => moderateResponse(request, (await context.params).id));
