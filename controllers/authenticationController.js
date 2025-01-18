const md5 = require('md5');
const User = require("../models/userModel.js");

// GET
// landing page for Overbooked
exports.getWelcome = function (req, res) {
    res.json({ message: "Welcome to Overbooked!" });
}

// GET
// login page
exports.getLogin = function (req, res) {
    res.json({ message: "Login page", dangerMessage: "true" });
}

// POST
// login authentication
exports.postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by username
        const user = await User.findOne({ email });
        
        // If user doesn't exist
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "No user found on this email"
            });
        }

        // Check password (assuming password is stored as plain text for now)
        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                message: "Invalid password"
            });
        }

        // Successful login
        res.json({
            success: true,
            user
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({
            success: false,
            message: "An error occurred during login"
        });
    }
};

// GET
// registration page
exports.getRegister = function (req, res) {
    res.json({ message: "Registration page", dangerMessage: "true" });
}

// POST
// registration page
exports.postRegister = async (req, res) => {
    try {
        const { username,email, password, isAdmin, adminCode } = req.body;

        // Check if trying to register as admin
        if (isAdmin) {
            // Verify against hardcoded admin code
            if (!adminCode || adminCode !== "4269") {
                return res.status(403).json({
                    success: false,
                    message: "Invalid admin registration code"
                });
            }
        }

        // Check if username already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists on this email"
            });
        }

        // Create new user
        const newUser = new User({
            username,
            password,
            email,
            isAdmin: isAdmin && adminCode === "4269"
        });

        await newUser.save();

        res.status(201).json({
            success: true,
            message: "Registration successful",
            user:newUser
        });
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({
            success: false,
            message: "An error occurred during registration"
        });
    }
};

