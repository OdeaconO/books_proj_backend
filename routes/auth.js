import express from "express";
import bcrypt from "bcrypt";
import { db } from "../db.js";
import jwt from "jsonwebtoken";

const router = express.Router();

/**
 * REGISTER
 */
router.post("/register", (req, res) => {
  const q = "INSERT INTO users (`username`, `email`, `password`) VALUES (?)";

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(req.body.password, salt);

  const values = [req.body.username, req.body.email, hashedPassword];

  db.query(q, [values], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(201).json("User registered successfully");
  });
});

/**
 * LOGIN
 */
router.post("/login", (req, res) => {
  const q = "SELECT * FROM users WHERE email = ?";

  db.query(q, [req.body.email], (err, data) => {
    if (err) return res.status(500).json(err);

    // user not found
    if (data.length === 0) {
      return res.status(404).json("User not found");
    }

    const user = data[0];

    // compare password
    const isPasswordCorrect = bcrypt.compareSync(
      req.body.password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(400).json("Wrong email or password");
    }

    // create JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // remove password before sending response
    const { password, ...otherDetails } = user;

    res.status(200).json({
      ...otherDetails,
      token,
    });
  });
});

export default router;
