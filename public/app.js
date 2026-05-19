const apiVersion = 'v64.0';

const state = {
    currentView: 'crud',
    currentAction: 'get',
    objects: [],
    selectedObject: null,
    describeCache: new Map()
};

const elements = {
    objectSelect: document.getElementById('objectSelect'),
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
    responseContainer: document.getElementById('responseContainer'),
    responseStatus: document.getElementById('responseStatus')
};

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

    elements.responseContainer.textContent =
        message;
}

function renderJson(data) {

    elements.responseContainer.textContent =
        JSON.stringify(
            data,
            null,
            2
        );
}

function renderError(error, status = 'Error') {

    showResponseStatus(status);

    elements.responseContainer.textContent =
        error.message;
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

    elements.endpointBox.textContent =
        crudEndpoint();
}

function updateObjectSummary() {

    elements.pageTitle.textContent =
        state.currentView === 'crud'
            ? 'sObject CRUD'
            : `${state.currentView[0].toUpperCase()}${state.currentView.slice(1)} API`;

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

    updateObjectSummary();
    updateCrudControls();
    updateEndpoint();

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
        resetResponse(
            `Selected ${selectedLabel()}. Execute a ${elements.pageTitle.textContent} request to view JSON output.`
        );

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
        elements.responseContainer.textContent =
            `Selected ${selectedLabel()}. Choose a sidebar section and execute a request.`;

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

elements.queryInput.addEventListener(
    'input',
    updateEndpoint
);

updateCrudControls();
updateEndpoint();
loadObjects();
