const express = require('express');
const axios = require('axios');

const router = express.Router();

function salesforceBaseUrl() {

    return `${process.env.SF_INSTANCE_URL}/services/data/${process.env.SF_API_VERSION}`;
}

function validateObjectName(apiName) {

    return /^[A-Za-z][A-Za-z0-9_]*$/.test(apiName);
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
