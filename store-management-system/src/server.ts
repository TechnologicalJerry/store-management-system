import express, { Request, Response } from "express";
import dotenv from "dotenv";
import config from "config";
import responseTime from "response-time";
import connect from "./utils/connect";
import logger from "./utils/logger";
import routes from "./routes";
import deserializeUser from "./middleware/deserializeUser";
import { restResponseTimeHistogram, startMetricsServer } from "./utils/metrics";
import swaggerDocs from "./utils/swagger";

dotenv.config();

const port = config.get<number>("port");

const server = express();

server.use(express.json());

server.use(deserializeUser);

server.use(
  responseTime((req: Request, res: Response, time: number) => {
    if (req?.route?.path) {
      restResponseTimeHistogram.observe(
        {
          method: req.method,
          route: req.route.path,
          status_code: res.statusCode,
        },
        time * 1000
      );
    }
  })
);

server.listen(port, async () => {
  logger.info(`Application Server is running at http://localhost:${port}`);

  await connect();

  routes(server);

  startMetricsServer();

  swaggerDocs(server, port);
});
