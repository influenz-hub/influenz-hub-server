import pino from "pino";
import { env, isProd, isTest } from "../config/env.js";

export const logger = pino({
  level: isTest ? "silent" : isProd ? "info" : "debug",
  ...(isProd
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }),
  base: { env: env.NODE_ENV },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
    ],
    remove: true,
  },
});
