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

const setMessage = (el, msg, isError = false) => {
  el.textContent = msg;
  el.style.color = isError ? '#b91c1c' : '#6b7280';
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
  const res = await fetch('/api/engines');
  const engines = await res.json();

  engineList.innerHTML = engines
    .map((engine) => `<li class="engine-item" onclick="window.searchByName('${engine.engineName}')">${engine.engineName}</li>`)
    .join('');
};

const searchByName = async (name) => {
  const target = name || searchInput.value.trim();
  if (!target) return;

  const res = await fetch(`/api/engines/search?engineName=${encodeURIComponent(target)}`);
  if (!res.ok) {
    detailContainer.classList.add('hidden');
    setMessage(searchMessage, 'Engine not found.', true);
    return;
  }

  const engine = await res.json();
  setMessage(searchMessage, 'Engine loaded successfully.');
  renderEngineDetails(engine);
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage(formMessage, 'Saving...');

  const data = new FormData(form);
  const id = engineIdInput.value;
  const endpoint = id ? `/api/engines/${id}` : '/api/engines';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(endpoint, {
    method,
    body: data,
  });

  const payload = await res.json();

  if (!res.ok) {
    setMessage(formMessage, payload.error || 'Failed to save engine.', true);
    return;
  }

  setMessage(formMessage, id ? 'Engine updated successfully.' : 'Engine saved successfully.');
  resetForm();
  await loadEngines();
  renderEngineDetails(payload);
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
  const res = await fetch(`/api/engines/${id}`);
  if (!res.ok) return;

  const engine = await res.json();
  engineIdInput.value = engine._id;
  form.engineName.value = engine.engineName;
  form.airFilter.value = engine.airFilter || '';
  form.lastLoadedTestbed.value = engine.lastLoadedTestbed || '';
  form.remarks.value = engine.remarks || '';
  setMessage(formMessage, 'Editing mode enabled. Save to apply changes.');
};

window.deleteEngine = async (id) => {
  const confirmed = window.confirm('Delete this engine and all images?');
  if (!confirmed) return;

  const res = await fetch(`/api/engines/${id}`, { method: 'DELETE' });
  const payload = await res.json();
  if (!res.ok) {
    setMessage(searchMessage, payload.error || 'Delete failed.', true);
    return;
  }

  detailContainer.classList.add('hidden');
  setMessage(searchMessage, payload.message);
  await loadEngines();
};

window.deleteImage = async (engineId, imageId) => {
  const res = await fetch(`/api/engines/${engineId}/images/${imageId}`, { method: 'DELETE' });
  const payload = await res.json();
  if (!res.ok) {
    setMessage(searchMessage, payload.error || 'Image delete failed.', true);
    return;
  }

  setMessage(searchMessage, payload.message);
  await searchByName(searchInput.value.trim() || detailContainer.querySelector('h3')?.textContent);
};

loadEngines();
