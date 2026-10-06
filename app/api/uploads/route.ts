import { api, uploadPhoto } from "../../lib/server";
export const POST = (request: Request) => api(() => uploadPhoto(request));
