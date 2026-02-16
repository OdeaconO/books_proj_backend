import "./env.js";
import upload from "./middleware/upload.js";
import { uploadToCloudinary } from "./utils/uploadToCloudinary.js";
import { db } from "./db.js";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import { verifyToken } from "./middleware/verifyToken.js";
import { authorizeBookOwner } from "./middleware/authorizeBookOwner.js";
import cloudinary from "./utils/cloudinary.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 300, // 300 requests per IP per 15 mins
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

const app = express();

app.use(limiter);
app.use("/auth", authLimiter);
app.use(morgan("combined"));

console.log("Cloudinary config OK:", cloudinary.config().cloud_name);

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ["https://kamitoshi.com", "https://www.kamitoshi.com"]
    : [
        "http://localhost:3000",
        "http://localhost:8800",
        "https://kamitoshi.com",
        "https://www.kamitoshi.com",
      ];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(helmet());
app.use(express.json());
app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.json("hello this is the backend");
});

app.get("/genres", async (req, res) => {
  const q = `
    SELECT DISTINCT genre
    FROM books
    WHERE genre IS NOT NULL
    ORDER BY genre ASC
  `;

  try {
    const { rows } = await db.query(q);
    const genres = rows.map((row) => row.genre);
    return res.status(200).json(genres);
  } catch (err) {
    console.error(err);
    return res.status(500).json([]);
  }
});

app.get("/books", async (req, res) => {
  const q = req.query.q || "";
  const genre = req.query.genre || null;

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  const SORT_MAP = {
    title: "books.title",
    created_at: "books.created_at",
  };

  const sort = SORT_MAP[req.query.sort] || SORT_MAP.title;
  const order = req.query.order === "desc" ? "DESC" : "ASC";

  const whereClauses = [];
  const params = [];

  // $1
  whereClauses.push(`books.title ILIKE $${params.length + 1}`);
  params.push(`%${q}%`);

  if (genre) {
    whereClauses.push(`books.genre = $${params.length + 1}`);
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
      books.description AS "desc",
      books.cover_id,
      books.cover_source,
      books.cover_url,
      books.created_by AS user_id,
      books.created_at,
      users.username
    FROM books
    LEFT JOIN users
      ON books.created_by = users.id
    WHERE ${whereSQL}
    ORDER BY ${sort} ${order}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  try {
    const { rows: countRows } = await db.query(countQuery, params);

    const totalBooks = parseInt(countRows[0].total, 10);
    const totalPages = Math.ceil(totalBooks / limit);

    const { rows: dataRows } = await db.query(dataQuery, [
      ...params,
      limit,
      offset,
    ]);

    return res.json({
      books: dataRows,
      pagination: {
        currentPage: page,
        totalPages,
        totalBooks,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json("Internal server error");
  }
});

app.get("/my-books", verifyToken, async (req, res) => {
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

  const whereClauses = [];
  const params = [];

  // user_id
  whereClauses.push(`user_books.user_id = $${params.length + 1}`);
  params.push(req.user.id);

  // title search
  whereClauses.push(`books.title ILIKE $${params.length + 1}`);
  params.push(`%${q}%`);

  if (genre) {
    whereClauses.push(`books.genre = $${params.length + 1}`);
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
      books.description AS "desc",
      books.cover_id,
      books.cover_source,
      books.cover_url,
      books.created_by AS user_id,
      books.created_at,
      users.username
    FROM user_books
    JOIN books ON books.id = user_books.book_id
    LEFT JOIN users ON books.created_by = users.id
    WHERE ${whereSQL}
    ORDER BY ${sort} ${order}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  try {
    const { rows: countRows } = await db.query(countQuery, params);

    const totalBooks = parseInt(countRows[0].total, 10);
    const totalPages = Math.ceil(totalBooks / limit);

    const { rows: dataRows } = await db.query(dataQuery, [
      ...params,
      limit,
      offset,
    ]);

    return res.json({
      books: dataRows,
      pagination: {
        currentPage: page,
        totalPages,
        totalBooks,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json([]);
  }
});

app.get("/books/:id", async (req, res) => {
  const bookId = req.params.id;

  const q = `
    SELECT
      books.id,
      books.title,
      books.authors,
      books.genre,
      books.description AS "desc",
      books.cover_id,
      books.cover_source,
      books.cover_url,
      books.created_by AS user_id,
      books.created_at,
      users.username
    FROM books
    LEFT JOIN users
      ON books.created_by = users.id
    WHERE books.id = $1
    LIMIT 1
  `;

  try {
    const { rows } = await db.query(q, [bookId]);

    if (rows.length === 0) {
      return res.status(404).json("Book not found");
    }

    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json("Failed to fetch book");
  }
});

app.get("/user-books/:bookId", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT 1
    FROM user_books
    WHERE user_id = $1 AND book_id = $2
    LIMIT 1
  `;

  try {
    const { rows } = await db.query(q, [userId, bookId]);
    return res.json(rows.length > 0);
  } catch (err) {
    console.error(err);
    return res.status(500).json(false);
  }
});

app.get("/reading-list/:bookId", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT 1
    FROM reading_list
    WHERE user_id = $1 AND book_id = $2
    LIMIT 1
  `;

  try {
    const { rows } = await db.query(q, [userId, bookId]);
    return res.json(rows.length > 0);
  } catch (err) {
    console.error(err);
    return res.status(500).json(false);
  }
});

app.get("/reading-list", verifyToken, async (req, res) => {
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

  const whereClauses = [];
  const params = [];

  // user_id
  whereClauses.push(`reading_list.user_id = $${params.length + 1}`);
  params.push(req.user.id);

  // title search
  whereClauses.push(`books.title ILIKE $${params.length + 1}`);
  params.push(`%${q}%`);

  if (genre) {
    whereClauses.push(`books.genre = $${params.length + 1}`);
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
      books.description AS "desc",
      books.cover_id,
      books.cover_source,
      books.cover_url,
      reading_list.currently_reading,
      reading_list.added_at
    FROM reading_list
    JOIN books ON books.id = reading_list.book_id
    WHERE ${whereSQL}
    ORDER BY ${sort} ${order}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  try {
    const { rows: countRows } = await db.query(countQuery, params);

    const totalBooks = parseInt(countRows[0].total, 10);
    const totalPages = Math.ceil(totalBooks / limit);

    const { rows: dataRows } = await db.query(dataQuery, [
      ...params,
      limit,
      offset,
    ]);

    return res.json({
      books: dataRows,
      pagination: {
        currentPage: page,
        totalPages,
        totalBooks,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json([]);
  }
});

app.put("/reading-list/:bookId/current", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const resetQuery = `
      UPDATE reading_list
      SET currently_reading = FALSE
      WHERE user_id = $1
    `;

    await client.query(resetQuery, [userId]);

    const setQuery = `
      UPDATE reading_list
      SET currently_reading = TRUE
      WHERE user_id = $1 AND book_id = $2
    `;

    const result = await client.query(setQuery, [userId, bookId]);

    if (result.rowCount === 0) {
      throw new Error("No rows updated");
    }

    await client.query("COMMIT");

    return res.status(200).json("Currently reading updated");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json("Failed to update reading state");
  } finally {
    client.release();
  }
});

app.get("/reading-list/:bookId/status", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT currently_reading
    FROM reading_list
    WHERE user_id = $1 AND book_id = $2
    LIMIT 1
  `;

  try {
    const { rows } = await db.query(q, [userId, bookId]);

    if (rows.length === 0) {
      return res.status(200).json({
        inReadingList: false,
        currentlyReading: false,
      });
    }

    return res.status(200).json({
      inReadingList: true,
      currentlyReading: rows[0].currently_reading,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      inReadingList: false,
      currentlyReading: false,
    });
  }
});

app.get("/book-actions/:bookId", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    SELECT
      EXISTS(
        SELECT 1 FROM user_books
        WHERE user_id = $1 AND book_id = $2
      ) AS "inMyBooks",
      EXISTS(
        SELECT 1 FROM reading_list
        WHERE user_id = $3 AND book_id = $4
      ) AS "inReadingList"
  `;

  try {
    const { rows } = await db.query(q, [userId, bookId, userId, bookId]);

    return res.status(200).json({
      inMyBooks: rows[0].inMyBooks,
      inReadingList: rows[0].inReadingList,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      inMyBooks: false,
      inReadingList: false,
    });
  }
});

app.post("/books", verifyToken, upload.single("cover"), async (req, res) => {
  try {
    const { title, authors, desc, genre } = req.body;

    if (!title) {
      return res.status(400).json("Title is required");
    }

    let coverUrl = null;

    if (req.file) {
      coverUrl = await uploadToCloudinary(req.file);
    }

    const coverSource = coverUrl ? "cloudinary" : "none";

    const insertQuery = `
      INSERT INTO books (
        title,
        authors,
        genre,
        description,
        cover_source,
        cover_url,
        source,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
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

    const { rows } = await db.query(insertQuery, values);
    const bookId = rows[0].id;

    const userBooksQuery = `
      INSERT INTO user_books (user_id, book_id, status)
      VALUES ($1, $2, 'owned')
      ON CONFLICT (user_id, book_id) DO NOTHING
    `;

    try {
      await db.query(userBooksQuery, [req.user.id, bookId]);
    } catch (ubErr) {
      console.error("USER_BOOKS ERROR:", ubErr);
    }

    return res.status(201).json({
      message: "Book created successfully",
      bookId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json("Book creation failed");
  }
});

app.post("/user-books", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json("bookId is required");
  }

  const q = `
    INSERT INTO user_books (user_id, book_id, status)
    VALUES ($1, $2, 'owned')
    ON CONFLICT (user_id, book_id) DO NOTHING
  `;

  try {
    await db.query(q, [userId, bookId]);
    return res.status(201).json("Added to My Books");
  } catch (err) {
    console.error(err);
    return res.status(500).json("Failed to add to My Books");
  }
});

app.post("/reading-list", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json("bookId is required");
  }

  const q = `
    INSERT INTO reading_list (user_id, book_id, currently_reading)
    VALUES ($1, $2, FALSE)
    ON CONFLICT (user_id, book_id) DO NOTHING
  `;

  try {
    await db.query(q, [userId, bookId]);
    return res.status(201).json("Added to Reading List");
  } catch (err) {
    console.error(err);
    return res.status(500).json("Failed to add to Reading List");
  }
});

app.delete("/books/:id", verifyToken, authorizeBookOwner, async (req, res) => {
  const bookId = req.params.id;

  const getQuery = `
    SELECT created_at
    FROM books
    WHERE id = $1
  `;

  try {
    const { rows } = await db.query(getQuery, [bookId]);

    if (rows.length === 0) {
      return res.status(404).json("Book not found");
    }

    const createdAt = new Date(rows[0].created_at);
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - createdAt > oneDay) {
      return res
        .status(403)
        .json("You can only delete this book within 24 hours of creation.");
    }

    const deleteQuery = `
      DELETE FROM books
      WHERE id = $1
    `;

    await db.query(deleteQuery, [bookId]);

    return res.status(200).json({
      message: "Book deleted successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json("Failed to delete book");
  }
});

app.delete("/user-books/:bookId", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    DELETE FROM user_books
    WHERE user_id = $1 AND book_id = $2
  `;

  try {
    await db.query(q, [userId, bookId]);
    return res.status(200).json("Removed from My Books");
  } catch (err) {
    console.error(err);
    return res.status(500).json("Failed to remove from My Books");
  }
});

app.delete("/reading-list/:bookId", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;

  const q = `
    DELETE FROM reading_list
    WHERE user_id = $1 AND book_id = $2
  `;

  try {
    await db.query(q, [userId, bookId]);
    return res.status(200).json("Removed from Reading List");
  } catch (err) {
    console.error(err);
    return res.status(500).json("Failed to remove from Reading List");
  }
});

app.put(
  "/books/:id",
  verifyToken,
  authorizeBookOwner,
  upload.single("cover"),
  async (req, res) => {
    try {
      const bookId = req.params.id;

      const timeCheckQuery = `
        SELECT created_at
        FROM books
        WHERE id = $1
      `;

      const { rows } = await db.query(timeCheckQuery, [bookId]);

      if (!rows || rows.length === 0) {
        return res.status(404).json("Book not found");
      }

      const createdAt = new Date(rows[0].created_at);
      const now = new Date();
      const oneDay = 24 * 60 * 60 * 1000;

      if (now - createdAt > oneDay) {
        return res
          .status(403)
          .json("You can only update this book within 24 hours of creation.");
      }

      const { title, authors, desc, genre } = req.body;

      let coverUrl = null;
      let coverSource = null;

      if (req.file) {
        coverUrl = await uploadToCloudinary(req.file);
        coverSource = "cloudinary";
      }

      const updateQuery = `
        UPDATE books
        SET
          title = $1,
          authors = $2,
          genre = $3,
          description = $4,
          cover_url = COALESCE($5, cover_url),
          cover_source = COALESCE($6, cover_source)
        WHERE id = $7
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

      await db.query(updateQuery, values);

      return res.status(200).json("Book updated successfully");
    } catch (error) {
      console.error(error);
      return res.status(500).json("Book update failed");
    }
  },
);

app.listen(process.env.PORT, () => {
  console.log("Backend running on port", process.env.PORT);
});
