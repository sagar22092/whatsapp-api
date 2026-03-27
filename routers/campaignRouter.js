import { Router } from "express";
import {
  createCampaign,
  getCampaigns,
  updateCampaignStatus,
  deleteCampaign
} from "../controllers/campaignController.js";

const campaignRouter = Router();

// Endpoints (Assuming `authenticate` middleware is mounted on parent `/api/campaign`)
campaignRouter.post("/", createCampaign);
campaignRouter.get("/", getCampaigns);
campaignRouter.put("/:id/status", updateCampaignStatus);
campaignRouter.delete("/:id", deleteCampaign);

export default campaignRouter;
