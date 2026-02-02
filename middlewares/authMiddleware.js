import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.userId) {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (err) {
    req.user = null;
    return next();
  }
}
