// ==========================================
// PLANS MODULE
// ==========================================

let plans = [];
let plansFilter = 'all'; // all | pending | completed

async function initPlans() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('plans').orderBy('date', 'desc').get();
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

    // Filter plans by status
    let filteredPlans = plans;
    if (plansFilter === 'pending') {
        filteredPlans = plans.filter(p => p.status === 'pending' || !p.status);
    } else if (plansFilter === 'completed') {
        filteredPlans = plans.filter(p => p.status === 'completed');
    }

    if (filteredPlans.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
    }

    emptyState.style.display = 'none';

    // Calculate stats
    const pending = plans.filter(p => p.status === 'pending' || !p.status).length;
    const completed = plans.filter(p => p.status === 'completed').length;

    // Render timeline
    container.innerHTML = `
        <div class="stats-card">
            <i class="fas fa-list-check"></i>
            <div class="stats-number">${plans.length}</div>
            <div class="stats-text">${completed} fets · ${pending} pendents</div>
        </div>

        <div class="toggle-filters">
            <button class="toggle-btn ${plansFilter === 'all' ? 'active' : ''}" onclick="filterPlans('all')">
                <i class="fas fa-list"></i> Tots
            </button>
            <button class="toggle-btn ${plansFilter === 'pending' ? 'active' : ''}" onclick="filterPlans('pending')">
                <i class="fas fa-clock"></i> Pendents (${pending})
            </button>
            <button class="toggle-btn ${plansFilter === 'completed' ? 'active' : ''}" onclick="filterPlans('completed')">
                <i class="fas fa-check-circle"></i> Fets (${completed})
            </button>
        </div>

        <div class="timeline-container">
            <div class="timeline-line"></div>
            ${filteredPlans.map(p => {
                const isPending = p.status === 'pending' || !p.status;
                return `
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <div class="timeline-card ${isPending ? 'pending' : 'completed'}">
                            <div class="gradient-header"></div>
                            <div style="padding: 1rem;">
                                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem">
                                    <h3 style="margin:0;font-size:1.1rem;">${escapeHtml(p.title)}</h3>
                                    <span class="status-badge ${isPending ? 'pending' : 'completed'}">
                                        <i class="fas fa-${isPending ? 'clock' : 'check-circle'}"></i>
                                        ${isPending ? 'Pendent' : 'Fet'}
                                    </span>
                                </div>
                                ${p.category ? `<span class="category-badge ${p.category}">${getCategoryName(p.category)}</span>` : ''}
                                ${p.date ? `<div class="date-badge"><i class="fas fa-calendar"></i> ${formatDate(p.date)}</div>` : ''}
                                ${p.location ? `<div style="font-size:0.9rem;color:var(--text-light);margin-top:0.5rem"><i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${escapeHtml(p.location)}</div>` : ''}
                                ${p.description ? `<p style="color:var(--text-light);margin-top:0.8rem;font-size:0.9rem">${escapeHtml(p.description)}</p>` : ''}
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;gap:0.5rem;flex-wrap:wrap;">
                                    ${isPending ? `<button class="btn-mark-done" onclick="markPlanAsCompleted('${p.id}')"><i class="fas fa-check"></i> Marcar com a fet</button>` : ''}
                                    <div style="display:flex;gap:0.5rem;margin-left:auto;">
                                        <button class="btn-icon" onclick="editPlan('${p.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-icon delete" onclick="deletePlan('${p.id}')" title="Eliminar">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function filterPlans(filter) {
    plansFilter = filter;
    renderPlans();
}

function getCategoryName(category) {
    const categories = {
        aniversari: 'Aniversari',
        viatge: 'Viatge',
        cultura: 'Cultura',
        natura: 'Natura',
        especial: 'Especial',
        tradicio: 'Tradició',
        activitat: 'Activitat'
    };
    return categories[category] || category;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('ca-ES', options);
}

async function markPlanAsCompleted(id) {
    showLoading();

    try {
        await db.collection('plans').doc(id).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const idx = plans.findIndex(p => p.id === id);
        if (idx !== -1) {
            plans[idx].status = 'completed';
            plans[idx].completedAt = new Date();
        }
        
        renderPlans();
        showToast("Pla marcat com a fet! 🎉", "success");
    } catch (err) {
        console.error("Error marking plan as completed:", err);
        showToast("Error marcant el pla com a fet", "error");
    } finally {
        hideLoading();
    }
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
                <label for="p-category">Categoria</label>
                <select id="p-category">
                    <option value="">Sense categoria</option>
                    <option value="aniversari" ${isEdit && plan.category === 'aniversari' ? 'selected' : ''}>Aniversari</option>
                    <option value="viatge" ${isEdit && plan.category === 'viatge' ? 'selected' : ''}>Viatge</option>
                    <option value="cultura" ${isEdit && plan.category === 'cultura' ? 'selected' : ''}>Cultura</option>
                    <option value="natura" ${isEdit && plan.category === 'natura' ? 'selected' : ''}>Natura</option>
                    <option value="especial" ${isEdit && plan.category === 'especial' ? 'selected' : ''}>Especial</option>
                    <option value="tradicio" ${isEdit && plan.category === 'tradicio' ? 'selected' : ''}>Tradició</option>
                    <option value="activitat" ${isEdit && plan.category === 'activitat' ? 'selected' : ''}>Activitat</option>
                </select>
            </div>
            <div class="form-group">
                <label for="p-status">Estat *</label>
                <select id="p-status" required>
                    <option value="pending" ${!isEdit || !plan.status || plan.status === 'pending' ? 'selected' : ''}>Pendent</option>
                    <option value="completed" ${isEdit && plan.status === 'completed' ? 'selected' : ''}>Fet</option>
                </select>
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
    const category = document.getElementById('p-category').value;
    const status = document.getElementById('p-status').value;
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
        category,
        status: status || 'pending',
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
