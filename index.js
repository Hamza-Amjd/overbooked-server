const express = require('express');
const ejs = require('ejs');
const path = require('path');
const cors = require('cors');
const app = express();


// Enable CORS (either globally or with specific origins)
app.use(cors({
    origin: 'http://localhost:5173',  // React development server
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

// Add preflight handling
app.options('*', cors());

// Set EJS as the view engine (for existing EJS routes, if any)
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' folder
app.use(express.static("public"));

// Serve static files from the 'uploads' folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// React build folder path
const reactBuildPath = path.join(__dirname, 'frontend', 'build');

// Serve React static files
app.use(express.static(reactBuildPath));

// Existing backend routes
app.use("/", require(path.join(__dirname, "./routes/routes.js")));

// EJS home route (can be replaced with React's equivalent later)
app.get('/home', (req, res) => {
    res.render('home');
});

// Fallback route for React
app.get('*', (req, res) => {
    res.sendFile(path.join(reactBuildPath, 'index.html'));
});

module.exports = app;
