// routes/links.js
const express = require('express');
const router = express.Router();
const db = require('../db');

const CODE_REGEX = /^[A-Za-z0-9]{6,8}$/;

// Validate URL
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Generate random code if user doesn’t provide
function generateRandomCode(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/*
----------------------------------
 POST /api/links
 Creates a short link
----------------------------------
*/
router.post('/links', async (req, res) => {
  const { url, code } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "Invalid or missing URL" });
  }

  if (code && !CODE_REGEX.test(code)) {
    return res.status(400).json({ error: "Code must match [A-Za-z0-9]{6,8}" });
  }

  const finalCode = code || generateRandomCode(6);

  try {
    const result = await db.query(
      `INSERT INTO links(code, url)
       VALUES($1, $2)
       RETURNING code, url, click_count, last_clicked, created_at`,
      [finalCode, url]
    );

    const row = result.rows[0];

    return res.status(201).json({
      ...row,
      short_url: `${process.env.BASE_URL}/${row.code}`
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Code already exists" });
    }
    console.log(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
----------------------------------
 GET /api/links
 List all shortened links
----------------------------------
*/
router.get('/links', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT code, url, click_count, last_clicked, created_at
       FROM links
       ORDER BY created_at DESC`
    );

    const rows = result.rows.map(r => ({
      ...r,
      short_url: `${process.env.BASE_URL}/${r.code}`
    }));

    return res.json(rows);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
----------------------------------
 GET /api/links/:code
 Get stats for one code
----------------------------------
*/
router.get('/links/:code', async (req, res) => {
  const { code } = req.params;

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: "Invalid code format" });
  }

  try {
    const result = await db.query(
      `SELECT code, url, click_count, last_clicked, created_at
       FROM links
       WHERE code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const row = result.rows[0];
    row.short_url = `${process.env.BASE_URL}/${row.code}`;

    return res.json(row);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
----------------------------------
 DELETE /api/links/:code
 Delete a short link
----------------------------------
*/
router.delete('/links/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const result = await db.query(
      `DELETE FROM links
       WHERE code = $1
       RETURNING code`,
      [code]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
----------------------------------
 Redirect route
 GET /:code
----------------------------------
*/
router.get('/:code', async (req, res) => {
  const { code } = req.params;

  if (!CODE_REGEX.test(code)) {
    return res.status(404).send("Not found");
  }

  try {
    await db.pool.query("BEGIN");

    const result = await db.query(
      `SELECT url FROM links
       WHERE code = $1
       FOR UPDATE`,
      [code]
    );

    if (result.rows.length === 0) {
      await db.pool.query("ROLLBACK");
      return res.status(404).send("Not found");
    }

    const target = result.rows[0].url;

    await db.query(
      `UPDATE links
       SET click_count = click_count + 1,
           last_clicked = NOW()
       WHERE code = $1`,
      [code]
    );

    await db.pool.query("COMMIT");
    return res.redirect(302, target);

  } catch (err) {
    console.log(err);
    await db.pool.query("ROLLBACK");
    return res.status(500).send("Internal server error");
  }
});

module.exports = router;
