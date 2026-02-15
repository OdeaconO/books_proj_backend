import { db } from "../db.js";

export const authorizeBookOwner = async (req, res, next) => {
  const bookId = req.params.id;

  const q = `
    SELECT source, created_by
    FROM books
    WHERE id = $1
  `;

  try {
    const { rows } = await db.query(q, [bookId]);

    if (rows.length === 0) {
      return res.status(404).json("Book not found");
    }

    const book = rows[0];

    // Admin can modify anything
    if (req.user.role === "admin") {
      return next();
    }

    // Users can modify ONLY their own user-created books
    if (book.source === "user" && book.created_by === req.user.id) {
      return next();
    }

    return res.status(403).json("You are not allowed to modify this book");
  } catch (err) {
    console.error(err);
    return res.status(500).json("Database error");
  }
};
