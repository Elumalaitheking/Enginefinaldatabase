const mongoose = require('mongoose');

const engineSchema = new mongoose.Schema(
  {
    engineName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    airFilter: {
      type: String,
      trim: true,
      default: '',
    },
    lastLoadedTestbed: {
      type: String,
      trim: true,
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    images: [
      {
        filename: String,
        originalName: String,
        path: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Engine', engineSchema);
