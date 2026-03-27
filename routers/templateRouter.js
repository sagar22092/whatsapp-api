import { Router } from "express";
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, useTemplate } from "../controllers/templateController.js";

const templateRouter = Router();

templateRouter.get("/", getTemplates);
templateRouter.post("/", createTemplate);
templateRouter.put("/:id", updateTemplate);
templateRouter.delete("/:id", deleteTemplate);
templateRouter.post("/:id/use", useTemplate);

export default templateRouter;
