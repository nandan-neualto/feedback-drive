import { api, getFile } from "../../../lib/server";
type Context = { params: Promise<{ key: string }> };
export const GET = (request: Request, context: Context) => api(async () => getFile(request, (await context.params).key));
