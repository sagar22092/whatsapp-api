import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { authenticate } from "../middlewares/authMiddleware.js";

const uploadRouter = Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
fs.ensureDirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per file
});

uploadRouter.post("/", authenticate, upload.single("media"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  // Determine mediaType based on mimetype
  let mediaType = "document";
  const mime = req.file.mimetype;
  if (mime.startsWith("image/")) mediaType = "image";
  else if (mime.startsWith("video/")) mediaType = "video";
  else if (mime.startsWith("audio/")) mediaType = "audio";

  const publicUrl = `/uploads/${req.file.filename}`;

  res.json({
    success: true,
    url: publicUrl,
    mediaType: mediaType,
    message: "File uploaded successfully",
  });
});

export default uploadRouter;
