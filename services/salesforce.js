/*
|--------------------------------------------------------------------------
| activateTab(tab, method)
|--------------------------------------------------------------------------
|
| This function controls the API UI behavior when a method tab
| (GET / POST / PATCH / DELETE) is clicked.
|
| Parameters:
| - tab    → the button element that was clicked
| - method → HTTP method represented by that button
|
| Flow:
|
| 1. resetTabs()
|    Removes active styling from all tabs so only one tab
|    appears selected at a time.
|
| 2. currentMethod = method
|    Stores the currently selected HTTP method globally.
|    This is later used when Execute Request button is clicked.
|
| 3. Active tab styling
|    Removes inactive Tailwind classes and adds active
|    blue styling to the selected tab.
|
| 4. Request body visibility
|    POST and PATCH requests require request payload/body,
|    so textarea is shown.
|
|    GET and DELETE usually do not require request body,
|    so textarea is hidden.
|
| 5. Endpoint display update
|    Updates endpoint box dynamically based on selected
|    REST method so UI reflects actual Salesforce REST API
|    endpoint structure.
|
| Why this architecture?
|
| Instead of hardcoding separate UI for each REST method,
| one centralized function controls:
| - UI state
| - active method
| - request body visibility
| - endpoint display
|
| This makes the frontend scalable for:
| - Query APIs
| - Composite APIs
| - Apex REST
| - Files APIs
| - future Salesforce integrations
|
*/





const express = require('express');
const axios = require('axios');

const router = express.Router();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function salesforceBaseUrl() {

    return `${process.env.SF_INSTANCE_URL}/services/data/${process.env.SF_API_VERSION}`;
}

function validateObjectName(apiName) {

    return /^[A-Za-z][A-Za-z0-9_]*$/.test(apiName);
}

function validateSalesforceId(id) {

    return /^[A-Za-z0-9]{15,18}$/.test(id);
}

function sanitizeFileName(fileName) {

    return String(fileName || 'salesforce-file')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 180);
}

function estimateBase64Bytes(base64Data) {

    const padding =
        base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;

    return Math.floor((base64Data.length * 3) / 4) - padding;
}

function mimeTypeFromContentVersion(metadata) {

    const extension =
        String(metadata?.FileExtension || '')
            .toLowerCase()
            .trim();

    const fileType =
        String(metadata?.FileType || '')
            .toLowerCase()
            .trim();

    const byExtension = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        txt: 'text/plain; charset=utf-8',
        csv: 'text/csv; charset=utf-8',
        json: 'application/json; charset=utf-8'
    };

    const byFileType = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        text: 'text/plain; charset=utf-8',
        csv: 'text/csv; charset=utf-8'
    };

    return (
        byExtension[extension] ||
        byFileType[fileType] ||
        null
    );
}

function handleSalesforceError(res, error) {

    res.status(error.response?.status || 500).json({
        error:
            error.response?.data || error.message
    });
}

async function getAccessToken() {

    const params = new URLSearchParams();

    params.append(
        'grant_type',
        'client_credentials'
    );

    params.append(
        'client_id',
        process.env.SF_CLIENT_ID
    );

    params.append(
        'client_secret',
        process.env.SF_CLIENT_SECRET
    );

    const response = await axios.post(
        `${process.env.SF_LOGIN_URL}/services/oauth2/token`,
        params,
        {
            headers: {
                'Content-Type':
                    'application/x-www-form-urlencoded'
            }
        }
    );

    return response.data.access_token;
}

async function salesforceRequest(config) {

    const token = await getAccessToken();

    return axios({
        ...config,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(config.headers || {})
        }
    });
}

router.get('/objects', async (req, res) => {

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects`
            });

        const objects =
            response.data.sobjects
                .map(objectInfo => ({
                    name: objectInfo.name,
                    label: objectInfo.label,
                    labelPlural: objectInfo.labelPlural,
                    createable: objectInfo.createable,
                    updateable: objectInfo.updateable,
                    deletable: objectInfo.deletable,
                    queryable: objectInfo.queryable,
                    retrieveable: objectInfo.retrieveable,
                    searchable: objectInfo.searchable,
                    custom: objectInfo.custom
                }))
                .sort((left, right) =>
                    left.label.localeCompare(right.label)
                );

        res.json({
            objects
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/limits', async (req, res) => {

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/limits`
            });

        res.json(response.data);

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/objects/:apiName/describe', async (req, res) => {

    const { apiName } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/${apiName}/describe`
            });

        res.json(response.data);

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/files', async (req, res) => {

    try {

        const query = `
            SELECT Id, Title, FileType, ContentSize, CreatedDate,
                LastModifiedDate, LatestPublishedVersionId, Owner.Name
            FROM ContentDocument
            ORDER BY LastModifiedDate DESC
            LIMIT 100
        `;

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/query`,
                params: {
                    q: query.replace(/\s+/g, ' ').trim()
                }
            });

        const files =
            response.data.records.map(file => ({
                id: file.Id,
                title: file.Title,
                fileType: file.FileType,
                contentSize: file.ContentSize,
                createdDate: file.CreatedDate,
                lastModifiedDate: file.LastModifiedDate,
                latestPublishedVersionId: file.LatestPublishedVersionId,
                ownerName: file.Owner?.Name || '-'
            }));

        res.json({
            files
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/files/:versionId/download', async (req, res) => {

    const { versionId } = req.params;

    if(!validateSalesforceId(versionId)) {

        res.status(400).json({
            error: 'Invalid ContentVersion Id'
        });

        return;
    }

    try {

        const metadata =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/ContentVersion/${versionId}`,
                params: {
                    fields: 'Title,FileExtension,FileType,ContentSize'
                }
            });

        const fileResponse =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/ContentVersion/${versionId}/VersionData`,
                responseType: 'arraybuffer'
            });

        const fileName =
            sanitizeFileName(
                [
                    metadata.data.Title,
                    metadata.data.FileExtension
                ].filter(Boolean).join('.')
            );

        const disposition =
            req.query.disposition === 'inline' ? 'inline' : 'attachment';

        const inferredMimeType =
            mimeTypeFromContentVersion(metadata.data);

        res.set({
            'Content-Type':
                inferredMimeType ||
                fileResponse.headers['content-type'] ||
                'application/octet-stream',
            'Content-Length':
                fileResponse.data.byteLength,
            'Content-Disposition':
                `${disposition}; filename="${fileName}"`
        });

        res.send(Buffer.from(fileResponse.data));

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.post('/files', async (req, res) => {

    const {
        title,
        fileName,
        base64Data,
        recordId
    } = req.body;

    if(!fileName || !base64Data) {

        res.status(400).json({
            error: 'File name and file data are required'
        });

        return;
    }

    if(recordId && !validateSalesforceId(recordId)) {

        res.status(400).json({
            error: 'Invalid related record Id'
        });

        return;
    }

    const normalizedBase64 =
        String(base64Data).replace(/^data:.*;base64,/, '');

    if(estimateBase64Bytes(normalizedBase64) > MAX_UPLOAD_BYTES) {

        res.status(413).json({
            error: `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit for this tool`
        });

        return;
    }

    try {

        const safeFileName =
            sanitizeFileName(fileName);

        const payload = {
            Title: String(title || safeFileName.replace(/\.[^.]+$/, '')).slice(0, 255),
            PathOnClient: safeFileName,
            VersionData: normalizedBase64
        };

        if(recordId) {

            payload.FirstPublishLocationId =
                recordId;
        }

        const createResponse =
            await salesforceRequest({
                method: 'POST',
                url: `${salesforceBaseUrl()}/sobjects/ContentVersion`,
                data: payload
            });

        const versionResponse =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/ContentVersion/${createResponse.data.id}`,
                params: {
                    fields: 'Id,ContentDocumentId,Title,FileType,ContentSize,CreatedDate'
                }
            });

        res.status(201).json({
            success: true,
            file: versionResponse.data
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.delete('/files/:contentDocumentId', async (req, res) => {

    const { contentDocumentId } = req.params;

    if(!validateSalesforceId(contentDocumentId)) {

        res.status(400).json({
            error: 'Invalid ContentDocument Id'
        });

        return;
    }

    try {

        await salesforceRequest({
            method: 'DELETE',
            url: `${salesforceBaseUrl()}/sobjects/ContentDocument/${contentDocumentId}`
        });

        res.json({
            success: true,
            message: 'File deleted successfully',
            id: contentDocumentId
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/sobjects/:apiName/updated', async (req, res) => {

    const { apiName } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    const end =
        new Date();

    const start =
        new Date(end.getTime() - 24 * 60 * 60 * 1000);

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/${apiName}/updated`,
                params: {
                    start: start.toISOString(),
                    end: end.toISOString()
                }
            });

        res.json(response.data);

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/sobjects/:apiName/deleted', async (req, res) => {

    const { apiName } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    const end =
        new Date();

    const start =
        new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/${apiName}/deleted`,
                params: {
                    start: start.toISOString(),
                    end: end.toISOString()
                }
            });

        const deletedRecords =
            [...(response.data.deletedRecords || [])]
                .sort((left, right) =>
                    new Date(right.deletedDate) - new Date(left.deletedDate)
                );

        res.json({
            ...response.data,
            deletedRecords
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/sobjects/:apiName/:id', async (req, res) => {

    const { apiName, id } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/sobjects/${apiName}/${id}`
            });

        res.json(response.data);

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.post('/sobjects/:apiName', async (req, res) => {

    const { apiName } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    try {

        const response =
            await salesforceRequest({
                method: 'POST',
                url: `${salesforceBaseUrl()}/sobjects/${apiName}`,
                data: req.body
            });

        res.status(201).json(response.data);

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.patch('/sobjects/:apiName/:id', async (req, res) => {

    const { apiName, id } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    try {

        await salesforceRequest({
            method: 'PATCH',
            url: `${salesforceBaseUrl()}/sobjects/${apiName}/${id}`,
            data: req.body
        });

        res.json({
            success: true,
            message: `${apiName} record updated successfully`,
            id
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.delete('/sobjects/:apiName/:id', async (req, res) => {

    const { apiName, id } = req.params;

    if(!validateObjectName(apiName)) {

        res.status(400).json({
            error: 'Invalid sObject API name'
        });

        return;
    }

    try {

        await salesforceRequest({
            method: 'DELETE',
            url: `${salesforceBaseUrl()}/sobjects/${apiName}/${id}`
        });

        res.json({
            success: true,
            message: `${apiName} record deleted successfully`,
            id
        });

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

router.get('/query', async (req, res) => {

    const { q } = req.query;

    if(!q) {

        res.status(400).json({
            error: 'Missing SOQL query'
        });

        return;
    }

    try {

        const response =
            await salesforceRequest({
                method: 'GET',
                url: `${salesforceBaseUrl()}/query`,
                params: {
                    q
                }
            });

        res.json(response.data);

    } catch(error) {

        handleSalesforceError(res, error);
    }
});

module.exports = router;
