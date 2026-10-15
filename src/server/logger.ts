import pino from "pino";
import { isDev } from "./config";

export const logger = pino({ level: isDev ? "debug" : "info" });
