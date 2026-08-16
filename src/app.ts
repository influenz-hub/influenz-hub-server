import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { env, isTest } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { discoveryRouter } from "./modules/discovery/discovery.routes.js";
import { engagementRouter } from "./modules/engagement/engagement.routes.js";
import { businessRouter } from "./modules/business/business.routes.js";
import { adminRouter, reportsRouter } from "./modules/admin/admin.routes.js";

export function createApp() {
  const app = express();

  // Behind a reverse proxy in production, so rate limiting and req.ip see the
  // real client address rather than the proxy's.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
      })
    );
  }

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: () => isTest,
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/engagement", engagementRouter);
  v1.use("/me", businessRouter);
  v1.use("/admin", adminRouter);
  v1.use("/reports", reportsRouter);
  // Mounted last: its routes are the least specific (`/:slug` style paths).
  v1.use("/", discoveryRouter);

  app.use("/api/v1", v1);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
