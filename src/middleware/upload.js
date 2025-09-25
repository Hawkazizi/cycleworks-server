// src/middleware/upload.js
import multer from "multer";
import fs from "fs";
import path from "path";

// dynamic storage: organize by user later (for now, just "registration")
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // fallback folder until we know userId
    const uploadPath = path.join("uploads", "temp");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

// accept multiple files
const upload = multer({ storage });

export default upload;
