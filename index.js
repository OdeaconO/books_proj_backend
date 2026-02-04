import "./env.js";
console.log("ENV CLOUDINARY_URL:", process.env.CLOUDINARY_URL);
import upload from "./middleware/upload.js";
import { uploadToCloudinary } from "./utils/uploadToCloudinary.js";
import { db } from "./db.js";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import { verifyToken } from "./middleware/verifyToken.js";
import { authorizeBookOwner } from "./middleware/authorizeBookOwner.js";
import cloudinary from "./utils/cloudinary.js";

console.log("Cloudinary config OK:", cloudinary.config().cloud_name);

const app = express();

// if there is a authentication problem
// ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '@Admin123';
// or simply import mysql2

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.json("hello this is the backend");
});

app.get("/genres", (req, res) => {
  const q = `
    SELECT DISTINCT genre
    FROM books
    WHERE genre IS NOT NULL
    ORDER BY genre ASC
  `;

  db.query(q, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }

    // Flatten into string array
    const genres = data.map((row) => row.genre);

    return res.status(200).json(genres);
  });
});

app.get("/books", (req, res) => {
  const q = req.query.q || "";
  const genre = req.query.genre || null;

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  // Whitelisted sorting
  const SORT_MAP = {
    title: "books.title",
    created_at: "books.created_at",
  };

  const sort = SORT_MAP[req.query.sort] || SORT_MAP.title;
  const order = req.query.order === "desc" ? "DESC" : "ASC";

  // WHERE clause construction
  const whereClauses = [`books.title LIKE ?`];
  const params = [`%${q}%`];

  if (genre) {
    whereClauses.push(`books.genre = ?`);
    params.push(genre);
  }

  const whereSQL = whereClauses.join(" AND ");

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM books
    WHERE ${whereSQL}
  `;

  const dataQuery = `
    SELECT
      books.id,
      books.title,
      books.authors,
      books.genre,
      books.description AS \`desc\`,
      books.cover_id,
      books.cover_source,
      books.cover_url,
      books.created_by AS user_id,
      users.username
    FROM books
    LEFT JOIN users
      ON books.created_by = users.id
    WHERE ${whereSQL}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `;

  db.query(countQuery, params, (err, countResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json(err);
    }

    const totalBooks = countResult[0].total;
    const totalPages = Math.ceil(totalBooks / limit);

    db.query(dataQuery, [...params, limit, offset], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json(err);
      }

      return res.json({
        books: data,
        pagination: {
          currentPage: page,
          totalPages,
          totalBooks,
        },
      });
    });
  });
});

app.get("/my-books", verifyToken, (req, res) => {
  const q = req.query.q || "";
  const genre = req.query.genre || null;

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  const SORT_MAP = {
    title: "books.title",
    created_at: "user_books.added_at",
  };

  const sort = SORT_MAP[req.query.sort] || SORT_MAP.created_at;
  const order = req.query.order === "asc" ? "ASC" : "DESC";

  const whereClauses = [`user_books.user_id = ?`, `books.title LIKE ?`];

  const params = [req.user.id, `%${q}%`];

  if (genre) {
    whereClauses.push(`books.genre = ?`);
    params.push(genre);
  }

  const whereSQL = whereClauses.join(" AND ");

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM user_books
    JOIN books ON books.id = user_books.book_id
    WHERE ${whereSQL}
  `;

  const dataQuery = `
    SELECT
      books.id,
      books.title,
      books.authors,
      books.genre,
      books.description AS \`desc\`,
      books.cover_id,
      books.cover_source,
      books.cover_url,
      books.created_by AS user_id,
      users.username
    FROM user_books
    JOIN books ON books.id = user_books.book_id
    LEFT JOIN users ON books.created_by = users.id
    WHERE ${whereSQL}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `;

  db.query(countQuery, params, (err, countResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }

    const totalBooks = countResult[0].total;
    const totalPages = Math.ceil(totalBooks / limit);

    db.query(dataQuery, [...params, limit, offset], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json([]);
      }

      return res.json({
        books: data,
        pagination: {
          currentPage: page,
          totalPages,
          totalBooks,
        },
      });
    });
  });
});

app.get("/books/:id", (req, res) => {
  const bookId = req.params.id;

  const q = `
    SELECT
      books.id,
      books.title,
      books.authors,
      books.genre,
      books.description AS \`desc\`,
      books.cover_id,
      books.cover_source,
      books.cover_url,
      books.created_by AS user_id,
      users.username
    FROM books
    LEFT JOIN users
      ON books.created_by = users.id
    WHERE books.id = ?
    LIMIT 1
  `;

  db.query(q, [bookId], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Failed to fetch book");
    }

    if (data.length === 0) {
      return res.status(404).json("Book not found");
    }

    return res.status(200).json(data[0]);
  });
});

app.get("/user-books/:bookId", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT 1
    FROM user_books
    WHERE user_id = ? AND book_id = ?
    LIMIT 1
  `;

  db.query(q, [userId, bookId], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json(false);
    }

    return res.json(data.length > 0);
  });
});

app.get("/reading-list/:bookId", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT 1
    FROM reading_list
    WHERE user_id = ? AND book_id = ?
    LIMIT 1
  `;

  db.query(q, [userId, bookId], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json(false);
    }

    return res.json(data.length > 0);
  });
});

app.get("/reading-list", verifyToken, (req, res) => {
  const q = req.query.q || "";
  const genre = req.query.genre || null;

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  const SORT_MAP = {
    title: "books.title",
    created_at: "reading_list.added_at",
  };

  const sort = SORT_MAP[req.query.sort] || SORT_MAP.created_at;
  const order = req.query.order === "asc" ? "ASC" : "DESC";

  const whereClauses = [`reading_list.user_id = ?`, `books.title LIKE ?`];

  const params = [req.user.id, `%${q}%`];

  if (genre) {
    whereClauses.push(`books.genre = ?`);
    params.push(genre);
  }

  const whereSQL = whereClauses.join(" AND ");

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM reading_list
    JOIN books ON books.id = reading_list.book_id
    WHERE ${whereSQL}
  `;

  const dataQuery = `
    SELECT
      books.id,
      books.title,
      books.authors,
      books.genre,
      books.description AS \`desc\`,
      books.cover_id,
      books.cover_source,
      books.cover_url,
      reading_list.currently_reading,
      reading_list.added_at
    FROM reading_list
    JOIN books ON books.id = reading_list.book_id
    WHERE ${whereSQL}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `;

  db.query(countQuery, params, (err, countResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }

    const totalBooks = countResult[0].total;
    const totalPages = Math.ceil(totalBooks / limit);

    db.query(dataQuery, [...params, limit, offset], (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json([]);
      }

      return res.json({
        books: data,
        pagination: {
          currentPage: page,
          totalPages,
          totalBooks,
        },
      });
    });
  });
});

app.put("/reading-list/:bookId/current", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  db.beginTransaction((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Transaction failed");
    }

    // Reset all
    const resetQuery = `
      UPDATE reading_list
      SET currently_reading = 0
      WHERE user_id = ?
    `;

    db.query(resetQuery, [userId], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error(err);
          res.status(500).json("Failed to reset reading state");
        });
      }

      // Set selected book
      const setQuery = `
        UPDATE reading_list
        SET currently_reading = 1
        WHERE user_id = ? AND book_id = ?
      `;

      db.query(setQuery, [userId, bookId], (err, result) => {
        if (err || result.affectedRows === 0) {
          return db.rollback(() => {
            console.error(err);
            res.status(500).json("Failed to set current book");
          });
        }

        // Commit
        db.commit((err) => {
          if (err) {
            return db.rollback(() => {
              console.error(err);
              res.status(500).json("Commit failed");
            });
          }

          return res.status(200).json("Currently reading updated");
        });
      });
    });
  });
});

app.get("/reading-list/:bookId/status", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT currently_reading
    FROM reading_list
    WHERE user_id = ? AND book_id = ?
    LIMIT 1
  `;

  db.query(q, [userId, bookId], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        inReadingList: false,
        currentlyReading: false,
      });
    }

    if (data.length === 0) {
      return res.status(200).json({
        inReadingList: false,
        currentlyReading: false,
      });
    }

    return res.status(200).json({
      inReadingList: true,
      currentlyReading: Boolean(data[0].currently_reading),
    });
  });
});

app.get("/book-actions/:bookId", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT
      EXISTS(
        SELECT 1 FROM user_books
        WHERE user_id = ? AND book_id = ?
      ) AS inMyBooks,
      EXISTS(
        SELECT 1 FROM reading_list
        WHERE user_id = ? AND book_id = ?
      ) AS inReadingList
  `;

  db.query(q, [userId, bookId, userId, bookId], (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        inMyBooks: false,
        inReadingList: false,
      });
    }

    return res.status(200).json({
      inMyBooks: Boolean(data[0].inMyBooks),
      inReadingList: Boolean(data[0].inReadingList),
    });
  });
});

app.post("/books", verifyToken, upload.single("cover"), async (req, res) => {
  try {
    const { title, authors, desc, genre } = req.body;

    if (!title) {
      return res.status(400).json("Title is required");
    }

    let coverUrl = null;

    // If user uploaded an image, upload to Cloudinary
    if (req.file) {
      console.log("Uploading to Cloudinary...");
      coverUrl = await uploadToCloudinary(req.file);
      console.log("Cloudinary URL:", coverUrl);
    }

    const coverSource = coverUrl ? "cloudinary" : "none";

    const q = `
        INSERT INTO books (
          title,
          authors,
          genre,
          description,
          cover_source,
          cover_url,
          source,
          created_by
        ) VALUES (?)
      `;

    const values = [
      title,
      authors || "Unknown",
      genre || null,
      desc || null,
      coverSource,
      coverUrl,
      "user",
      req.user.id,
    ];

    db.query(q, [values], (err, result) => {
      if (err) {
        console.error("MYSQL ERROR:", err);
        return res.status(500).json(err.sqlMessage);
      }

      const bookId = result.insertId;

      // 🔹 Automatically add to user_books
      const userBooksQuery = `
    INSERT INTO user_books (user_id, book_id, status)
    VALUES (?, ?, 'owned')
  `;

      db.query(userBooksQuery, [req.user.id, bookId], (ubErr) => {
        if (ubErr) {
          console.error("USER_BOOKS ERROR:", ubErr);
          // We do NOT rollback book creation
          // Ownership insert failing is non-fatal
        }

        return res.status(201).json({
          message: "Book created successfully",
          bookId,
        });
      });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json("Book creation failed");
  }
});

app.post("/user-books", verifyToken, (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json("bookId is required");
  }

  const q = `
    INSERT IGNORE INTO user_books (user_id, book_id, status)
    VALUES (?, ?, 'owned')
  `;

  db.query(q, [userId, bookId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Failed to add to My Books");
    }

    return res.status(201).json("Added to My Books");
  });
});

app.post("/reading-list", verifyToken, (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json("bookId is required");
  }

  const q = `
    INSERT IGNORE INTO reading_list (user_id, book_id, currently_reading)
    VALUES (?, ?, 0)
  `;

  db.query(q, [userId, bookId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Failed to add to Reading List");
    }

    return res.status(201).json("Added to Reading List");
  });
});

app.delete("/books/:id", verifyToken, authorizeBookOwner, (req, res) => {
  const bookId = req.params.id;

  const q = "DELETE FROM books WHERE id = ?";

  db.query(q, [bookId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Failed to delete book");
    }

    if (result.affectedRows === 0) {
      return res.status(404).json("Book not found");
    }

    return res.status(200).json({
      message: "Book deleted successfully",
    });
  });
});

app.delete("/user-books/:bookId", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    DELETE FROM user_books
    WHERE user_id = ? AND book_id = ?
  `;

  db.query(q, [userId, bookId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Failed to remove from My Books");
    }

    return res.status(200).json("Removed from My Books");
  });
});

app.delete("/reading-list/:bookId", verifyToken, (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    DELETE FROM reading_list
    WHERE user_id = ? AND book_id = ?
  `;

  db.query(q, [userId, bookId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json("Failed to remove from Reading List");
    }

    return res.status(200).json("Removed from Reading List");
  });
});

app.put(
  "/books/:id",
  verifyToken,
  authorizeBookOwner,
  upload.single("cover"),
  async (req, res) => {
    try {
      const bookId = req.params.id;
      const { title, authors, desc, genre } = req.body;

      let coverUrl = null;
      let coverSource = null;

      // If user uploaded a new cover, upload to Cloudinary
      if (req.file) {
        console.log("Uploading new cover to Cloudinary...");
        coverUrl = await uploadToCloudinary(req.file);
        coverSource = "cloudinary";
      }

      const q = `
        UPDATE books
        SET
          title = ?,
          authors = ?,
          genre = ?,
          description = ?,
          cover_url = COALESCE(?, cover_url),
          cover_source = COALESCE(?, cover_source)
        WHERE id = ?
      `;

      const values = [
        title,
        authors || "Unknown",
        genre || null,
        desc || null,
        coverUrl,
        coverSource,
        bookId,
      ];

      db.query(q, values, (err) => {
        if (err) {
          console.error("MYSQL ERROR:", err);
          return res.status(500).json("Failed to update book");
        }

        return res.status(200).json("Book updated successfully");
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json("Book update failed");
    }
  },
);

app.listen(process.env.PORT, () => {
  console.log("Backend running on port", process.env.PORT);
});
