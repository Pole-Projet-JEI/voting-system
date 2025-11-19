import { Router } from "express";
import presentingRouter from "./apis/presenting.mjs";
import visualizationRouter from "./apis/visualization.mjs";

const adminRouter = Router();

adminRouter.use(presentingRouter);
adminRouter.use(visualizationRouter);

export default adminRouter;
