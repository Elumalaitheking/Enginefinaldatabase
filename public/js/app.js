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

const API_BASE = (window.__ENGINE_API_BASE__ || '').replace(/\/$/, '');

const api = (path) => `${API_BASE}${path}`;

const setMessage = (el, msg, isError = false) => {
  el.textContent = msg;
  el.style.color = isError ? '#b91c1c' : '#6b7280';
};

const extractError = async (res, fallback) => {
  try {
    const body = await res.json();
    return body.error || fallback;
  } catch {
    return fallback;
  }
};

const resetForm = () => {
  form.reset();
  engineIdInput.value = '';
};

const renderEngineDetails = (engine) => {
  detailContainer.classList.remove('hidden');
  detailContainer.innerHTML = `
    <h3>${engine.engineName}</h3>
    <div class="detail-grid">
      <p><strong>Air Filter:</strong> ${engine.airFilter || 'N/A'}</p>
      <p><strong>Last Loaded Testbed:</strong> ${engine.lastLoadedTestbed || 'N/A'}</p>
      <p><strong>Remarks:</strong> ${engine.remarks || 'N/A'}</p>
      <p><strong>Total Images:</strong> ${engine.images.length}</p>
    </div>
    <div class="button-row">
      <button class="btn" onclick="window.populateForEdit('${engine._id}')">Edit</button>
      <button class="btn" onclick="window.deleteEngine('${engine._id}')">Delete</button>
    </div>
    <div class="gallery">
      ${
        engine.images.length
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
    const res = await fetch(api('/api/engines'));
    if (!res.ok) {
      const msg = await extractError(res, 'Failed to load engines list.');
      setMessage(searchMessage, msg, true);
      return;
    }

    const engines = await res.json();
    engineList.innerHTML = engines
      .map((engine) => `<li class="engine-item" onclick="window.searchByName('${engine.engineName}')">${engine.engineName}</li>`)
      .join('');
  } catch {
    setMessage(
      searchMessage,
      'Backend API is unreachable. For GitHub Pages, set window.__ENGINE_API_BASE__ to your backend URL.',
      true
    );
  }
};

const searchByName = async (name) => {
  const target = name || searchInput.value.trim();
  if (!target) return;

  try {
    const res = await fetch(api(`/api/engines/search?engineName=${encodeURIComponent(target)}`));
    if (!res.ok) {
      detailContainer.classList.add('hidden');
      setMessage(searchMessage, await extractError(res, 'Engine not found.'), true);
      return;
    }

    const engine = await res.json();
    setMessage(searchMessage, 'Engine loaded successfully.');
    renderEngineDetails(engine);
  } catch {
    setMessage(searchMessage, 'Search failed: backend API unavailable.', true);
  }
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage(formMessage, 'Saving...');

  const data = new FormData(form);
  const id = engineIdInput.value;
  const endpoint = id ? api(`/api/engines/${id}`) : api('/api/engines');
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(endpoint, {
      method,
      body: data,
    });

    if (!res.ok) {
      setMessage(formMessage, await extractError(res, 'Failed to save engine.'), true);
      return;
    }

    const payload = await res.json();
    setMessage(formMessage, id ? 'Engine updated successfully.' : 'Engine saved successfully.');
    resetForm();
    await loadEngines();
    renderEngineDetails(payload);
  } catch {
    setMessage(formMessage, 'Save failed: backend API unavailable.', true);
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
    const res = await fetch(api(`/api/engines/${id}`));
    if (!res.ok) {
      setMessage(formMessage, await extractError(res, 'Failed to load engine for edit.'), true);
      return;
    }

    const engine = await res.json();
    engineIdInput.value = engine._id;
    form.engineName.value = engine.engineName;
    form.airFilter.value = engine.airFilter || '';
    form.lastLoadedTestbed.value = engine.lastLoadedTestbed || '';
    form.remarks.value = engine.remarks || '';
    setMessage(formMessage, 'Editing mode enabled. Save to apply changes.');
  } catch {
    setMessage(formMessage, 'Edit failed: backend API unavailable.', true);
  }
};

window.deleteEngine = async (id) => {
  const confirmed = window.confirm('Delete this engine and all images?');
  if (!confirmed) return;

  try {
    const res = await fetch(api(`/api/engines/${id}`), { method: 'DELETE' });
    if (!res.ok) {
      setMessage(searchMessage, await extractError(res, 'Delete failed.'), true);
      return;
    }

    const payload = await res.json();
    detailContainer.classList.add('hidden');
    setMessage(searchMessage, payload.message);
    await loadEngines();
  } catch {
    setMessage(searchMessage, 'Delete failed: backend API unavailable.', true);
  }
};

window.deleteImage = async (engineId, imageId) => {
  try {
    const res = await fetch(api(`/api/engines/${engineId}/images/${imageId}`), { method: 'DELETE' });
    if (!res.ok) {
      setMessage(searchMessage, await extractError(res, 'Image delete failed.'), true);
      return;
    }

    const payload = await res.json();
    setMessage(searchMessage, payload.message);
    await searchByName(searchInput.value.trim() || detailContainer.querySelector('h3')?.textContent);
  } catch {
    setMessage(searchMessage, 'Image delete failed: backend API unavailable.', true);
  }
};

loadEngines();
