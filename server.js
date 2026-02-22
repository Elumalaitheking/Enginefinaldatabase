const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Engine = require('./models/Engine');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/engine_records_db';
const uploadsDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((error) => console.error('MongoDB connection error:', error.message));

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/engines', async (_req, res) => {
  const engines = await Engine.find({}, { engineName: 1 }).sort({ engineName: 1 });
  res.json(engines);
});

app.get('/api/engines/search', async (req, res) => {
  const { engineName } = req.query;
  if (!engineName) {
    return res.status(400).json({ error: 'engineName query is required' });
  }

  const engine = await Engine.findOne({
    engineName: new RegExp(`^${engineName.trim()}$`, 'i'),
  });

  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  return res.json(engine);
});

app.get('/api/engines/:id', async (req, res) => {
  const engine = await Engine.findById(req.params.id);
  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }
  return res.json(engine);
});

app.post('/api/engines', upload.array('images', 10), async (req, res) => {
  const { engineName, airFilter, lastLoadedTestbed, remarks } = req.body;

  if (!engineName || !engineName.trim()) {
    return res.status(400).json({ error: 'Engine Name is required' });
  }

  const exists = await Engine.findOne({
    engineName: new RegExp(`^${engineName.trim()}$`, 'i'),
  });
  if (exists) {
    return res.status(409).json({ error: 'Engine Name must be unique' });
  }

  const images = (req.files || []).map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    path: `/uploads/${file.filename}`,
  }));

  const engine = await Engine.create({
    engineName: engineName.trim(),
    airFilter,
    lastLoadedTestbed,
    remarks,
    images,
  });

  return res.status(201).json(engine);
});

app.put('/api/engines/:id', upload.array('images', 10), async (req, res) => {
  const { engineName, airFilter, lastLoadedTestbed, remarks } = req.body;
  const engine = await Engine.findById(req.params.id);

  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  if (engineName && engineName.trim().toLowerCase() !== engine.engineName.toLowerCase()) {
    const duplicate = await Engine.findOne({
      _id: { $ne: req.params.id },
      engineName: new RegExp(`^${engineName.trim()}$`, 'i'),
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
    const newImages = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      path: `/uploads/${file.filename}`,
    }));
    engine.images = [...engine.images, ...newImages].slice(0, 10);
  }

  await engine.save();
  return res.json(engine);
});

app.delete('/api/engines/:id', async (req, res) => {
  const engine = await Engine.findByIdAndDelete(req.params.id);
  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  engine.images.forEach((img) => {
    const filePath = path.join(__dirname, 'public', img.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  return res.json({ message: 'Engine deleted successfully' });
});

app.delete('/api/engines/:id/images/:imageId', async (req, res) => {
  const engine = await Engine.findById(req.params.id);
  if (!engine) {
    return res.status(404).json({ error: 'Engine not found' });
  }

  const image = engine.images.id(req.params.imageId);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const filePath = path.join(__dirname, 'public', image.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  image.deleteOne();
  await engine.save();
  return res.json({ message: 'Image deleted successfully' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(500).json({ error: error.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
