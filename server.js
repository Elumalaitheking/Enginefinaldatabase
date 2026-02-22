const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Engine = require('./models/Engine');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/engine_records_db';
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((error) => console.error('MongoDB connection error:', error.message));

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asStoredPath = (filename) => `uploads/${filename}`;
const asPublicPath = (storedPath) => `/${storedPath.replace(/^\/+/, '')}`;
const asDiskPath = (storedPath) => path.join(publicDir, storedPath.replace(/^\/+/, ''));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const normalizeEngine = (engineDoc) => {
  const obj = engineDoc.toObject ? engineDoc.toObject() : engineDoc;
  return {
    ...obj,
    images: (obj.images || []).map((img) => ({
      ...img,
      path: asPublicPath(img.path),
    })),
  };
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/engines', asyncHandler(async (_req, res) => {
  const engines = await Engine.find({}, { engineName: 1 }).sort({ engineName: 1 });
  res.json(engines);
}));

app.get('/api/engines/search', asyncHandler(async (req, res) => {
  const { engineName } = req.query;
  if (!engineName || !engineName.trim()) {
    return res.status(400).json({ error: 'engineName query is required' });
  }

  const engine = await Engine.findOne({
    engineName: new RegExp(`^${escapeRegex(engineName.trim())}$`, 'i'),
  });

  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  return res.json(normalizeEngine(engine));
}));

app.get('/api/engines/:id', asyncHandler(async (req, res) => {
  const engine = await Engine.findById(req.params.id);
  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }
  return res.json(normalizeEngine(engine));
}));

app.post('/api/engines', upload.array('images', 10), asyncHandler(async (req, res) => {
  const { engineName, airFilter, lastLoadedTestbed, remarks } = req.body;

  if (!engineName || !engineName.trim()) {
    return res.status(400).json({ error: 'Engine Name is required' });
  }

  const exists = await Engine.findOne({
    engineName: new RegExp(`^${escapeRegex(engineName.trim())}$`, 'i'),
  });
  if (exists) {
    return res.status(409).json({ error: 'Engine Name must be unique' });
  }

  const images = (req.files || []).map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    path: asStoredPath(file.filename),
  }));

  const engine = await Engine.create({
    engineName: engineName.trim(),
    airFilter,
    lastLoadedTestbed,
    remarks,
    images,
  });

  return res.status(201).json(normalizeEngine(engine));
}));

app.put('/api/engines/:id', upload.array('images', 10), asyncHandler(async (req, res) => {
  const { engineName, airFilter, lastLoadedTestbed, remarks } = req.body;
  const engine = await Engine.findById(req.params.id);

  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  if (engineName && engineName.trim().toLowerCase() !== engine.engineName.toLowerCase()) {
    const duplicate = await Engine.findOne({
      _id: { $ne: req.params.id },
      engineName: new RegExp(`^${escapeRegex(engineName.trim())}$`, 'i'),
    });

    if (duplicate) {
      return res.status(409).json({ error: 'Engine Name must be unique' });
    }

    engine.engineName = engineName.trim();
  }

  engine.airFilter = airFilter ?? engine.airFilter;
  engine.lastLoadedTestbed = lastLoadedTestbed ?? engine.lastLoadedTestbed;
  engine.remarks = remarks ?? engine.remarks;

  if (req.files?.length) {
    const availableSlots = Math.max(10 - engine.images.length, 0);
    const acceptedFiles = req.files.slice(0, availableSlots);
    const newImages = acceptedFiles.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      path: asStoredPath(file.filename),
    }));

    if (acceptedFiles.length < req.files.length) {
      const overflow = req.files.slice(availableSlots);
      overflow.forEach((file) => {
        const overflowPath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(overflowPath)) {
          fs.unlinkSync(overflowPath);
        }
      });
    }

    engine.images = [...engine.images, ...newImages];
  }

  await engine.save();
  return res.json(normalizeEngine(engine));
}));

app.delete('/api/engines/:id', asyncHandler(async (req, res) => {
  const engine = await Engine.findByIdAndDelete(req.params.id);
  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  (engine.images || []).forEach((img) => {
    const filePath = asDiskPath(img.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  return res.json({ message: 'Engine deleted successfully' });
}));

app.delete('/api/engines/:id/images/:imageId', asyncHandler(async (req, res) => {
  const engine = await Engine.findById(req.params.id);
  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  const image = engine.images.id(req.params.imageId);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const filePath = asDiskPath(image.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  image.deleteOne();
  await engine.save();
  return res.json({ message: 'Image deleted successfully' });
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error?.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id format' });
  }

  return res.status(500).json({ error: error.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
