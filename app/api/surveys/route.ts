import { api, createSurvey, listSurveys } from "../../lib/server";
export const GET = (request: Request) => api(() => listSurveys(request));
export const POST = (request: Request) => api(() => createSurvey(request));
