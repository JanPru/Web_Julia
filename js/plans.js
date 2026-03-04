// ==========================================
// PLANS MODULE
// ==========================================

let plans = [];

async function initPlans() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('plans').orderBy('createdAt', 'desc').get();
        plans = [];
        snapshot.forEach(doc => {
            plans.push({ id: doc.id, ...doc.data() });
        });
        renderPlans();
    } catch (err) {
        console.error("Error loading plans:", err);
    }
}

function renderPlans() {
    const container = document.getElementById('plans-list');
    const emptyState = document.getElementById('plans-empty');

    if (plans.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
    }

    container.innerHTML = plans.map(p => `
        <div class="item-card" data-id="${p.id}">
            <div class="card-header">
                <span class="card-title">${escapeHtml(p.title)}</span>
            </div>
            ${p.date ? `<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.3rem"><i class="fas fa-calendar" style="color:var(--purple)"></i> ${escapeHtml(p.date)}</div>` : ''}
            ${p.location ? `<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.5rem"><i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${escapeHtml(p.location)}</div>` : ''}
            ${p.description ? `<p class="card-comment">"${escapeHtml(p.description)}"</p>` : ''}
            <div class="card-actions">
                <button class="btn-icon" onclick="editPlan('${p.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deletePlan('${p.id}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openPlanModal(editId = null) {
    const plan = editId ? plans.find(p => p.id === editId) : null;
    const isEdit = !!plan;

    const content = `
        <h3>${isEdit ? 'Editar Pla' : 'Nou Pla'}</h3>
        <form onsubmit="savePlan(event, '${editId || ''}')">
            <div class="form-group">
                <label for="p-title">Títol del Pla *</label>
                <input type="text" id="p-title" placeholder="Ex: Escapada a la muntanya" value="${isEdit ? escapeHtml(plan.title) : ''}" required>
            </div>
            <div class="form-group">
                <label for="p-date">Data</label>
                <input type="date" id="p-date" value="${isEdit && plan.date ? plan.date : ''}">
            </div>
            <div class="form-group">
                <label for="p-location">Ubicació</label>
                <input type="text" id="p-location" placeholder="Ex: Pirineus, Espanya" value="${isEdit ? escapeHtml(plan.location || '') : ''}">
            </div>
            <div class="form-group">
                <label for="p-description">Descripció</label>
                <textarea id="p-description" placeholder="Què vam fer? Què va passar?">${isEdit ? escapeHtml(plan.description || '') : ''}</textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${isEdit ? 'Guardar' : 'Afegir'}
                </button>
            </div>
        </form>
    `;

    openModal(content);
}

function editPlan(id) {
    openPlanModal(id);
}

async function savePlan(e, editId) {
    e.preventDefault();

    const title = document.getElementById('p-title').value.trim();
    const date = document.getElementById('p-date').value;
    const location = document.getElementById('p-location').value.trim();
    const description = document.getElementById('p-description').value.trim();

    if (!title) {
        showToast("El títol és obligatori", "error");
        return;
    }

    closeModal();
    showLoading();

    const data = {
        title,
        date,
        location,
        description,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editId) {
            await db.collection('plans').doc(editId).update(data);
            const idx = plans.findIndex(p => p.id === editId);
            if (idx !== -1) plans[idx] = { ...plans[idx], ...data };
            showToast("Pla actualitzat!", "success");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('plans').add(data);
            plans.unshift({ id: docRef.id, ...data });
            showToast("Pla afegit!", "success");
        }
        renderPlans();
    } catch (err) {
        console.error("Error saving plan:", err);
        showToast("Error desant el pla", "error");
    } finally {
        hideLoading();
    }
}

async function deletePlan(id) {
    if (!confirm("Segur que vols eliminar aquest pla?")) return;

    showLoading();

    try {
        await db.collection('plans').doc(id).delete();
        plans = plans.filter(p => p.id !== id);
        renderPlans();
        showToast("Pla eliminat", "success");
    } catch (err) {
        console.error("Error deleting plan:", err);
        showToast("Error eliminant el pla", "error");
    } finally {
        hideLoading();
    }
}
