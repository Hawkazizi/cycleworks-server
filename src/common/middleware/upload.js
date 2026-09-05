import multer from "multer";
import fs from "fs";
import path from "path";

// ✅ SECURITY: upload limits + type whitelist + filename sanitization
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".webp", ".gif",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mimeOk =
    /^image\//.test(file.mimetype) ||
    /^application\/pdf$/.test(file.mimetype) ||
    /^application\/(msword|vnd\.openxmlformats-officedocument)/.test(
      file.mimetype,
    );
  if (ext && ALLOWED_EXTENSIONS.includes(ext) && mimeOk) return cb(null, true);
  cb(new Error("File type not allowed"));
};

// dynamic storage: for now, all go under uploads/temp
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), "uploads", "temp");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // ✅ SECURITY: never trust the client filename — strip any path components
    // and unsafe characters to prevent path traversal / overwrite attacks.
    const safeName = (path.basename(file.originalname || "file"))
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-80);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter,
});

export default upload;
