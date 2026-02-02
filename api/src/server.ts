// api/src/server.ts
import "./env.js";
import app from "./app.js";

const port = Number(process.env.PORT || 8080);

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

app.listen(port, () => console.log(`ember-api listening on ${port}`));

