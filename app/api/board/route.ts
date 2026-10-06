import { api, board } from "../../lib/server";
export const GET = (request: Request) => api(() => board(request));
