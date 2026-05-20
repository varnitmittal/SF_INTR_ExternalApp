const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({
    limit: '40mb'
}));
app.use(express.static('public'));

const salesforceRoutes = require('./services/salesforce');

app.use('/api/salesforce', salesforceRoutes);

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
