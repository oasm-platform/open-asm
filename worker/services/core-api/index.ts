import { Api } from "./api";

const coreApi = new Api({
  baseURL: process.env.CORE_API_URL,
});

export default coreApi;
