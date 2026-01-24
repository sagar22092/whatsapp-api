import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.userId) {
      return next()
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return next()
    }

    req.user = user;
    next();
  } catch (err) {
    return next();
  }
}
