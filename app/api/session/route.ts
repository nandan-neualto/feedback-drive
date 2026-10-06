import { api, json, session } from "../../lib/server";
export const GET = (request: Request) => api(async () => json(await session(request)));
