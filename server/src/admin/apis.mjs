import { Router } from "express";
import presentingRouter from "./apis/presenting.mjs";
import visualizationRouter from "./apis/visualization.mjs";
import teamManagementRouter from "./apis/team-management.mjs";

const adminRouter = Router();

adminRouter.use(presentingRouter);
adminRouter.use(visualizationRouter);
adminRouter.use(teamManagementRouter);

export default adminRouter;
