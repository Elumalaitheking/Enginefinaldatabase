const form = document.getElementById('engine-form');
const resetBtn = document.getElementById('reset-form');
const formMessage = document.getElementById('form-message');
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const searchMessage = document.getElementById('search-message');
const engineList = document.getElementById('engine-list');
const detailContainer = document.getElementById('engine-detail');
const engineIdInput = document.getElementById('engine-id');
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const closeModal = document.getElementById('close-modal');
const deploymentNote = document.getElementById('deployment-note');

const API_BASE = (window.__ENGINE_API_BASE__ || '').replace(/\/$/, '');
const api = (path) => `${API_BASE}${path}`;
const STORAGE_KEY = 'engine_records_v1';

let dataProvider;
let currentMode = 'api';

const setMessage = (el, msg, isError = false) => {
  el.textContent = msg;
  el.style.color = isError ? '#b91c1c' : '#6b7280';
};

const resetForm = () => {
  form.reset();
  engineIdInput.value = '';
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const toDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getStored = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const setStored = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

const localProvider = {
  async list() {
    const all = getStored();
    return all.map(({ _id, engineName }) => ({ _id, engineName })).sort((a, b) => a.engineName.localeCompare(b.engineName));
  },
  async search(engineName) {
    const target = engineName.trim().toLowerCase();
    const found = getStored().find((e) => e.engineName.toLowerCase() === target);
    if (!found) throw new Error('Engine not found');
    return found;
  },
  async get(id) {
    const found = getStored().find((e) => e._id === id);
    if (!found) throw new Error('Engine not found');
    return found;
  },
  async save(formData, id) {
    const all = getStored();
    const engineName = (formData.get('engineName') || '').trim();
    if (!engineName) throw new Error('Engine Name is required');

    const duplicate = all.find((e) => e.engineName.toLowerCase() === engineName.toLowerCase() && e._id !== id);
    if (duplicate) throw new Error('Engine Name must be unique');

    let engine = id ? all.find((e) => e._id === id) : null;
    if (id && !engine) throw new Error('Engine not found');

    if (!engine) {
      engine = { _id: uid(), engineName, airFilter: '', lastLoadedTestbed: '', remarks: '', images: [] };
      all.push(engine);
    }

    engine.engineName = engineName;
    engine.airFilter = formData.get('airFilter') || '';
    engine.lastLoadedTestbed = formData.get('lastLoadedTestbed') || '';
    engine.remarks = formData.get('remarks') || '';

    const files = formData.getAll('images').filter((f) => f && f.size);
    const freeSlots = Math.max(10 - engine.images.length, 0);
    const accepted = files.slice(0, freeSlots);
    const imgData = await Promise.all(
      accepted.map(async (file) => ({
        _id: uid(),
        originalName: file.name,
        filename: file.name,
        path: await toDataURL(file),
      }))
    );

    engine.images = [...engine.images, ...imgData];
    setStored(all);
    return engine;
  },
  async deleteEngine(id) {
    const all = getStored();
    const next = all.filter((e) => e._id !== id);
    if (next.length === all.length) throw new Error('Engine not found');
    setStored(next);
    return { message: 'Engine deleted successfully' };
  },
  async deleteImage(engineId, imageId) {
    const all = getStored();
    const engine = all.find((e) => e._id === engineId);
    if (!engine) throw new Error('Engine not found');
    const before = engine.images.length;
    engine.images = engine.images.filter((img) => img._id !== imageId);
    if (before === engine.images.length) throw new Error('Image not found');
    setStored(all);
    return { message: 'Image deleted successfully' };
  },
};

const apiProvider = {
  async list() {
    const res = await fetch(api('/api/engines'));
    if (!res.ok) throw new Error('Failed to load engines list.');
    return res.json();
  },
  async search(engineName) {
    const res = await fetch(api(`/api/engines/search?engineName=${encodeURIComponent(engineName)}`));
    if (!res.ok) throw new Error('Engine not found');
    return res.json();
  },
  async get(id) {
    const res = await fetch(api(`/api/engines/${id}`));
    if (!res.ok) throw new Error('Engine not found');
    return res.json();
  },
  async save(formData, id) {
    const res = await fetch(id ? api(`/api/engines/${id}`) : api('/api/engines'), {
      method: id ? 'PUT' : 'POST',
      body: formData,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Failed to save engine.');
    return body;
  },
  async deleteEngine(id) {
    const res = await fetch(api(`/api/engines/${id}`), { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Delete failed.');
    return body;
  },
  async deleteImage(engineId, imageId) {
    const res = await fetch(api(`/api/engines/${engineId}/images/${imageId}`), { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Image delete failed.');
    return body;
  },
};

const initProvider = async () => {
  try {
    const res = await fetch(api('/health'));
    if (!res.ok) throw new Error();
    dataProvider = apiProvider;
    currentMode = 'api';
    deploymentNote.textContent = 'Connected to backend API mode.';
  } catch {
    dataProvider = localProvider;
    currentMode = 'local';
    deploymentNote.textContent =
      'Running in LocalStorage mode (GitHub Pages compatible). Data/images are stored in this browser only.';
  }
};

const renderEngineDetails = (engine) => {
  detailContainer.classList.remove('hidden');
  detailContainer.innerHTML = `
    <h3>${engine.engineName}</h3>
    <div class="detail-grid">
      <p><strong>Air Filter:</strong> ${engine.airFilter || 'N/A'}</p>
      <p><strong>Last Loaded Testbed:</strong> ${engine.lastLoadedTestbed || 'N/A'}</p>
      <p><strong>Remarks:</strong> ${engine.remarks || 'N/A'}</p>
      <p><strong>Total Images:</strong> ${(engine.images || []).length}</p>
    </div>
    <div class="button-row">
      <button class="btn" onclick="window.populateForEdit('${engine._id}')">Edit</button>
      <button class="btn" onclick="window.deleteEngine('${engine._id}')">Delete</button>
    </div>
    <div class="gallery">
      ${
        engine.images?.length
          ? engine.images
              .map(
                (img) => `
          <div class="image-card">
            <img src="${img.path}" alt="${img.originalName}" onclick="window.openImage('${img.path}')" />
            <button class="icon-btn" onclick="window.deleteImage('${engine._id}', '${img._id}')">×</button>
          </div>`
              )
              .join('')
          : '<p>No images uploaded.</p>'
      }
    </div>
  `;
};

const loadEngines = async () => {
  try {
    const engines = await dataProvider.list();
    engineList.innerHTML = engines
      .map((engine) => `<li class="engine-item" onclick="window.searchByName('${engine.engineName}')">${engine.engineName}</li>`)
      .join('');
    if (!engines.length) setMessage(searchMessage, `No engines saved yet (${currentMode} mode).`);
  } catch (error) {
    setMessage(searchMessage, error.message || 'Failed to load engines.', true);
  }
};

const searchByName = async (name) => {
  const target = name || searchInput.value.trim();
  if (!target) return;
  try {
    const engine = await dataProvider.search(target);
    setMessage(searchMessage, 'Engine loaded successfully.');
    renderEngineDetails(engine);
  } catch (error) {
    detailContainer.classList.add('hidden');
    setMessage(searchMessage, error.message || 'Engine not found.', true);
  }
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage(formMessage, 'Saving...');
  try {
    const payload = await dataProvider.save(new FormData(form), engineIdInput.value || undefined);
    setMessage(formMessage, 'Engine saved successfully.');
    resetForm();
    await loadEngines();
    renderEngineDetails(payload);
  } catch (error) {
    setMessage(formMessage, error.message || 'Failed to save engine.', true);
  }
});

searchBtn.addEventListener('click', () => searchByName());
resetBtn.addEventListener('click', resetForm);

window.openImage = (src) => {
  modalImage.src = src;
  imageModal.classList.remove('hidden');
};

closeModal.addEventListener('click', () => imageModal.classList.add('hidden'));
imageModal.addEventListener('click', (e) => {
  if (e.target === imageModal) imageModal.classList.add('hidden');
});

window.searchByName = searchByName;

window.populateForEdit = async (id) => {
  try {
    const engine = await dataProvider.get(id);
    engineIdInput.value = engine._id;
    form.engineName.value = engine.engineName;
    form.airFilter.value = engine.airFilter || '';
    form.lastLoadedTestbed.value = engine.lastLoadedTestbed || '';
    form.remarks.value = engine.remarks || '';
    setMessage(formMessage, 'Editing mode enabled. Save to apply changes.');
  } catch (error) {
    setMessage(formMessage, error.message || 'Failed to load engine.', true);
  }
};

window.deleteEngine = async (id) => {
  const confirmed = window.confirm('Delete this engine and all images?');
  if (!confirmed) return;
  try {
    const payload = await dataProvider.deleteEngine(id);
    detailContainer.classList.add('hidden');
    setMessage(searchMessage, payload.message || 'Engine deleted successfully');
    await loadEngines();
  } catch (error) {
    setMessage(searchMessage, error.message || 'Delete failed.', true);
  }
};

window.deleteImage = async (engineId, imageId) => {
  try {
    const payload = await dataProvider.deleteImage(engineId, imageId);
    setMessage(searchMessage, payload.message || 'Image deleted successfully');
    await searchByName(searchInput.value.trim() || detailContainer.querySelector('h3')?.textContent);
  } catch (error) {
    setMessage(searchMessage, error.message || 'Image delete failed.', true);
  }
};

(async () => {
  await initProvider();
  await loadEngines();
})();
