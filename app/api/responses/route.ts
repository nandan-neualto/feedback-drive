import { api, listResponses } from "../../lib/server";
export const GET = (request: Request) => api(() => listResponses(request));
