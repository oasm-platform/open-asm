import { Tool } from "../../tool/tool";
import { Api } from "./api";

const apiInstance = new Api({
  baseURL: process.env.API,
});

apiInstance.instance.interceptors.request.use(
  (config) => {
    config.headers.token = Tool.token;
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiInstance;
