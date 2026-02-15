import express from "express";
import bcrypt from "bcrypt";
import { db } from "../db.js";
import jwt from "jsonwebtoken";

const router = express.Router();

/**
 * REGISTER
 */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const q = `
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, role, created_at
    `;

    const { rows } = await db.query(q, [username, email, hashedPassword]);

    return res.status(201).json("User registered successfully");
  } catch (err) {
    console.error(err);
    return res.status(500).json(err.message);
  }
});

/**
 * LOGIN
 */
router.post("/login", async (req, res) => {
  try {
    const q = `
      SELECT *
      FROM users
      WHERE email = $1
      LIMIT 1
    `;

    const { rows } = await db.query(q, [req.body.email]);

    if (rows.length === 0) {
      return res.status(404).json("User not found");
    }

    const user = rows[0];

    const isPasswordCorrect = bcrypt.compareSync(
      req.body.password,
      user.password,
    );

    if (!isPasswordCorrect) {
      return res.status(400).json("Wrong email or password");
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    const { password, ...otherDetails } = user;

    return res.status(200).json({
      ...otherDetails,
      token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json(err.message);
  }
});

export default router;
