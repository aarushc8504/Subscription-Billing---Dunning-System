
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

function authenticate(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Please log in to continue."
        });
    }

    try {
        req.user = jwt.verify(
            header.slice(7),
            process.env.JWT_SECRET
        );
        next();
    } catch {
        return res.status(401).json({
            message: "Session expired. Please log in again."
        });
    }
}

function publicUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
    };
}

router.use(authenticate);

router.get("/", async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        return res.json({
            user: publicUser(user)
        });
    } catch (error) {
        console.error("Profile fetch error:", error.message);

        return res.status(500).json({
            message: "Unable to load profile."
        });
    }
});

router.patch("/", async (req, res) => {
    try {
        const { name, email, phone } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof phone !== "string"
        ) {
            return res.status(400).json({
                message: "Name, email and phone must be provided as text."
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone.trim();

        if (cleanName.length < 2 || cleanName.length > 80) {
            return res.status(400).json({
                message: "Name must be between 2 and 80 characters."
            });
        }

        if (
            cleanEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                message: "Enter a valid email address."
            });
        }

        if (cleanPhone.length > 30) {
            return res.status(400).json({
                message: "Phone number is too long."
            });
        }

        const duplicate = await User.findOne({
            email: cleanEmail,
            _id: { $ne: req.user.id }
        });

        if (duplicate) {
            return res.status(409).json({
                message: "That email is already being used."
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            {
                $set: {
                    name: cleanName,
                    email: cleanEmail,
                    phone: cleanPhone
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        return res.json({
            message: "Profile updated successfully.",
            user: publicUser(user)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "That email is already being used."
            });
        }

        console.error("Profile update error:", error.message);

        return res.status(500).json({
            message: "Unable to update profile."
        });
    }
});

module.exports = router;
