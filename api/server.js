import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ember-api" });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`ember-api listening on ${port}`);
});
