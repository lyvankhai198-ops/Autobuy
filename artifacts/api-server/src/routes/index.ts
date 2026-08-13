import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import configRouter from "./config";
import webhookRouter from "./webhook";
import mappingsRouter from "./mappings";
import sourceRouter from "./source";
import actionsRouter from "./actions";
import marketWatchesRouter from "./market-watches";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ordersRouter);
router.use(configRouter);
router.use(webhookRouter);
router.use(mappingsRouter);
router.use(sourceRouter);
router.use(actionsRouter);
router.use(marketWatchesRouter);

export default router;
