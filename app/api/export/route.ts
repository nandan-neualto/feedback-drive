import { api, exportResponses } from "../../lib/server";
export const GET = (request: Request) => api(() => exportResponses(request));
