import { Router } from "express";
import { login, logout, me, register } from "../controllers/authController.js";

const authRouter = Router();

authRouter.post("/login", login);

authRouter.post("/register", register);

authRouter.get('/profile', me);

authRouter.get("/logout", logout);

export default authRouter;
