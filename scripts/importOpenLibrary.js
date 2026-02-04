import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { db } from "../db.js";

// ---- CONFIG ----
const CSV_PATH = path.join(process.cwd(), "data", "final_library_5.csv");
const BATCH_SIZE = 200; // Increased batch size for M4 efficiency

// ---- INSERT FUNCTION ----
const insertBatch = async (rows) => {
  if (rows.length === 0) return;

  // Map CSV columns to Database columns
  const values = rows.map((row) => [
    row.work_key,
    row.title,
    row.author_name, // Make sure this matches your CSV header exactly
    row.description,
    row.genre,
    "openlibrary", // cover_source
    row.cover_id,
    "openlibrary", // source
    null, // created_by
  ]);

  const sql = `
    INSERT IGNORE INTO books (
      work_key, title, authors, description, genre, 
      cover_source, cover_id, source, created_by
    ) VALUES ?
  `;

  return new Promise((resolve, reject) => {
    db.query(sql, [values], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows);
    });
  });
};

// ---- MAIN ----
const runImport = async () => {
  console.log("📚 Starting Optimized Open Library import...");
  console.log("CSV:", CSV_PATH);

  let batch = [];
  let totalRead = 0;
  let totalInserted = 0;

  try {
    const stream = fs.createReadStream(CSV_PATH).pipe(csv());

    // The Magic: This loop automatically pauses reading until the inside finishes!
    for await (const row of stream) {
      totalRead++;
      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        const count = await insertBatch(batch);
        totalInserted += count;
        batch = []; // Clear memory immediately

        if (totalRead % 5000 === 0) {
          console.log(`✔ Read: ${totalRead} | Inserted: ${totalInserted}`);
        }
      }
    }

    // Insert any remaining rows after the loop finishes
    if (batch.length > 0) {
      const count = await insertBatch(batch);
      totalInserted += count;
    }

    console.log("🎉 Import complete!");
    console.log(`Total rows read: ${totalRead}`);
    console.log(`Total rows inserted: ${totalInserted}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Fatal Error:", err);
    process.exit(1);
  }
};

runImport();
