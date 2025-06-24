import { Api } from "./api";

export default new Api({
  baseURL: process.env.CORE_API_URL,
});
