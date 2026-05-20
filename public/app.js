const apiVersion = 'v64.0';

const state = {
    currentView: 'crud',
    currentAction: 'get',
    objects: [],
    files: [],
    selectedObject: null,
    describeCache: new Map(),
    orgLimits: null,
    orgStatusLastUpdated: null
};

const elements = {
    objectSelect: document.getElementById('objectSelect'),
    objectPicker: document.querySelector('.object-picker'),
    refreshOrgBtn: document.getElementById('refreshOrgBtn'),
    showMoreOrgBtn: document.getElementById('showMoreOrgBtn'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    orgStatusCards: document.getElementById('orgStatusCards'),
    orgStatusUpdated: document.getElementById('orgStatusUpdated'),
    topbarEyebrow: document.getElementById('topbarEyebrow'),
    selectedObjectSummary: document.getElementById('selectedObjectSummary'),
    pageTitle: document.getElementById('pageTitle'),
    capabilityBadge: document.getElementById('capabilityBadge'),
    endpointBox: document.getElementById('endpointBox'),
    recordIdGroup: document.getElementById('recordIdGroup'),
    recordIdInput: document.getElementById('recordIdInput'),
    requestBodyGroup: document.getElementById('requestBodyGroup'),
    requestBody: document.getElementById('requestBody'),
    executeCrudBtn: document.getElementById('executeCrudBtn'),
    describeBtn: document.getElementById('describeBtn'),
    describeSummary: document.getElementById('describeSummary'),
    queryBtn: document.getElementById('queryBtn'),
    queryInput: document.getElementById('queryInput'),
    refreshFilesBtn: document.getElementById('refreshFilesBtn'),
    filesTableBody: document.getElementById('filesTableBody'),
    fileInput: document.getElementById('fileInput'),
    fileTitleInput: document.getElementById('fileTitleInput'),
    fileRecordIdInput: document.getElementById('fileRecordIdInput'),
    uploadFileBtn: document.getElementById('uploadFileBtn'),
    filePreviewFrame: document.getElementById('filePreviewFrame'),
    previewTitle: document.getElementById('previewTitle'),
    responseContainer: document.getElementById('responseContainer'),
    responseStatus: document.getElementById('responseStatus')
};

const maxUploadBytes = 25 * 1024 * 1024;
const orgStatusRefreshMs = 600_000;
let orgStatusIntervalId = null;

function selectedApiName() {

    return state.selectedObject?.name || '';
}

function selectedLabel() {

    if(!state.selectedObject) {

        return 'sObject';
    }

    return `${state.selectedObject.label} (${state.selectedObject.name})`;
}

function showResponseStatus(status) {

    if(!elements.responseStatus) {

        return;
    }

    elements.responseStatus.textContent =
        status;

    elements.responseStatus.classList.remove(
        'status-info',
        'status-success',
        'status-warning',
        'status-error'
    );

    const statusCode =
        Number.parseInt(
            status,
            10
        );

    if(statusCode >= 200 && statusCode < 300) {

        elements.responseStatus.classList.add('status-success');

        return;
    }

    if(statusCode >= 300 && statusCode < 400) {

        elements.responseStatus.classList.add('status-info');

        return;
    }

    if(statusCode >= 400 && statusCode < 500) {

        elements.responseStatus.classList.add('status-warning');

        return;
    }

    if(statusCode >= 500) {

        elements.responseStatus.classList.add('status-error');

        return;
    }

    elements.responseStatus.classList.add('status-info');
}

function resetResponse(message, status = 'Idle') {

    showResponseStatus(status);

    if(!elements.responseContainer) {

        return;
    }

    elements.responseContainer.textContent =
        message;
}

function toggleOrgMoreMetrics() {

    const extraSection = document.getElementById('orgStatusExtra');

    if(!extraSection || !elements.showMoreOrgBtn) {

        return;
    }

    const expanded =
        extraSection.classList.toggle('expanded');

    extraSection.classList.toggle('hidden', !expanded);
    elements.showMoreOrgBtn.textContent =
        expanded ? 'Show less' :
        `Show more (${extraSection.children.length})`;
}

function updateSidebarToggle() {

    const collapsed =
        document.body.classList.contains('sidebar-collapsed');

    if(!elements.sidebarToggleBtn) {

        return;
    }

    const icon =
        elements.sidebarToggleBtn
            .querySelector('.sidebar-toggle-icon');

    if(icon) {

        icon.textContent =
            collapsed ? '☰' : '×';

        return;
    }

    elements.sidebarToggleBtn.textContent =
        collapsed ? '☰' : '×';
}

function toggleSidebar() {

    const collapsed =
        !document.body.classList.contains('sidebar-collapsed');

    document.body.classList.toggle(
        'sidebar-collapsed',
        collapsed
    );

    updateSidebarToggle();
}

function renderJson(data) {

    if(!elements.responseContainer) {

        return;
    }

    elements.responseContainer.textContent =
        JSON.stringify(
            data,
            null,
            2
        );
}

function renderError(error, status = 'Error') {

    showResponseStatus(status);

    if(!elements.responseContainer) {

        return;
    }

    elements.responseContainer.textContent =
        error.message;
}

function escapeHtml(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {

    if(!Number.isFinite(bytes)) {

        return '-';
    }

    const units =
        [
            'B',
            'KB',
            'MB',
            'GB'
        ];

    let size =
        bytes;

    let unitIndex =
        0;

    while(size >= 1024 && unitIndex < units.length - 1) {

        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {

    if(!value) {

        return '-';
    }

    return new Date(value).toLocaleString();
}

function formatLimitValue(value, key) {

    const numeric = Number(value ?? 0);

    if(Number.isNaN(numeric)) {

        return '-';
    }

    if(key === 'DataStorageMB' || key === 'FileStorageMB') {

        return `${numeric.toLocaleString()} MB`;
    }

    return numeric.toLocaleString();
}

async function parseResponse(response) {

    const text =
        await response.text();

    const data =
        text ? JSON.parse(text) : {};

    if(!response.ok) {

        const error =
            new Error(
            JSON.stringify(
                data.error || data,
                null,
                2
            )
        );

        error.status =
            response.status;

        throw error;
    }

    return data;
}

function currentCrudAction() {

    const activeTab =
        document.querySelector(
            `.method-tab[data-action="${state.currentAction}"]`
        );

    return {
        action: state.currentAction,
        method: activeTab?.dataset.method || 'GET'
    };
}

function crudEndpoint(action = state.currentAction) {

    const objectName =
        selectedApiName() || '{sObjectApiName}';

    if(action === 'create') {

        return `POST /services/data/${apiVersion}/sobjects/${objectName}`;
    }

    if(action === 'recent') {

        return `GET /services/data/${apiVersion}/sobjects/${objectName}/updated?start={startDate}&end={endDate}`;
    }

    if(action === 'deleted') {

        return `GET /services/data/${apiVersion}/sobjects/${objectName}/deleted?start={startDate}&end={endDate}`;
    }

    const methodByAction = {
        get: 'GET',
        update: 'PATCH',
        delete: 'DELETE'
    };

    return `${methodByAction[action] || 'GET'} /services/data/${apiVersion}/sobjects/${objectName}/{Id}`;
}

function describeEndpoint() {

    const objectName =
        selectedApiName() || '{sObjectApiName}';

    return `GET /services/data/${apiVersion}/sobjects/${objectName}/describe`;
}

function queryEndpoint() {

    return `GET /services/data/${apiVersion}/query?q=${encodeURIComponent(elements.queryInput.value || 'SOQL')}`;
}

function filesEndpoint() {

    return `GET /services/data/${apiVersion}/query?q=SELECT Id, Title, FileType, ContentSize FROM ContentDocument`;
}

function updateEndpoint() {

    if(state.currentView === 'describe') {

        elements.endpointBox.textContent =
            describeEndpoint();

        return;
    }

    if(state.currentView === 'query') {

        elements.endpointBox.textContent =
            queryEndpoint();

        return;
    }

    if(state.currentView === 'org') {

        elements.endpointBox.textContent =
            `GET /services/data/${apiVersion}/limits`;

        return;
    }

    if(state.currentView === 'files') {

        elements.endpointBox.textContent =
            filesEndpoint();

        return;
    }

    elements.endpointBox.textContent =
        crudEndpoint();
}

function updateObjectSummary() {

    const titleByView = {
        crud: 'sObject CRUD',
        describe: 'Describe API',
        query: 'Query API',
        org: 'Org Status',
        files: 'Salesforce Files'
    };

    elements.pageTitle.textContent =
        titleByView[state.currentView] || 'Salesforce Explorer';

    if(state.currentView === 'files' || state.currentView === 'org') {

        elements.topbarEyebrow.textContent =
            'Org overview';

    } else {

        elements.topbarEyebrow.textContent =
            'Selected sObject';
    }

    if(state.currentView === 'files') {

        elements.selectedObjectSummary.textContent =
            'Org-level ContentDocument and ContentVersion operations';

        elements.capabilityBadge.textContent =
            'Files';

        return;
    }

    if(state.currentView === 'org') {

        elements.selectedObjectSummary.textContent =
            'Org resource usage, storage, and API limit status.';

        elements.capabilityBadge.textContent =
            'Org Status';

        return;
    }

    if(!state.selectedObject) {

        elements.selectedObjectSummary.textContent =
            'Choose a Salesforce object to begin.';

        elements.capabilityBadge.textContent =
            'No Object';

        return;
    }

    const objectInfo =
        state.selectedObject;

    elements.selectedObjectSummary.textContent =
        `${objectInfo.labelPlural || objectInfo.label} uses ${objectInfo.name}`;

    elements.capabilityBadge.textContent =
        [
            objectInfo.retrieveable ? 'Read' : null,
            objectInfo.createable ? 'Create' : null,
            objectInfo.updateable ? 'Update' : null,
            objectInfo.deletable ? 'Delete' : null,
            objectInfo.queryable ? 'Query' : null
        ].filter(Boolean).join(' / ') || 'Read only';
}

function updateCrudControls() {

    const objectInfo =
        state.selectedObject;

    const capabilityByAction = {
        get: objectInfo?.retrieveable !== false,
        recent: objectInfo?.retrieveable !== false,
        deleted: objectInfo?.retrieveable !== false,
        create: Boolean(objectInfo?.createable),
        update: Boolean(objectInfo?.updateable),
        delete: Boolean(objectInfo?.deletable)
    };

    if(!capabilityByAction[state.currentAction]) {

        state.currentAction =
            Object
                .entries(capabilityByAction)
                .find(([, allowed]) => allowed)?.[0] || 'get';
    }

    document
        .querySelectorAll('.method-tab')
        .forEach(tab => {

            const allowed =
                capabilityByAction[tab.dataset.action];

            tab.disabled =
                !allowed;

            tab.classList.toggle(
                'active',
                tab.dataset.action === state.currentAction
            );
        });

    elements.recordIdGroup.classList.toggle(
        'hidden',
        [
            'create',
            'recent',
            'deleted'
        ].includes(state.currentAction)
    );

    elements.requestBodyGroup.classList.toggle(
        'hidden',
        ![
            'create',
            'update'
        ].includes(state.currentAction)
    );

    elements.queryBtn.disabled =
        Boolean(state.selectedObject) &&
        !state.selectedObject.queryable;
}

function setCurrentView(viewName) {

    state.currentView =
        viewName;

    document
        .querySelectorAll('.nav-button')
        .forEach(button => {

            button.classList.toggle(
                'active',
                button.dataset.view === viewName
            );
        });

    document
        .querySelectorAll('.view-section')
        .forEach(section => {

            section.classList.toggle(
                'active',
                section.id === `${viewName}View`
            );
        });

    const isOrgView = viewName === 'org';

    elements.objectPicker?.classList.toggle(
        'hidden',
        viewName === 'files' || isOrgView
    );

    elements.refreshOrgBtn?.classList.toggle(
        'hidden',
        !isOrgView
    );

    elements.showMoreOrgBtn?.classList.toggle(
        'hidden',
        !isOrgView
    );

    if(orgStatusIntervalId) {

        clearInterval(orgStatusIntervalId);
        orgStatusIntervalId = null;
    }

    updateObjectSummary();
    updateCrudControls();
    updateEndpoint();

    if(isOrgView) {

        resetResponse(
            'Loading org status...',
            'Loading'
        );

        loadOrgStatus();

        orgStatusIntervalId =
            setInterval(
                loadOrgStatus,
                orgStatusRefreshMs
            );

        return;
    }

    if(viewName === 'files') {

        resetResponse(
            'Salesforce Files is ready. Refresh files, upload a new file, or choose a file action.'
        );

        loadFiles();

        return;
    }

    resetResponse(
        `${elements.pageTitle.textContent} is ready for ${selectedLabel()}. Execute a request to view JSON output.`
    );
}

function defaultQueryForObject(apiName, describe) {

    const nameField =
        describe?.fields?.find(field => field.nameField)?.name;

    const fields =
        [
            'Id',
            nameField
        ].filter(Boolean);

    return `SELECT ${fields.join(', ')} FROM ${apiName} LIMIT 10`;
}

function populateObjectSelect(objects) {

    elements.objectSelect.innerHTML =
        '';

    objects.forEach(objectInfo => {

        const option =
            document.createElement('option');

        option.value =
            objectInfo.name;

        option.textContent =
            `${objectInfo.label} (${objectInfo.name})`;

        elements.objectSelect.appendChild(option);
    });
}

async function fetchDescribe(apiName) {

    if(state.describeCache.has(apiName)) {

        return state.describeCache.get(apiName);
    }

    const response =
        await fetch(
            `/api/salesforce/objects/${apiName}/describe`
        );

    const describe =
        await parseResponse(response);

    state.describeCache.set(
        apiName,
        describe
    );

    return describe;
}

function renderDescribeSummary(describe) {

    const fields =
        describe.fields || [];

    const fieldRows =
        fields
            .slice(0, 18)
            .map(field => `
                <tr>
                    <td>${field.label}</td>
                    <td><code>${field.name}</code></td>
                    <td>${field.type}</td>
                    <td>${field.createable ? 'Yes' : 'No'}</td>
                    <td>${field.updateable ? 'Yes' : 'No'}</td>
                </tr>
            `)
            .join('');

    elements.describeSummary.innerHTML =
        `
        <div class="metadata-card">
            <span>Label</span>
            <strong>${describe.label}</strong>
        </div>
        <div class="metadata-card">
            <span>API Name</span>
            <strong>${describe.name}</strong>
        </div>
        <div class="metadata-card">
            <span>Fields</span>
            <strong>${fields.length}</strong>
        </div>
        <div class="metadata-card">
            <span>Key Prefix</span>
            <strong>${describe.keyPrefix || '-'}</strong>
        </div>
        <div class="field-table-wrap">
            <table class="field-table">
                <thead>
                    <tr>
                        <th>Label</th>
                        <th>API Name</th>
                        <th>Type</th>
                        <th>Create</th>
                        <th>Update</th>
                    </tr>
                </thead>
                <tbody>${fieldRows}</tbody>
            </table>
        </div>
        `;
}

async function setSelectedObject(apiName) {

    state.selectedObject =
        state.objects.find(objectInfo =>
            objectInfo.name === apiName
        ) || null;

    updateObjectSummary();
    updateEndpoint();

    if(!apiName) {

        resetResponse(
            'Choose an sObject to begin.'
        );

        return;
    }

    try {

        const describe =
            await fetchDescribe(apiName);

        elements.queryInput.value =
            defaultQueryForObject(
                apiName,
                describe
            );

        renderDescribeSummary(describe);
        updateCrudControls();
        updateEndpoint();

        if(state.currentView !== 'org') {

            resetResponse(
                `Selected ${selectedLabel()}. Execute a ${elements.pageTitle.textContent} request to view JSON output.`
            );
        }

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

function parseRequestBody() {

    if(!elements.requestBody.value.trim()) {

        return {};
    }

    return JSON.parse(
        elements.requestBody.value
    );
}

async function executeCrud() {

    const apiName =
        selectedApiName();

    const recordId =
        elements.recordIdInput.value.trim();

    const capabilityByAction = {
        get: state.selectedObject?.retrieveable !== false,
        recent: state.selectedObject?.retrieveable !== false,
        deleted: state.selectedObject?.retrieveable !== false,
        create: Boolean(state.selectedObject?.createable),
        update: Boolean(state.selectedObject?.updateable),
        delete: Boolean(state.selectedObject?.deletable)
    };

    if(!apiName) {

        alert('Select an sObject first');

        return;
    }

    if([
        'get',
        'update',
        'delete'
    ].includes(state.currentAction) && !recordId) {

        alert('Enter a record Id');

        return;
    }

    if(!capabilityByAction[state.currentAction]) {

        alert(`${apiName} does not allow this action`);

        return;
    }

    try {

        showResponseStatus('Loading');

        const { action, method } =
            currentCrudAction();

        const urlByAction = {
            get: `/api/salesforce/sobjects/${apiName}/${recordId}`,
            recent: `/api/salesforce/sobjects/${apiName}/updated`,
            deleted: `/api/salesforce/sobjects/${apiName}/deleted`,
            create: `/api/salesforce/sobjects/${apiName}`,
            update: `/api/salesforce/sobjects/${apiName}/${recordId}`,
            delete: `/api/salesforce/sobjects/${apiName}/${recordId}`
        };

        const options = {
            method
        };

        if([
            'create',
            'update'
        ].includes(action)) {

            options.headers = {
                'Content-Type': 'application/json'
            };

            options.body =
                JSON.stringify(parseRequestBody());
        }

        const response =
            await fetch(
                urlByAction[action],
                options
            );

        const data =
            await parseResponse(response);

        showResponseStatus(String(response.status));
        renderJson(data);

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

async function executeDescribe() {

    const apiName =
        selectedApiName();

    if(!apiName) {

        alert('Select an sObject first');

        return;
    }

    try {

        showResponseStatus('Loading');

        state.describeCache.delete(apiName);

        const describe =
            await fetchDescribe(apiName);

        renderDescribeSummary(describe);
        showResponseStatus('200');
        renderJson(describe);

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

async function executeQuery() {

    const query =
        elements.queryInput.value.trim();

    if(state.selectedObject && !state.selectedObject.queryable) {

        alert(`${selectedApiName()} is not queryable`);

        return;
    }

    if(!query) {

        alert('Enter a SOQL query');

        return;
    }

    try {

        showResponseStatus('Loading');
        updateEndpoint();

        const response =
            await fetch(
                `/api/salesforce/query?q=${encodeURIComponent(query)}`
            );

        const data =
            await parseResponse(response);

        showResponseStatus(String(response.status));
        renderJson(data);

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

function metricStatusLabel(percent) {

    if(percent >= 90) {

        return 'Critical';
    }

    if(percent >= 70) {

        return 'Warning';
    }

    return 'Healthy';
}

function metricStatusClass(percent) {

    if(percent >= 90) {

        return 'status-error';
    }

    if(percent >= 70) {

        return 'status-warning';
    }

    return 'status-success';
}

function renderOrgStatus(limits) {

    const labelMap = {
        DailyApiRequests: 'API Requests',
        DataStorageMB: 'Data Storage',
        FileStorageMB: 'File Storage',
        DailyAsyncApexExecutions: 'Async Apex Executions',
        DailyBulkApiRequests: 'Daily Bulk API Batches',
        DailyWorkflowEmails: 'Daily Workflow Emails',
        DailyStreamingApiEvents: 'Streaming API Events',
        PlatformEventsPublished: 'Platform Events Published',
        HourlyAsyncReportRuns: 'Hourly Async Report Runs',
        HourlyDashboardRefreshes: 'Dashboard Refreshes',
        HourlyDashboardResults: 'Dashboard Query Results',
        HourlyDashboardStatuses: 'Dashboard Statuses',
        HourlyDashboardSyncs: 'Dashboard Syncs',
        HourlySyncIn: 'Hourly Sync In',
        HourlySyncOut: 'Hourly Sync Out',
        HourlyTimeBasedWorkflow: 'Time-Based Workflow',
        HourlyWorkflow: 'Workflow Time Triggers',
        ConcurrentAsyncGetReportInstances: 'Concurrent Async Reports'
    };

    const normalizeName = key =>
        key.replace(/([A-Z])/g, ' $1').trim();

    const metrics =
        Object.entries(limits || {})
            .map(([key, limit]) => {

                const label =
                    labelMap[key] || normalizeName(key);

                const max =
                    Number(limit.Max ?? limit.Value ?? 0);
                const remaining =
                    limit.Remaining !== undefined
                        ? Number(limit.Remaining)
                        : Number.isFinite(max) && max > 0
                            ? Number(limit.Max ?? 0) - Number(limit.Used ?? 0)
                            : null;
                const used =
                    Number(limit.Used ??
                        (remaining !== null && max > 0 ? max - remaining : undefined) ??
                        limit.Value ??
                        0);
                const percent =
                    max > 0
                        ? Math.min(100, Math.max(0, Math.round((used / max) * 100)))
                        : 0;
                const displayUsed =
                    formatLimitValue(used, key);
                const displayMax =
                    max > 0 ? formatLimitValue(max, key) : 'Unlimited';
                const description =
                    limit.Description ||
                    `${label} usage for this org.`;

                const statusLabel =
                    max > 0
                        ? metricStatusLabel(percent)
                        : 'Healthy';

                const statusClass =
                    max > 0
                        ? metricStatusClass(percent)
                        : 'status-success';

                return {
                    key,
                    label,
                    description,
                    used,
                    max,
                    remaining,
                    percent,
                    statusLabel,
                    statusClass,
                    displayUsed,
                    displayMax
                };
            })
            .filter(metric =>
                metric.used > 0 || metric.max > 0 || metric.remaining !== null
            );

    const priorityKeys = [
        'DailyApiRequests',
        'DataStorageMB',
        'FileStorageMB',
        'DailyAsyncApexExecutions',
        'DailyBulkApiRequests',
        'DailyWorkflowEmails',
        'DailyStreamingApiEvents',
        'PlatformEventsPublished'
    ];

    const priorityMetrics = metrics
        .filter(metric => priorityKeys.includes(metric.key))
        .sort((a, b) =>
            priorityKeys.indexOf(a.key) - priorityKeys.indexOf(b.key)
        );

    const otherMetrics = metrics
        .filter(metric => !priorityKeys.includes(metric.key))
        .sort((left, right) => right.percent - left.percent);

    const sortedMetrics =
        [...priorityMetrics, ...otherMetrics];

    const cards = sortedMetrics
        .map(metric => {

            const remainingText =
                metric.remaining !== null
                    ? `Remaining ${formatLimitValue(metric.remaining, metric.key)}`
                    : metric.max > 0
                        ? `Remaining ${formatLimitValue(metric.max - metric.used, metric.key)}`
                        : 'Unlimited';

            return `
                <div class="org-status-card">
                    <div class="metric-header">
                        <span class="org-status-label">${metric.label}</span>
                        <span class="metric-value">${metric.percent}% used</span>
                    </div>
                    <div>
                        <strong>${metric.displayUsed} / ${metric.displayMax}</strong>
                        <p class="org-status-label">${metric.description}</p>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${metric.percent}%;"></div>
                    </div>
                    <div class="org-status-label">
                        ${remainingText}
                    </div>
                </div>
            `;
        });

    if(!elements.orgStatusCards) {

        return;
    }

    if(!cards.length) {

        elements.orgStatusCards.innerHTML =
            '<div class="org-status-card">No org limit metrics were found.</div>';

        if(elements.showMoreOrgBtn) {
            elements.showMoreOrgBtn.classList.add('hidden');
        }

        return;
    }

    const visibleCards = cards.slice(0, 8);
    const hiddenCards = cards.slice(8);

    let extraHtml = '';

    if(hiddenCards.length) {

        extraHtml = `
            <div id="orgStatusExtra" class="org-status-hidden hidden">
                ${hiddenCards.join('')}
            </div>
        `;

        if(elements.showMoreOrgBtn) {
            elements.showMoreOrgBtn.classList.remove('hidden');
            elements.showMoreOrgBtn.classList.remove('expanded');
            elements.showMoreOrgBtn.textContent =
                `Show more (${hiddenCards.length})`;
        }
    } else {

        elements.showMoreOrgBtn?.classList.add('hidden');
    }

    elements.orgStatusCards.innerHTML =
        visibleCards.join('') + extraHtml;

    state.orgLimits = limits;
    state.orgStatusLastUpdated =
        new Date().toLocaleString();

    elements.orgStatusUpdated.textContent =
        `Last refresh: ${state.orgStatusLastUpdated}`;
}

async function loadOrgStatus() {

    if(!elements.orgStatusCards) {

        return;
    }

    try {

        showResponseStatus('Loading');

        const response =
            await fetch('/api/salesforce/limits');

        const data =
            await parseResponse(response);

        renderOrgStatus(data);
        resetResponse(
            'Org status is ready. Refresh to update or wait 10 minutes for the next refresh.'
        );
        showResponseStatus(String(response.status));

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

function renderFilesTable(files) {

    if(!files.length) {

        elements.filesTableBody.innerHTML =
            '<tr><td colspan="6">No Salesforce files were found.</td></tr>';

        return;
    }

    elements.filesTableBody.innerHTML =
        files
            .map(file => `
                <tr>
                    <td>
                        <strong>${escapeHtml(file.title)}</strong>
                        <small>${escapeHtml(file.id)}</small>
                    </td>
                    <td>${escapeHtml(file.fileType || '-')}</td>
                    <td>${formatBytes(file.contentSize)}</td>
                    <td>${formatDate(file.lastModifiedDate)}</td>
                    <td>${escapeHtml(file.ownerName || '-')}</td>
                    <td>
                        <div class="table-actions">
                            <button class="mini-button" data-file-action="preview" data-version-id="${escapeHtml(file.latestPublishedVersionId)}" data-title="${escapeHtml(file.title)}">Preview</button>
                            <button class="mini-button" data-file-action="download" data-version-id="${escapeHtml(file.latestPublishedVersionId)}" data-title="${escapeHtml(file.title)}">Download</button>
                            <button class="mini-button danger" data-file-action="delete" data-document-id="${escapeHtml(file.id)}" data-title="${escapeHtml(file.title)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `)
            .join('');
}

async function loadFiles() {

    if(!elements.filesTableBody) {

        return;
    }

    try {

        showResponseStatus('Loading');

        const response =
            await fetch('/api/salesforce/files');

        const data =
            await parseResponse(response);

        state.files =
            data.files || [];

        renderFilesTable(state.files);
        showResponseStatus(String(response.status));
        renderJson({
            count: state.files.length,
            files: state.files
        });

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

function previewFile(versionId, title) {

    elements.previewTitle.textContent =
        title || 'File preview';

    elements.filePreviewFrame.src =
        `/api/salesforce/files/${versionId}/download?disposition=inline`;

    resetResponse(
        `Previewing ${title || versionId}. Some file types may download instead of rendering inline.`
    );
}

function contentDispositionFileName(headers, fallbackName) {

    const disposition =
        headers.get('content-disposition') || '';

    const match =
        disposition.match(/filename="([^"]+)"/);

    return match?.[1] || fallbackName || 'salesforce-file';
}

async function downloadFile(versionId, fallbackName) {

    try {

        showResponseStatus('Loading');

        const response =
            await fetch(`/api/salesforce/files/${versionId}/download`);

        if(!response.ok) {

            await parseResponse(response);
        }

        const blob =
            await response.blob();

        const fileName =
            contentDispositionFileName(
                response.headers,
                fallbackName
            );

        if(window.showSaveFilePicker) {

            const handle =
                await window.showSaveFilePicker({
                    suggestedName: fileName
                });

            const writable =
                await handle.createWritable();

            await writable.write(blob);
            await writable.close();

        } else {

            const url =
                URL.createObjectURL(blob);

            const link =
                document.createElement('a');

            link.href =
                url;

            link.download =
                fileName;

            link.click();
            URL.revokeObjectURL(url);
        }

        showResponseStatus(String(response.status));
        renderJson({
            downloaded: true,
            fileName,
            size: blob.size
        });

    } catch(error) {

        if(error.name === 'AbortError') {

            resetResponse('Download was cancelled.');

            return;
        }

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

function readFileAsBase64(file) {

    return new Promise((resolve, reject) => {

        const reader =
            new FileReader();

        reader.onload =
            () => resolve(String(reader.result).split(',')[1]);

        reader.onerror =
            () => reject(reader.error);

        reader.readAsDataURL(file);
    });
}

async function uploadFile() {

    const file =
        elements.fileInput.files[0];

    if(!file) {

        alert('Choose a file to upload');

        return;
    }

    if(file.size > maxUploadBytes) {

        alert(`Choose a file smaller than ${formatBytes(maxUploadBytes)}`);

        return;
    }

    try {

        showResponseStatus('Loading');

        const base64Data =
            await readFileAsBase64(file);

        const response =
            await fetch('/api/salesforce/files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName: file.name,
                    title: elements.fileTitleInput.value.trim(),
                    recordId: elements.fileRecordIdInput.value.trim(),
                    base64Data
                })
            });

        const data =
            await parseResponse(response);

        showResponseStatus(String(response.status));
        renderJson(data);

        elements.fileInput.value =
            '';

        elements.fileTitleInput.value =
            '';

        await loadFiles();

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

async function deleteFile(contentDocumentId, title) {

    const confirmed =
        confirm(`Delete "${title}" from Salesforce Files? This removes the ContentDocument and its versions.`);

    if(!confirmed) {

        return;
    }

    try {

        showResponseStatus('Loading');

        const response =
            await fetch(
                `/api/salesforce/files/${contentDocumentId}`,
                {
                    method: 'DELETE'
                }
            );

        const data =
            await parseResponse(response);

        showResponseStatus(String(response.status));
        renderJson(data);
        await loadFiles();

    } catch(error) {

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

async function loadObjects() {

    try {

        const response =
            await fetch('/api/salesforce/objects');

        const data =
            await parseResponse(response);

        state.objects =
            data.objects;

        populateObjectSelect(state.objects);

        const defaultObject =
            state.objects.find(objectInfo =>
                objectInfo.name === 'Student__c'
            ) || state.objects[0];

        elements.objectSelect.value =
            defaultObject?.name || '';

        await setSelectedObject(
            defaultObject?.name
        );

        showResponseStatus('Idle');

        if(state.currentView !== 'org' && elements.responseContainer) {

            elements.responseContainer.textContent =
                `Selected ${selectedLabel()}. Choose a sidebar section and execute a request.`;
        }

    } catch(error) {

        elements.objectSelect.innerHTML =
            '<option value="">Unable to load sObjects</option>';

        renderError(
            error,
            error.status ? String(error.status) : 'Error'
        );
    }
}

document
    .querySelectorAll('.nav-button')
    .forEach(button => {

        button.addEventListener(
            'click',
            () => setCurrentView(button.dataset.view)
        );
    });

document
    .querySelectorAll('.method-tab')
    .forEach(button => {

        button.addEventListener(
            'click',
            () => {

                state.currentAction =
                    button.dataset.action;

                updateCrudControls();
                updateEndpoint();
                resetResponse(
                    `${button.textContent.trim()} is ready for ${selectedLabel()}. Execute the request to view JSON output.`
                );
            }
        );
    });

elements.objectSelect.addEventListener(
    'change',
    () => {

        state.currentAction =
            'get';

        setCurrentView('crud');
        setSelectedObject(elements.objectSelect.value);
    }
);

elements.executeCrudBtn.addEventListener(
    'click',
    executeCrud
);

elements.describeBtn.addEventListener(
    'click',
    executeDescribe
);

elements.queryBtn.addEventListener(
    'click',
    executeQuery
);

elements.refreshFilesBtn.addEventListener(
    'click',
    loadFiles
);

elements.refreshOrgBtn?.addEventListener(
    'click',
    loadOrgStatus
);

elements.sidebarToggleBtn?.addEventListener(
    'click',
    toggleSidebar
);

elements.showMoreOrgBtn?.addEventListener(
    'click',
    toggleOrgMoreMetrics
);

elements.uploadFileBtn.addEventListener(
    'click',
    uploadFile
);

elements.filesTableBody.addEventListener(
    'click',
    event => {

        const button =
            event.target.closest('button[data-file-action]');

        if(!button) {

            return;
        }

        const title =
            button.dataset.title;

        if(button.dataset.fileAction === 'preview') {

            previewFile(
                button.dataset.versionId,
                title
            );
        }

        if(button.dataset.fileAction === 'download') {

            downloadFile(
                button.dataset.versionId,
                title
            );
        }

        if(button.dataset.fileAction === 'delete') {

            deleteFile(
                button.dataset.documentId,
                title
            );
        }
    }
);

elements.queryInput.addEventListener(
    'input',
    updateEndpoint
);

updateCrudControls();
updateEndpoint();
updateSidebarToggle();
loadObjects();
