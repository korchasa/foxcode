const express = require("express");
const app = express();
app.get("/", (_req, res) => res.send("Hello"));
app.listen(3000);
