import { api, archiveSurvey, getSurvey, updateSurvey } from "../../../lib/server";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => api(async () => getSurvey(request, (await context.params).id));
export const PATCH = (request: Request, context: Context) => api(async () => updateSurvey(request, (await context.params).id));
export const DELETE = (request: Request, context: Context) => api(async () => archiveSurvey(request, (await context.params).id));
