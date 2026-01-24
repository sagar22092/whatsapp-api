import { Router } from "express";
import { login, logout, register } from "../controllers/authControllers.js";
import { authenticate } from "../middlewares/authMiddlewares.js";

const authRouter = Router();

authRouter.post("/login", authenticate, login);

authRouter.post("/register", authenticate, register);

authRouter.get("/logout", authenticate, logout);

export default authRouter;
