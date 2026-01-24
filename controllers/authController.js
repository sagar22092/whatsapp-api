import { generateToken } from "../lib/jwtToken.js";
import User from "../models/userModel.js";

export async function register(req, res) {
  if (req.user) {
    return res.status(400).json({ error: "Already logged in" });
  }
  try {
    let { name, username, email, password } = req.body;
    if (!username || !password || !name || !email) {
      return res.status(400).send("All fields are required");
    }

    // Validate username
    const usernameRegex = /^[a-z][a-z0-9_-]*$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        error:
          "Username must start with a letter, contain only letters, numbers, underscores and hyphens",
      });
    }
    username = username.toLowerCase();

    const isUsenameExist = await User.findOne({ username });

    if (isUsenameExist) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const isEmailExist = await User.findOne({ email });
    if (isEmailExist) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const user = User.create({ name, username, email, password });

    //create jwt token and send as cookie

    const token = generateToken(user._id);
    return res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      })
      .status(201)
      .json({ message: "User registered successfully", userId: user._id });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error during registration" });
  }
}
export async function login(req, res) {
  if (req.user) {
    return res.status(400).json({ error: "Already logged in" });
  }
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const user = await User.findOne({
      $or: [{ username: login }, { email: login }],
    }).select("+password");
    if (!user) {
      return res
        .status(401)
        .json({ error: "User not found. Please register first." });
    }
    const isPasswordMatch = await user.matchPassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    //create jwt token and send as cookie
    const token = generateToken(user._id);
    return res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      })
      .status(200)
      .json({ message: "User logged in successfully", userId: user._id });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error during login" });
  }
}

export async function logout(req, res) {
  if (!req.user) {
    return res.status(400).json({ error: "Not logged in" });
  }
  return res
    .clearCookie("token")
    .status(200)
    .json({ message: "User logged out successfully" });
}
