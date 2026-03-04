// ==========================================
// PLANS MODULE
// ==========================================

let plans = [];
let currentPlanFilter = 'all';

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

    const filtered = currentPlanFilter === 'all'
        ? plans
        : plans.filter(p => p.status === currentPlanFilter);

    if (filtered.length === 0) {
        container.innerHTML = '';
        if (plans.length === 0) {
            container.appendChild(emptyState);
            emptyState.style.display = '';
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-filter"></i>
                    <p>No hi ha resultats per aquest filtre.</p>
                </div>
            `;
        }
        return;
    }

    container.innerHTML = filtered.map(p => {
        const isCompleted = p.status === 'completed';
        const dateStr = p.date ? formatDate(p.date) : '';
        
        return `
        <div class="item-card plan-card ${isCompleted ? 'completed' : ''}" data-id="${p.id}">
            <div class="card-header">
                <span class="card-title">${escapeHtml(p.title)}</span>
                <button class="btn-toggle-status" onclick="togglePlanStatus('${p.id}')" title="${isCompleted ? 'Marcar com pendent' : 'Marcar com fet'}">
                    <i class="fas fa-${isCompleted ? 'undo' : 'check'}"></i>
                </button>
            </div>
            ${dateStr ? `<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.5rem"><i class="far fa-calendar" style="color:var(--purple)"></i> ${dateStr}</div>` : ''}
            ${p.description ? `<p class="card-comment">${escapeHtml(p.description)}</p>` : ''}
            <div class="plan-status-badge ${p.status}">
                <i class="fas fa-${isCompleted ? 'check-circle' : 'clock'}"></i>
                ${isCompleted ? 'Fet' : 'Pendent'}
            </div>
            <div class="card-actions">
                <button class="btn-icon" onclick="editPlan('${p.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deletePlan('${p.id}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `}).join('');
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('ca-CA', options);
}

function filterPlans(filter) {
    currentPlanFilter = filter;

    // Update active tab
    document.querySelectorAll('#planFilters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderPlans();
}

function openPlanModal(editId = null) {
    const plan = editId ? plans.find(p => p.id === editId) : null;
    const isEdit = !!plan;

    const content = `
        <h3>${isEdit ? 'Editar Plan' : 'Nou Plan'}</h3>
        <form onsubmit="savePlan(event, '${editId || ''}')">
            <div class="form-group">
                <label for="plan-title">Títol *</label>
                <input type="text" id="plan-title" placeholder="Ex: Viatge a Islàndia" value="${isEdit ? escapeHtml(plan.title) : ''}" required>
            </div>
            <div class="form-group">
                <label for="plan-date">Data (opcional)</label>
                <input type="date" id="plan-date" value="${isEdit && plan.date ? plan.date : ''}">
            </div>
            <div class="form-group">
                <label for="plan-description">Descripció</label>
                <textarea id="plan-description" placeholder="Detalls del plan...">${isEdit ? escapeHtml(plan.description || '') : ''}</textarea>
            </div>
            <div class="form-group">
                <label for="plan-status">Estat</label>
                <select id="plan-status">
                    <option value="pending" ${isEdit && plan.status === 'pending' ? 'selected' : ''}>Pendent</option>
                    <option value="completed" ${isEdit && plan.status === 'completed' ? 'selected' : ''}>Fet</option>
                </select>
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

    const title = document.getElementById('plan-title').value.trim();
    const date = document.getElementById('plan-date').value;
    const description = document.getElementById('plan-description').value.trim();
    const status = document.getElementById('plan-status').value;

    if (!title) {
        showToast("El títol és obligatori", "error");
        return;
    }

    closeModal();
    showLoading();

    const data = {
        title,
        date: date || null,
        description,
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editId) {
            await db.collection('plans').doc(editId).update(data);
            const idx = plans.findIndex(p => p.id === editId);
            if (idx !== -1) plans[idx] = { ...plans[idx], ...data };
            showToast("Plan actualitzat!", "success");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('plans').add(data);
            plans.unshift({ id: docRef.id, ...data });
            showToast("Plan afegit!", "success");
        }
        renderPlans();
    } catch (err) {
        console.error("Error saving plan:", err);
        showToast("Error desant el plan", "error");
    } finally {
        hideLoading();
    }
}

async function togglePlanStatus(id) {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;

    const newStatus = plan.status === 'completed' ? 'pending' : 'completed';

    showLoading();

    try {
        await db.collection('plans').doc(id).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        plan.status = newStatus;
        renderPlans();
        
        const statusText = newStatus === 'completed' ? 'fet' : 'pendent';
        showToast(`Plan marcat com ${statusText}`, "success");
    } catch (err) {
        console.error("Error updating plan status:", err);
        showToast("Error actualitzant el plan", "error");
    } finally {
        hideLoading();
    }
}

async function deletePlan(id) {
    if (!confirm("Segur que vols eliminar aquest plan?")) return;

    showLoading();

    try {
        await db.collection('plans').doc(id).delete();
        plans = plans.filter(p => p.id !== id);
        renderPlans();
        showToast("Plan eliminat", "success");
    } catch (err) {
        console.error("Error deleting plan:", err);
        showToast("Error eliminant el plan", "error");
    } finally {
        hideLoading();
    }
}
