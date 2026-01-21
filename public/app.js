const API_URL = '/api/data';

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.error) {
            console.error(data.error);
            return;
        }

        renderDashboard(data);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

function renderDashboard(data) {
    const { stats, lists } = data;

    // Render Stats
    document.getElementById('inc-month').textContent = fmtCheck(stats.incomeMonth);
    document.getElementById('inc-year').textContent = fmtCheck(stats.incomeYear);

    document.getElementById('exp-month').textContent = fmtCheck(stats.expenseMonth);
    document.getElementById('exp-year').textContent = fmtCheck(stats.expenseYear);

    document.getElementById('net-month').textContent = fmtCheck(stats.incomeAfterTaxMonth);
    document.getElementById('net-year').textContent = fmtCheck(stats.incomeAfterTaxYear);

    // Render Lists
    renderList('appointment-list', lists.appointments, (item) => `
        <div class="list-item-content">
            <strong>${item[1]}</strong>
            <span>${item[2]} @ ${item[3] || 'Sin ubicación'}</span>
        </div>
    `);

    renderList('todo-list', lists.todos, (item) => `
        <div class="list-item-content">
            <strong>${item[1]}</strong>
            <span class="tag ${getPriorityClass(item[2])}">${item[2]}</span>
        </div>
    `);

    renderList('shopping-list', lists.shopping, (item) => `
        <div class="list-item-content">
            <strong>${item[1]}</strong>
            <span>${item[2] || '1'}</span>
        </div>
    `);

    renderList('idea-list', lists.ideas, (item) => `
        <div class="list-item-content">
            <span>${item[1]}</span> 
            <small>${item[2] || ''}</small>
        </div>
    `);
}

function fmtCheck(val) {
    return (val || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function renderList(elementId, items, templateFn) {
    const el = document.getElementById(elementId);
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.innerHTML = '<li class="empty-state">Nada por aquí</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = templateFn(item);
        el.appendChild(li);
    });
}

function getPriorityClass(p) {
    if (!p) return 'is-normal';
    p = p.toLowerCase();
    if (p.includes('alt') || p.includes('high')) return 'is-high';
    return 'is-normal';
}

// Auto-refresh every 60s
fetchData();
setInterval(fetchData, 60000);
